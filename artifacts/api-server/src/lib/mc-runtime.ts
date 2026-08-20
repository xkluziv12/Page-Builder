import { db, mcUrlRegistryTable, type McRun } from "@workspace/db";
import {
  ClaudeEngine,
  OpenAIEngine,
  GeminiEngine,
  ReplitEngine,
  RoutedEngine,
  DirectResearchProvider,
  N8nResearchProvider,
  createJoomlaPublisher,
  createPerplexityResearch,
  createSerpEntities,
  buildRegistry,
  deriveClassification,
  fetchSeoIntel,
  isPrivateHostname,
  normalizeTargetUrl,
  parseCityState,
  probeTargetPage,
  cityNamesEquivalent,
  DEFAULT_SACRED_LINKS,
  DEFAULT_IMAGE_LIBRARY,
  DEFAULT_INDUSTRY_LINKS,
  DEFAULT_URL_ALLOWLIST,
  type AIEngine,
  type PromptCompletionEngine,
  type RoutedEngineEvent,
  type RoutedPhase,
  type RoutedRouting,
  type Classification,
  type Competition,
  type ExtractedLocation,
  type RegistryLink,
  type ResearchProvider,
  type RunContext,
  type SeoCredentials,
  type SeoIntel,
  type UrlRegistry,
} from "@workspace/mc-core";
import { logger } from "./logger";

type AnthropicClient = ConstructorParameters<typeof ClaudeEngine>[0];
type OpenAIClient = ConstructorParameters<typeof OpenAIEngine>[0];
type GeminiClient = ConstructorParameters<typeof GeminiEngine>[0];

/**
 * Lazily resolve the Anthropic client via dynamic import. The client module
 * throws at import time when ANTHROPIC_API_KEY is missing; loading it lazily
 * (and only when a Claude phase actually runs) means a missing Anthropic key
 * fails just that phase, not the whole API server at startup — the mc routes
 * are mounted unconditionally alongside unrelated endpoints.
 */
let cachedAnthropic: AnthropicClient | null = null;
export async function getAnthropic(): Promise<AnthropicClient> {
  if (cachedAnthropic === null) {
    const mod = await import("@workspace/integrations-anthropic-ai");
    cachedAnthropic = mod.anthropic as AnthropicClient;
  }
  return cachedAnthropic;
}

/**
 * Lazily resolve the OpenAI client with STS's own OPENAI_API_KEY (same key the
 * bake-off uses). Lazy + fail-loud: a missing key fails only the OpenAI-engine
 * phase that needs it, not the whole server at startup.
 */
let cachedOpenAI: OpenAIClient | null = null;
export async function getOpenAI(): Promise<OpenAIClient> {
  if (cachedOpenAI === null) {
    const key = process.env.OPENAI_API_KEY;
    if (!key || !key.trim()) {
      throw new Error(
        "OPENAI_API_KEY is not set; cannot auto-run OpenAI-engine builds. Add STS's own OpenAI key.",
      );
    }
    const { default: OpenAI } = await import("openai");
    cachedOpenAI = new OpenAI({ apiKey: key });
  }
  return cachedOpenAI;
}

/**
 * Lazily resolve the Gemini client with STS's own GEMINI_API_KEY (same key the
 * bake-off uses). Lazy + fail-loud, mirroring {@link getOpenAI}.
 */
let cachedGemini: GeminiClient | null = null;
export async function getGemini(): Promise<GeminiClient> {
  if (cachedGemini === null) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || !key.trim()) {
      throw new Error(
        "GEMINI_API_KEY is not set; cannot auto-run Gemini-engine builds. Add STS's own Gemini key.",
      );
    }
    const { GoogleGenAI } = await import("@google/genai");
    cachedGemini = new GoogleGenAI({ apiKey: key });
  }
  return cachedGemini;
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
 *   Anthropic API (Claude Sonnet 4.6) via a synchronous {@link AIEngine}.
 * - `openai` — Dashboard mode on OpenAI (GPT-5.4), auto-run like Claude.
 * - `gemini` — Dashboard mode on Google Gemini (3.1 Pro), auto-run like Claude.
 * - `replit` — Replit mode: an operator drives Replit's own Agent, which
 *   produces each artifact; the operator submits it through the Replit phase
 *   endpoint. The server never calls an external model for these runs.
 */
export const SUPPORTED_ENGINES = ["claude", "openai", "gemini", "replit"] as const;

/** The model-backed providers the routed Dashboard engine can call. */
type ProviderName = "claude" | "openai" | "gemini";

function isProviderName(v: string): v is ProviderName {
  return v === "claude" || v === "openai" || v === "gemini";
}

/**
 * Default backup provider per primary. When the requested (main) model exhausts
 * its attempts on a phase, the routed engine falls back to a *different*
 * provider so a single provider's outage/refusal doesn't sink the run. Best-
 * effort: a missing backup key degrades to main-only (see {@link engineFor}).
 */
const DEFAULT_BACKUP: Record<ProviderName, ProviderName> = {
  claude: "openai",
  openai: "claude",
  gemini: "claude",
};

/** Construct the concrete model-backed engine for a provider (fail loud on key). */
async function makeProviderEngine(name: ProviderName): Promise<PromptCompletionEngine> {
  if (name === "claude") return new ClaudeEngine(await getAnthropic());
  if (name === "openai") return new OpenAIEngine(await getOpenAI());
  return new GeminiEngine(await getGemini());
}

/** The phases the routed engine routes; each gets its own main + optional backup. */
const ROUTED_PHASES: RoutedPhase[] = ["build", "audit", "schema", "verify", "chat"];

/**
 * Resolve the engine used by the server's *auto-run* path (Dashboard mode).
 *
 * CHANGED: the model-backed path now returns a {@link RoutedEngine} instead of a
 * bare ClaudeEngine/OpenAIEngine/GeminiEngine. The routed engine adds the
 * bake-off's orchestration strengths — per-phase model routing, in-flight
 * timeouts, retry → main→backup fallback on invalid output, and a verify +
 * corrective-re-verify loop after audit — WITHOUT touching the pipeline
 * orchestrator, the prompt text, or the deterministic checker quality gates.
 *
 * Routing: every phase's main defaults to the requested `engine`; its backup
 * defaults to {@link DEFAULT_BACKUP}. Per-phase overrides are read from
 * `MC_ROUTE_<PHASE>_MAIN` / `MC_ROUTE_<PHASE>_BACKUP` (phase upper-cased, value a
 * provider name). An EXPLICIT env route to a provider whose key is missing fails
 * loud; a DEFAULT backup whose key is missing degrades to main-only and logs.
 *
 * Replit runs are operator-driven and supply their own {@link ReplitEngine} per
 * phase, so they never go through this resolver — calling it for "replit" fails
 * loud rather than silently mislabeling provenance.
 */
export async function engineFor(engine: string): Promise<AIEngine> {
  if (engine === "replit") {
    throw new Error(
      `Replit-mode runs are operator-driven and cannot be auto-run by the server. The Replit Agent must submit each phase's artifact via the Replit run-book (POST /mc/runs/:id/phases/:phase/replit).`,
    );
  }
  if (!isProviderName(engine)) {
    throw new Error(
      `Engine "${engine}" is not supported. Available engines: ${SUPPORTED_ENGINES.join(", ")}.`,
    );
  }

  // Build each provider engine at most once and share it across phases.
  const cache = new Map<ProviderName, PromptCompletionEngine>();
  const get = async (name: ProviderName): Promise<PromptCompletionEngine> => {
    const existing = cache.get(name);
    if (existing) return existing;
    const built = await makeProviderEngine(name);
    cache.set(name, built);
    return built;
  };

  // An explicit env override fails loud (missing key, unknown provider); returns
  // null when the override is unset so the caller applies its default.
  const resolveExplicit = async (envKey: string): Promise<PromptCompletionEngine | null> => {
    const override = (process.env[envKey] ?? "").trim().toLowerCase();
    if (!override) return null;
    if (!isProviderName(override)) {
      throw new Error(
        `${envKey}="${override}" is not a valid provider. Use one of: claude, openai, gemini.`,
      );
    }
    return get(override);
  };

  const routing = {} as RoutedRouting;
  for (const phase of ROUTED_PHASES) {
    const ph = phase.toUpperCase();

    // MAIN: explicit override (fail loud) → else the requested engine (fail loud;
    // the user picked it, so a missing key is a hard error, not a degrade).
    const main =
      (await resolveExplicit(`MC_ROUTE_${ph}_MAIN`)) ?? (await get(engine));

    // BACKUP: explicit override (fail loud) → else the default backup provider,
    // best-effort (a missing default-backup key degrades to main-only + logs).
    let backup: PromptCompletionEngine | undefined;
    const explicitBackup = await resolveExplicit(`MC_ROUTE_${ph}_BACKUP`);
    if (explicitBackup) {
      backup = explicitBackup;
    } else {
      const defName = DEFAULT_BACKUP[engine];
      try {
        backup = await get(defName);
      } catch (err) {
        logger.warn(
          { err, phase, provider: defName },
          `Default backup engine "${defName}" unavailable; "${phase}" will run main-only`,
        );
        backup = undefined;
      }
    }

    routing[phase] = { main, backup };
  }

  const log = (event: RoutedEngineEvent): void => {
    if (event.status === "ok") {
      logger.debug(event, "routed-engine phase ok");
    } else {
      logger.warn(event, `routed-engine ${event.status}`);
    }
  };

  // Keep provenance stable: name the routed engine after the requested provider
  // so existing run records still read "claude"/"openai"/"gemini".
  return new RoutedEngine({ routing, log, name: engine });
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

const DEFAULT_SYNTHESIS_MODEL = "claude-sonnet-4-6";
const SYNTHESIS_MAX_TOKENS = 8192;

/** The research-synthesis provider (defaults to anthropic). */
function synthesisProvider(): ProviderName {
  const p = (process.env.MC_SYNTHESIS_PROVIDER ?? "anthropic").trim().toLowerCase();
  if (p === "anthropic" || p === "claude") return "claude";
  if (p === "openai") return "openai";
  if (p === "gemini") return "gemini";
  throw new Error(
    `Unknown MC_SYNTHESIS_PROVIDER "${p}". Use "anthropic" (default), "openai", or "gemini".`,
  );
}

/** The research-synthesis model id (defaults to the Claude Sonnet baseline). */
function synthesisModel(): string {
  const m = (process.env.MC_SYNTHESIS_MODEL ?? "").trim();
  return m || DEFAULT_SYNTHESIS_MODEL;
}

/**
 * Structuring step for the direct research provider: a single model call that
 * coerces web-grounded research into the strict ResearchBrief JSON. Returns
 * plain text; the provider parses + fails loud on malformed JSON.
 *
 * CHANGED: the provider/model are now configurable (MC_SYNTHESIS_PROVIDER /
 * MC_SYNTHESIS_MODEL) instead of a hardcoded Anthropic model. It still defaults
 * to the Claude Sonnet baseline (reusing the wired Anthropic integration, no
 * extra key). Whichever provider is selected fails loud at point of use when its
 * key is missing — never a silent placeholder.
 */
async function synthesizeBrief(system: string, user: string): Promise<string> {
  const provider = synthesisProvider();
  const model = synthesisModel();
  if (provider === "claude") {
    const client = await getAnthropic();
    const message = await client.messages.create({
      model,
      max_tokens: SYNTHESIS_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    return message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
  }
  if (provider === "openai") {
    const client = await getOpenAI();
    const resp = await client.responses.create({
      model,
      max_output_tokens: SYNTHESIS_MAX_TOKENS,
      instructions: system,
      input: [{ role: "user", content: user }],
    });
    return (resp.output_text ?? "").trim();
  }
  const client = await getGemini();
  const resp = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: user }] }],
    config: { systemInstruction: system, maxOutputTokens: SYNTHESIS_MAX_TOKENS },
  });
  return (resp.text ?? "").trim();
}

/**
 * Resolve the research backend for the research phase. Defaults to the
 * direct-API provider (Perplexity web-grounded research + citations, SerpAPI
 * entity seeds, Claude synthesis) so a run no longer depends on the external
 * n8n `mark-ai-brain` webhook being up. Set `MC_RESEARCH_PROVIDER=n8n` to
 * explicitly fall back to the webhook. Missing keys (PERPLEXITY_API_KEY,
 * SERPAPI_API_KEY) fail loudly at research time — never a silent placeholder.
 */
export function researchProviderFromEnv(): ResearchProvider {
  const mode = (process.env.MC_RESEARCH_PROVIDER ?? "direct").trim().toLowerCase();
  if (mode === "n8n") {
    return new N8nResearchProvider();
  }
  if (mode === "direct") {
    return new DirectResearchProvider({
      groundedResearch: createPerplexityResearch(process.env.PERPLEXITY_API_KEY ?? ""),
      fetchEntities: createSerpEntities(process.env.SERPAPI_API_KEY ?? ""),
      synthesize: synthesizeBrief,
    });
  }
  throw new Error(
    `Unknown MC_RESEARCH_PROVIDER "${mode}". Use "direct" (default) or "n8n".`,
  );
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
    seoIntel: (run.seoIntel as RunContext["seoIntel"]) ?? null,
    registry,
  };
}

/** Read the live-SEO credentials from the environment. */
export function seoCredsFromEnv(): SeoCredentials {
  return {
    serpApiKey: process.env.SERPAPI_API_KEY ?? "",
    dataForSeoLogin: process.env.DATAFORSEO_LOGIN ?? null,
    dataForSeoPassword: process.env.DATAFORSEO_PASSWORD ?? null,
  };
}

/** Everything the create handler derives from a target URL. */
export interface DerivedRunInputs {
  city: string;
  state: string;
  niche: string;
  classification: Classification;
  competition: Competition;
  seoIntel: SeoIntel;
  /** Where the final city/state came from: the URL slug or the fetched page. */
  locationSource: "url" | "page";
  /** True when the live page corroborated (or corrected) the URL location. */
  locationVerified: boolean;
  /** City/state signals scraped from the page, for transparency. */
  detectedLocations: ExtractedLocation[];
}

/**
 * Derive every field the simplified New Build form no longer asks for, from the
 * target URL alone:
 *   - city/state/niche from the URL slug (loud failure on an unparseable URL),
 *   - classification by probing whether a real page already exists there,
 *   - competition + live SEO intel from SerpAPI (+ DataForSEO enrichment).
 * SerpAPI is required and fails loudly — this intel replaces the quarterly SEO
 * spreadsheet, so a silent gap is worse than a hard stop.
 */
export async function deriveRunInputs(url: string): Promise<DerivedRunInputs> {
  // Normalize once so parsing and probing inspect the exact same URL, and reject
  // anything that isn't a public http(s) target (SSRF guard).
  const normalized = normalizeTargetUrl(url);
  if (!normalized) {
    throw new Error(
      `"${url}" is not a valid http(s) URL. Use a full page URL, e.g. https://stsrecycling.com/electronics-recycling-austin-tx.`,
    );
  }
  if (isPrivateHostname(new URL(normalized).hostname)) {
    throw new Error(
      `Refusing to probe "${url}" — it points at a private or internal address.`,
    );
  }
  const loc = parseCityState(normalized);
  if (!loc) {
    throw new Error(
      `Could not parse a city and state from the URL "${url}". Use a local page URL that ends in a city + state, e.g. .../electronics-recycling-austin-tx.`,
    );
  }
  const creds = seoCredsFromEnv();
  if (!creds.serpApiKey) {
    throw new Error(
      "SERPAPI_API_KEY is not configured; cannot gather the live SEO data that replaces the quarterly SEO spreadsheet.",
    );
  }
  const probe = await probeTargetPage(normalized);
  const classification = deriveClassification(probe);

  // Cross-check the URL-parsed location against what the live page actually says,
  // so a same-named city in the wrong state is caught before we fetch SERP data.
  let city = loc.city;
  let state = loc.state;
  let locationSource: "url" | "page" = "url";
  let locationVerified = false;
  const detectedLocations = probe.locations ?? [];
  if (detectedLocations.length > 0) {
    const corroborated = detectedLocations.find(
      (c) => c.state?.toUpperCase() === state.toUpperCase() && c.city && cityNamesEquivalent(c.city, city),
    );
    if (corroborated) {
      locationVerified = true;
    } else {
      // Same city name, different state — the "sounds the same" case. The live
      // page is authoritative for where it actually targets, so adopt its state.
      const sameCityDiffState = detectedLocations.find(
        (c) => c.city && cityNamesEquivalent(c.city, city) && c.state && c.state.toUpperCase() !== state.toUpperCase(),
      );
      if (sameCityDiffState?.state) {
        state = sameCityDiffState.state.toUpperCase();
        locationSource = "page";
        locationVerified = true;
      }
    }
  }

  const seoIntel = await fetchSeoIntel(
    { city, state, niche: loc.niche },
    creds,
  );
  return {
    city,
    state,
    niche: loc.niche,
    classification,
    competition: seoIntel.competition,
    seoIntel,
    locationSource,
    locationVerified,
    detectedLocations,
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
    vaName: run.vaName,
    url: run.url,
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
    seoIntel: run.seoIntel ?? null,
    pageHtml: run.pageHtml,
    generatedSchema: run.generatedSchema,
    joomlaMeta: run.joomlaMeta ?? null,
    checkerReport: run.checkerReport ?? null,
    linkAuditOverride: run.linkAuditOverride ?? null,
    phases: run.phases ?? [],
    createdAt: run.createdAt?.toISOString?.() ?? null,
    updatedAt: run.updatedAt?.toISOString?.() ?? null,
  };
}

export { PHASE_ORDER };
