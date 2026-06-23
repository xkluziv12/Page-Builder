import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegistry,
  runPhase,
  StubJoomlaPublisher,
  type AIEngine,
  type PhaseName,
  type PhaseState,
  type RunContext,
} from "@workspace/mc-core";
import { GenericLlmEngine, type EngineScenarioOptions } from "./engine.js";
import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeGrokComplete,
  type CompleteFn,
} from "./providers.js";
import { generateSharedGrounding, researchProviderFor, type SharedGrounding } from "./grounding.js";
import { BILLINGS_GMB, gmbContextSuffix, generateGmbSchema } from "./gmb.js";
import { noGmbBuildUser, noGmbAuditUser } from "./miniPrompts.js";
import { scoreModels } from "./score.js";
import { judgeVisual, type VisualVerdict } from "./visual.js";
import type { BakeoffResults, ModelResult, ScenarioResult } from "./types.js";

const TARGET = {
  url: "https://www.stselectronicrecyclinginc.com/billings-mt",
  city: "Billings",
  state: "MT",
  niche: "electronics recycling",
  pageType: "SPOKE" as const,
  classification: "NEW_BUILD" as const,
  competition: "MEDIUM" as const,
};

const CLAUDE_MODEL = "claude-sonnet-4-6";
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const OPENAI_MODEL = "gpt-5.5";

const PHASES: PhaseName[] = ["research", "build", "audit", "schema"];

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(HERE, "../../../artifacts/bake-off/src/data/results.json");
const REFERENCE_HTML_PATH = resolve(HERE, "../../src/bakeoff/reference/billings-mt.html");
/** Screenshots are written into the viewer's public dir so it can serve them. */
const SCREENSHOT_DIR = resolve(HERE, "../../../artifacts/bake-off/public/screenshots");
const SCREENSHOT_PREFIX = "screenshots";

interface ModelSpec {
  id: string;
  label: string;
  provider: string;
  model: string;
  /** The raw completion fn — used both as the engine and the research synthesizer. */
  complete: CompleteFn;
}

/** A scenario differs from the others ONLY by the context handed to the models. */
interface ScenarioSpec {
  id: string;
  label: string;
  description: string;
  notes: string[];
  /** Per-model engine tweaks (context suffix + schema fn) for this scenario. */
  engineOptions: EngineScenarioOptions;
  /** Build the run context for this scenario. */
  buildContext: () => RunContext;
}

function baseContext(): RunContext {
  return {
    city: TARGET.city,
    state: TARGET.state,
    track: "page",
    classification: TARGET.classification,
    competition: TARGET.competition,
    pageType: TARGET.pageType,
    niche: TARGET.niche,
    existingUrls: [],
    handoff: null,
    verifiedCid: null,
    designBibleHash: null,
    blogTopic: null,
    researchBrief: null,
    seoIntel: null,
    registry: buildRegistry(),
  };
}

const SCENARIOS: ScenarioSpec[] = [
  {
    id: "no-gmb",
    label: "No-GMB (production context)",
    description:
      "The exact production context a VA runs today: city/state targeting only, NO explicit page_url and NO GMB block.",
    engineOptions: {
      // Force the real checklist's per-phase mini prompts (forced-execution
      // wrapper + "output only the HTML" rule) alongside each master prompt —
      // identical for every model, so it stays apples-to-apples.
      buildUser: noGmbBuildUser,
      auditUser: noGmbAuditUser,
    },
    buildContext: baseContext,
    notes: [
      "Each phase forces the old checklist's mini prompt ALONGSIDE the master prompt: the 'CRITICAL SYSTEM INSTRUCTION: execute all steps…' forced-execution wrapper, the NO-GMB rules, and the 'return ONLY the complete HTML document, no commentary' rule (the API-faithful translation of the tool's 'create as artifact, never paste code in chat'). Identical for every model — apples-to-apples.",
      "This is the faithful production reproduction. The context deliberately omits an explicit page_url and any Google Business Profile (GMB) block — STS spoke pages target a service-area city, not a verified storefront.",
      "Schema is the deterministic No-GMB LocalBusiness (city/state only, NO CID, NO street address) — exactly what the VA's 'Auto-Generate Schema' button emits in No-GMB mode.",
      "If a model refuses to build under this context (asking for page_url / GMB data first), that refusal is recorded faithfully as an ERROR — it is NOT patched away, because special-casing one model's prompt would break the apples-to-apples comparison.",
    ],
  },
  {
    id: "gmb",
    label: "GMB-enriched context",
    description:
      "The SAME enriched context handed identically to all four models: an explicit page_url plus a Google Business Profile (GMB) data block.",
    engineOptions: {
      contextSuffix: gmbContextSuffix(BILLINGS_GMB),
      schemaFn: (ctx) => generateGmbSchema(ctx, BILLINGS_GMB),
    },
    buildContext: () => ({ ...baseContext(), verifiedCid: BILLINGS_GMB.cid }),
    notes: [
      "A fair, symmetric re-run: every model receives the IDENTICAL enriched context (explicit page_url + GMB block), so we can see whether a model that refused under No-GMB builds well once given the inputs it demanded.",
      "The GMB values (CID, street address, phone, coordinates) are EXPERIMENTAL / illustrative inputs for this comparison, NOT verified ground-truth location data — they are labelled as such in the context block.",
      "Schema here is the GMB-aware deterministic LocalBusiness (full PostalAddress + CID identifier + telephone + geo + ?cid= map URL), still identical across models so it is not a model differentiator.",
    ],
  },
];

/**
 * Optional scenario filter (comma-separated scenario ids, e.g. `no-gmb`). When
 * set via `BAKEOFF_SCENARIOS`, only the listed scenarios are run/persisted; the
 * default runs every scenario. This only narrows WHICH scenarios run — it never
 * changes a scenario's context, prompts, or schema, so each scenario stays a
 * faithful reproduction. Fails loudly if a filter names no known scenario.
 */
const SCENARIO_FILTER = (process.env.BAKEOFF_SCENARIOS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ACTIVE_SCENARIOS = SCENARIO_FILTER.length
  ? SCENARIOS.filter((s) => SCENARIO_FILTER.includes(s.id))
  : SCENARIOS;

/**
 * Resumable per-model run state, loaded from a prior results.json. The harness
 * persists after EVERY model so a long run that is interrupted (e.g. the
 * environment reaps a long background process) can be relaunched and continues
 * from where it left off — completed (ok OR error) results are never re-run.
 */
interface Prior {
  grounding: { source: string; content: string } | null;
  /** scenarioId -> (modelId -> already-completed ModelResult). */
  done: Map<string, Map<string, ModelResult>>;
}

async function loadPrior(): Promise<Prior> {
  const empty: Prior = { grounding: null, done: new Map() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  } catch {
    return empty;
  }
  const obj = parsed as Record<string, unknown>;
  const grounding =
    obj.grounding && typeof obj.grounding === "object"
      ? (obj.grounding as Prior["grounding"])
      : null;
  const done = new Map<string, Map<string, ModelResult>>();

  if (Array.isArray(obj.scenarios)) {
    for (const s of obj.scenarios as ScenarioResult[]) {
      const m = new Map<string, ModelResult>();
      for (const model of s.models) m.set(model.id, model);
      done.set(s.id, m);
    }
  } else if (Array.isArray(obj.models)) {
    // Migrate the legacy single-run (No-GMB) file. Preserve every model whose
    // version is unchanged; drop OpenAI so it is re-run on the newer gpt-5.5.
    const m = new Map<string, ModelResult>();
    for (const model of obj.models as ModelResult[]) {
      if (model.id !== "openai") m.set(model.id, model);
    }
    done.set("no-gmb", m);
  }

  return { grounding, done };
}

async function main(): Promise<void> {
  console.log(`Bake-Off target: ${TARGET.city}, ${TARGET.state} — ${TARGET.url}`);

  if (SCENARIO_FILTER.length && ACTIVE_SCENARIOS.length === 0) {
    throw new Error(
      `BAKEOFF_SCENARIOS=${SCENARIO_FILTER.join(",")} matched no known scenario (have: ${SCENARIOS.map((s) => s.id).join(", ")}).`,
    );
  }
  console.log(`Active scenario(s): ${ACTIVE_SCENARIOS.map((s) => s.id).join(", ")}`);

  const prior = await loadPrior();
  const claudeComplete = makeClaudeComplete(CLAUDE_MODEL);
  const geminiComplete = makeGeminiComplete(GEMINI_MODEL);
  const openaiComplete = makeOpenAIComplete(OPENAI_MODEL);
  const grokModel = await discoverNewestGrok();
  console.log(`Discovered newest Grok tag: ${grokModel}`);
  const grokComplete = makeGrokComplete(grokModel);

  const referenceHtml = await readFile(REFERENCE_HTML_PATH, "utf8");
  console.log(`Loaded reference page (${referenceHtml.length} chars) for closeness scoring.`);

  // ONE shared grounding feeds BOTH scenarios, so the only difference between
  // them is the GMB enrichment — never the research input. Reuse the grounding
  // already recorded in results.json when present; otherwise author it once.
  const grounding = await loadOrAuthorGrounding(prior.grounding, claudeComplete);

  const models: ModelSpec[] = [
    { id: "claude", label: "Claude Sonnet 4.6", provider: "Anthropic", model: CLAUDE_MODEL, complete: claudeComplete },
    { id: "gemini", label: "Gemini 3.1 Pro", provider: "Google", model: GEMINI_MODEL, complete: geminiComplete },
    { id: "openai", label: `OpenAI ${OPENAI_MODEL.toUpperCase()}`, provider: "OpenAI", model: OPENAI_MODEL, complete: openaiComplete },
    { id: "grok", label: "Grok (xAI)", provider: "xAI", model: grokModel, complete: grokComplete },
  ];

  // Seed the working scenario set from any prior (resumable) results.
  const scenarios: ScenarioResult[] = ACTIVE_SCENARIOS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    description: spec.description,
    notes: spec.notes,
    models: models
      .map((m) => prior.done.get(spec.id)?.get(m.id))
      .filter((m): m is ModelResult => m != null),
  }));

  // Per-scenario visual verdicts (rendered-screenshot judge). Populated by the
  // visual pass AFTER all model HTML exists; until then scoring falls back to the
  // design-token proxy so interim (resumable) writes stay shape-complete.
  const verdictsByScenario = new Map<string, Map<string, VisualVerdict>>();
  let referenceScreenshot: string | null = null;

  const persist = async (): Promise<void> => {
    for (const s of scenarios) {
      scoreModels(
        s.models,
        buildRegistry().wordCountFloor,
        referenceHtml,
        verdictsByScenario.get(s.id),
      );
      s.models.sort((a, b) => {
        if (a.status === "error" && b.status !== "error") return 1;
        if (b.status === "error" && a.status !== "error") return -1;
        return (b.scores?.composite ?? -1) - (a.scores?.composite ?? -1);
      });
    }
    const output: BakeoffResults = {
      ranAt: new Date().toISOString(),
      target: TARGET,
      grounding: { source: grounding.source, content: grounding.content },
      scenarios,
      referenceScreenshot,
    };
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");
  };

  // Run sequentially (low peak memory) and persist after EVERY model so the run
  // is fully resumable. Skip any model already recorded for a scenario.
  for (const spec of ACTIVE_SCENARIOS) {
    const scenario = scenarios.find((s) => s.id === spec.id)!;
    const ctx = spec.buildContext();
    for (const m of models) {
      if (scenario.models.some((existing) => existing.id === m.id)) {
        console.log(`  • ${spec.id}/${m.id}: already recorded, skipping.`);
        continue;
      }
      console.log(`\n=== ${spec.label} → ${m.label} ===`);
      const engine = new GenericLlmEngine(m.id, m.complete, spec.engineOptions);
      const researchProvider = researchProviderFor(grounding, m.complete);
      const result = await runOneModel(m, engine, ctx, researchProvider);
      scenario.models.push(result);
      await persist();
      console.log(`  …persisted ${spec.id}/${m.id} (${result.status}).`);
    }
  }

  console.log(`\nResults written to ${OUTPUT_PATH}`);
  for (const s of scenarios) {
    console.log(`\n[${s.label}]`);
    for (const m of s.models) {
      const score = m.scores ? `${m.scores.composite}/100` : "—";
      console.log(`  ${m.label}: ${m.status === "ok" ? score : `ERROR (${m.error})`}`);
    }
  }
}

/** Reuse the grounding recorded in results.json if present, else author it once. */
async function loadOrAuthorGrounding(
  prior: { source: string; content: string } | null,
  synth: CompleteFn,
): Promise<SharedGrounding> {
  if (prior && typeof prior.content === "string" && prior.content.trim()) {
    console.log(`Reusing shared grounding from prior results.json (${prior.content.length} chars).`);
    return { content: prior.content, source: prior.source ?? "model-knowledge (shared)" };
  }
  console.log("Authoring shared research grounding (once)...");
  return generateSharedGrounding(synth, TARGET.city, TARGET.state, TARGET.niche);
}

async function runOneModel(
  spec: ModelSpec,
  engine: AIEngine,
  ctx: RunContext,
  researchProvider: ReturnType<typeof researchProviderFor>,
): Promise<ModelResult> {
  const base: ModelResult = {
    id: spec.id,
    label: spec.label,
    provider: spec.provider,
    model: spec.model,
    status: "ok",
    error: null,
    research: null,
    html: null,
    schema: null,
    schemaValid: false,
    checkerReport: null,
    linkAudit: null,
    timings: [],
    totalMs: 0,
    scores: null,
    screenshot: null,
  };
  const publisher = new StubJoomlaPublisher();
  let state: PhaseState = {
    researchBrief: null,
    html: null,
    schema: null,
    joomlaMeta: null,
    checkerReport: null,
  };
  try {
    for (const phase of PHASES) {
      const t0 = Date.now();
      const out = await runPhase(phase, ctx, state, { engine, publisher, researchProvider });
      const ms = Date.now() - t0;
      state = out.state;
      const report = state.checkerReport;
      base.timings.push({
        phase,
        ms,
        summary: out.summary,
        errorCount: report?.errorCount ?? 0,
        warningCount: report?.warningCount ?? 0,
        wordCount: report?.wordCount ?? 0,
      });
      base.totalMs += ms;
    }
    base.research = state.researchBrief;
    base.html = state.html;
    base.schema = state.schema;
    base.schemaValid = state.schema != null;
    base.checkerReport = state.checkerReport;
    base.linkAudit = state.checkerReport?.linkAudit ?? null;
    console.log(`  ✓ ${spec.label} finished in ${(base.totalMs / 1000).toFixed(1)}s`);
  } catch (err) {
    base.status = "error";
    base.error = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${spec.label} failed: ${base.error}`);
  }
  return base;
}

main().catch((err) => {
  console.error("Bake-off run failed:", err);
  process.exitCode = 1;
});
