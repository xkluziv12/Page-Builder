import { db, mcUrlRegistryTable, type McRun } from "@workspace/db";
import {
  ClaudeEngine,
  ReplitEngine,
  createJoomlaPublisher,
  buildRegistry,
  DEFAULT_SACRED_LINKS,
  DEFAULT_IMAGE_LIBRARY,
  DEFAULT_INDUSTRY_LINKS,
  DEFAULT_URL_ALLOWLIST,
  type AIEngine,
  type RegistryLink,
  type RunContext,
  type UrlRegistry,
} from "@workspace/mc-core";
import { logger } from "./logger";

type AnthropicClient = ConstructorParameters<typeof ClaudeEngine>[0];

/**
 * Lazily resolve the Anthropic client via dynamic import. The integration
 * module throws at import time when its env vars are missing; loading it lazily
 * (and only when a Claude phase actually runs) means a missing Anthropic
 * integration fails just that phase, not the whole API server at startup — the
 * mc routes are mounted unconditionally alongside unrelated endpoints.
 */
let cachedAnthropic: AnthropicClient | null = null;
async function getAnthropic(): Promise<AnthropicClient> {
  if (cachedAnthropic === null) {
    const mod = await import("@workspace/integrations-anthropic-ai");
    cachedAnthropic = mod.anthropic as AnthropicClient;
  }
  return cachedAnthropic;
}

const PHASE_ORDER = ["research", "build", "audit", "schema", "publish"] as const;
export type PhaseName = (typeof PHASE_ORDER)[number];

export type PhaseStatus =
  | "locked"
  | "ready"
  | "running"
  | "review"
  | "approved"
  | "failed";

/** One rung of the per-run phase ladder rendered by the dashboard. */
export interface PhaseLadderEntry {
  phase: PhaseName;
  status: PhaseStatus;
  summary: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export const publisher = createJoomlaPublisher({
  endpoint: process.env.JOOMLA_PUBLISH_URL,
  token: process.env.JOOMLA_PUBLISH_TOKEN,
});

/**
 * Engines a run can be created with.
 *
 * - `claude` — Dashboard mode: the server auto-runs each phase by calling the
 *   Anthropic API (a synchronous {@link AIEngine}).
 * - `replit` — Replit mode: an operator drives Replit's own Agent, which
 *   produces each artifact; the operator submits it through the Replit phase
 *   endpoint. The server never calls an external model for these runs.
 */
export const SUPPORTED_ENGINES = ["claude", "replit"] as const;

/**
 * Resolve the engine used by the server's *auto-run* path (Dashboard mode).
 * Only Claude is auto-runnable: Replit runs are operator-driven and supply their
 * own {@link ReplitEngine} per phase via the Replit submit endpoint, so they
 * never go through this resolver. Calling it for "replit" therefore fails loudly
 * rather than silently mislabeling provenance.
 */
export async function engineFor(engine: string): Promise<AIEngine> {
  if (engine === "claude") {
    return new ClaudeEngine(await getAnthropic());
  }
  if (engine === "replit") {
    throw new Error(
      `Replit-mode runs are operator-driven and cannot be auto-run by the server. The Replit Agent must submit each phase's artifact via the Replit run-book (POST /mc/runs/:id/phases/:phase/replit).`,
    );
  }
  throw new Error(
    `Engine "${engine}" is not supported. Available engines: ${SUPPORTED_ENGINES.join(", ")}.`,
  );
}

/** Build a Replit-mode engine seeded with operator-produced artifacts. */
export function replitEngineFor(content: {
  html?: string;
  schema?: string;
}): AIEngine {
  return new ReplitEngine({
    build: content.html,
    audit: content.html,
    chat: content.html,
    schema: content.schema,
  });
}

/** Load the merged, DB-seeded safeguard registry. */
export async function loadRegistry(
  handoffUrls: string[] = [],
  existingUrls: string[] = [],
): Promise<UrlRegistry> {
  const rows = await db.select().from(mcUrlRegistryTable);
  const active = rows.filter((r) => r.active);
  const byKind = (kind: string): RegistryLink[] =>
    active
      .filter((r) => r.kind === kind)
      .map((r) => ({ label: r.label, url: r.url }));

  const sacred = byKind("sacred");
  const image = byKind("image");
  const industry = byKind("industry");
  const allowlist = byKind("allowlist");

  return buildRegistry({
    sacredLinks: sacred.length > 0 ? sacred : undefined,
    imageLibrary: image.length > 0 ? image : undefined,
    industryLinks: industry.length > 0 ? industry : undefined,
    allowlist: allowlist.length > 0 ? allowlist : undefined,
    handoffUrls,
    existingUrls,
  });
}

/**
 * Idempotently seed the DB-backed safeguard registry with the deterministic STS
 * baseline (sacred equipment links, verified image library, industry links) so
 * checker enforcement is explicit and stable rather than relying on per-request
 * defaults. Runs once at startup: it only inserts when the table is empty, so an
 * admin's curated rows are never clobbered. Failure is logged, not fatal —
 * `loadRegistry` still falls back to the same in-code defaults.
 */
export async function seedRegistry(): Promise<void> {
  try {
    const existing = await db.select().from(mcUrlRegistryTable).limit(1);
    if (existing.length > 0) {
      logger.info("mc_url_registry already populated; skipping seed");
      return;
    }
    const rows = [
      ...DEFAULT_SACRED_LINKS.map((l) => ({ kind: "sacred", label: l.label, url: l.url })),
      ...DEFAULT_IMAGE_LIBRARY.map((l) => ({ kind: "image", label: l.label, url: l.url })),
      ...DEFAULT_INDUSTRY_LINKS.map((l) => ({ kind: "industry", label: l.label, url: l.url })),
      ...DEFAULT_URL_ALLOWLIST.map((l) => ({ kind: "allowlist", label: l.label, url: l.url })),
    ];
    await db.insert(mcUrlRegistryTable).values(rows);
    logger.info({ seeded: rows.length }, "Seeded mc_url_registry baseline");
  } catch (err) {
    logger.error({ err }, "Failed to seed mc_url_registry; falling back to in-code defaults");
  }
}

/** Build the engine-agnostic RunContext from a DB row + registry. */
export function toRunContext(run: McRun, registry: UrlRegistry): RunContext {
  return {
    city: run.city,
    state: run.state,
    track: run.track === "blog" ? "blog" : "page",
    classification: run.classification as RunContext["classification"],
    competition: run.competition as RunContext["competition"],
    pageType: run.pageType as RunContext["pageType"],
    niche: run.niche,
    existingUrls: run.existingUrls ?? [],
    handoff: run.handoff,
    verifiedCid: run.verifiedCid,
    designBibleHash: run.designBibleHash,
    blogTopic: run.blogTopic,
    researchBrief: (run.researchBrief as RunContext["researchBrief"]) ?? null,
    registry,
  };
}

/** Initial phase ladder: research ready, everything else locked. */
export function initialPhases(): PhaseLadderEntry[] {
  return PHASE_ORDER.map((phase, i) => ({
    phase,
    status: i === 0 ? "ready" : "locked",
    summary: null,
    error: null,
    startedAt: null,
    completedAt: null,
  }));
}

export function nextPhase(phase: PhaseName): PhaseName | null {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx >= 0 && idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1]! : null;
}

/** Serialize a DB row into the MissionRun API shape. */
export function serializeRun(run: McRun): Record<string, unknown> {
  return {
    id: run.id,
    city: run.city,
    state: run.state,
    track: run.track,
    engine: run.engine,
    status: run.status,
    currentPhase: run.currentPhase,
    classification: run.classification,
    niche: run.niche,
    competition: run.competition,
    pageType: run.pageType,
    existingUrls: run.existingUrls ?? [],
    handoff: run.handoff,
    verifiedCid: run.verifiedCid,
    designBibleHash: run.designBibleHash,
    blogTopic: run.blogTopic,
    researchBrief: run.researchBrief ?? null,
    pageHtml: run.pageHtml,
    generatedSchema: run.generatedSchema,
    joomlaMeta: run.joomlaMeta ?? null,
    checkerReport: run.checkerReport ?? null,
    phases: run.phases ?? [],
    createdAt: run.createdAt?.toISOString?.() ?? null,
    updatedAt: run.updatedAt?.toISOString?.() ?? null,
  };
}

export { PHASE_ORDER };
