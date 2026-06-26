import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegistry,
  generateLocalBusinessSchema,
  parseSchema,
  runCheckers,
  type RunContext,
} from "@workspace/mc-core";
import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeGrokComplete,
  type CompleteFn,
} from "./providers.js";
import { loadDesignFixtures, type DesignFixtures } from "./fixtures.js";
import { estimateCost } from "./cost.js";
import { runConversation } from "./conversation.js";
import { generateSharedGrounding, type SharedGrounding } from "./grounding.js";
import { BILLINGS_GMB, gmbContextSuffix, generateGmbSchema } from "./gmb.js";
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

const CLAUDE_MODEL = "claude-opus-4-8";
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const OPENAI_MODEL = "gpt-5.5-pro";
/** Standard (non-pro) OpenAI chat tag, run alongside pro for a tier comparison. */
const OPENAI_MODEL_STD = "gpt-5.5";
/** Prior-generation OpenAI chat tag, added to compare a cheaper tier vs the majors. */
const OPENAI_MODEL_54 = "gpt-5.4";

const BUSINESS_NAME = "STS Electronic Recycling";

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
  /** The stateful multi-turn completion fn used to drive this model's chat. */
  complete: CompleteFn;
}

/**
 * A scenario differs from the others ONLY by the per-scenario intro enrichment
 * and the deterministic schema generator — never by the prompts, the fixtures,
 * the turn sequence, or anything per-model. Both scenarios share one grounding.
 */
interface ScenarioSpec {
  id: string;
  label: string;
  description: string;
  notes: string[];
  /** Extra intro block handed identically to every model (empty for No-GMB). */
  introEnrichment: string;
  /** Deterministic schema generator for this scenario. */
  schemaFn: (ctx: RunContext) => string;
  /** Build the run context for this scenario. */
  buildContext: () => RunContext;
  /** CID the schema checker enforces against (null for No-GMB). */
  verifiedCid: string | null;
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
      "The exact human No-GMB checklist a VA runs today, one continuous chat per model: verbatim copyPrompt() prompts, the real uploaded design files inlined, city/state targeting only, NO explicit page_url and NO GMB block.",
    introEnrichment: "",
    schemaFn: generateLocalBusinessSchema,
    buildContext: baseContext,
    verifiedCid: null,
    notes: [
      "Every model runs the IDENTICAL No-GMB checklist in ONE stateful conversation: intro (files uploaded + rules + model check) → build → design gate / force-rebuild loop → SEO audit → SEO verification → schema (deterministic) → link verification. The prompt text is the tool's verbatim copyPrompt() output; the real uploaded design files are inlined as the API-faithful stand-in for file uploads.",
      "This is the faithful production reproduction. The context deliberately omits an explicit page_url and any Google Business Profile (GMB) block — STS spoke pages target a service-area city, not a verified storefront.",
      "Schema is the deterministic No-GMB LocalBusiness (city/state only, NO CID, NO street address) — exactly what the VA's 'Auto-Generate Schema' button emits in No-GMB mode. It is generated deterministically with no AI turn.",
      "If a model refuses to build under this context (asking for page_url / GMB data first) it surfaces as no HTML and is recorded faithfully as an ERROR — it is NOT patched away, because special-casing one model would break the apples-to-apples comparison.",
    ],
  },
  {
    id: "gmb",
    label: "GMB-enriched context",
    description:
      "The SAME checklist and prompts as No-GMB, with one identical enrichment handed to every model: an explicit page_url plus a Google Business Profile (GMB) data block in the intro.",
    introEnrichment: gmbContextSuffix(BILLINGS_GMB),
    schemaFn: (ctx) => generateGmbSchema(ctx, BILLINGS_GMB),
    buildContext: () => ({ ...baseContext(), verifiedCid: BILLINGS_GMB.cid }),
    verifiedCid: BILLINGS_GMB.cid,
    notes: [
      "A fair, symmetric re-run: every model receives the IDENTICAL enriched intro (explicit page_url + GMB block), so we can see whether a model that refused under No-GMB builds well once given the inputs it demanded.",
      "The GMB values (CID, street address, phone, coordinates) are EXPERIMENTAL / illustrative inputs for this comparison, NOT verified ground-truth location data — they are labelled as such in the intro block, and the block tells the model it MAY use them.",
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
 * Optional model filter (comma-separated model ids, e.g. `claude`). Used by the
 * end-to-end smoke check to run a single model. Never changes prompts/fixtures.
 */
const MODEL_FILTER = (process.env.BAKEOFF_MODELS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

  // Load the real uploaded design files up front — fail loud before any API call
  // if a fixture is missing or empty.
  const fixtures = loadDesignFixtures();
  console.log(
    `Loaded design fixtures: page-builder ${fixtures.pageBuilder.length}, design-tier2 ${fixtures.designTier2.length}, seo-data ${fixtures.seoData.length}, seo-audit ${fixtures.seoAudit.length} chars.`,
  );

  const prior = await loadPrior();
  const claudeComplete = makeClaudeComplete(CLAUDE_MODEL);
  const geminiComplete = makeGeminiComplete(GEMINI_MODEL);
  const openaiComplete = makeOpenAIComplete(OPENAI_MODEL);
  const openaiStdComplete = makeOpenAIComplete(OPENAI_MODEL_STD);
  const openai54Complete = makeOpenAIComplete(OPENAI_MODEL_54);
  const grokModel = await discoverNewestGrok();
  console.log(`Discovered newest Grok tag: ${grokModel}`);
  const grokComplete = makeGrokComplete(grokModel);

  const referenceHtml = await readFile(REFERENCE_HTML_PATH, "utf8");
  console.log(`Loaded reference page (${referenceHtml.length} chars) for closeness scoring.`);

  // ONE shared grounding feeds BOTH scenarios, so the only difference between
  // them is the GMB enrichment — never the research input. Reuse the grounding
  // already recorded in results.json when present; otherwise author it once.
  const grounding = await loadOrAuthorGrounding(prior.grounding, claudeComplete);

  let models: ModelSpec[] = [
    { id: "claude", label: "Claude Opus 4.8", provider: "Anthropic", model: CLAUDE_MODEL, complete: claudeComplete },
    { id: "gemini", label: "Gemini 3.1 Pro", provider: "Google", model: GEMINI_MODEL, complete: geminiComplete },
    { id: "openai", label: `OpenAI ${OPENAI_MODEL.toUpperCase()}`, provider: "OpenAI", model: OPENAI_MODEL, complete: openaiComplete },
    { id: "openai-std", label: `OpenAI ${OPENAI_MODEL_STD.toUpperCase()}`, provider: "OpenAI", model: OPENAI_MODEL_STD, complete: openaiStdComplete },
    { id: "openai-54", label: `OpenAI ${OPENAI_MODEL_54.toUpperCase()}`, provider: "OpenAI", model: OPENAI_MODEL_54, complete: openai54Complete },
    { id: "grok", label: "Grok (xAI)", provider: "xAI", model: grokModel, complete: grokComplete },
  ];
  if (MODEL_FILTER.length) {
    models = models.filter((m) => MODEL_FILTER.includes(m.id));
    if (models.length === 0) {
      throw new Error(`BAKEOFF_MODELS=${MODEL_FILTER.join(",")} matched no known model.`);
    }
    console.log(`Active model(s): ${models.map((m) => m.id).join(", ")}`);
  }

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

  // Run every not-yet-recorded model for a scenario CONCURRENTLY — the bottleneck
  // is per-model LLM API latency, not local CPU, so running the models in
  // parallel cuts wall-clock roughly N-fold. The run stays fully resumable: each
  // model still persists the moment it finishes, and all persists are funnelled
  // through a single serialized chain so concurrent writers never interleave the
  // shared results.json. The one shared grounding is authored ABOVE this loop, so
  // concurrency never forks it, and runOneModel swallows its own errors (returns
  // an error ModelResult), so one model failing never aborts its siblings.
  // Scenarios stay sequential to bound peak concurrency to one chat per model.
  // Set BAKEOFF_SEQUENTIAL=1 to force the old one-at-a-time behaviour.
  const sequential = /^(1|true|yes)$/i.test(process.env.BAKEOFF_SEQUENTIAL ?? "");
  let persistChain: Promise<void> = Promise.resolve();
  const queuePersist = (): Promise<void> => {
    persistChain = persistChain.then(persist);
    return persistChain;
  };

  for (const spec of ACTIVE_SCENARIOS) {
    const scenario = scenarios.find((s) => s.id === spec.id)!;
    const pending: ModelSpec[] = [];
    for (const m of models) {
      if (scenario.models.some((existing) => existing.id === m.id)) {
        console.log(`  • ${spec.id}/${m.id}: already recorded, skipping.`);
      } else {
        pending.push(m);
      }
    }
    if (pending.length === 0) continue;

    const runModel = async (m: ModelSpec): Promise<void> => {
      console.log(`\n=== ${spec.label} → ${m.label} ===`);
      const result = await runOneModel(m, spec, grounding, fixtures);
      scenario.models.push(result);
      await queuePersist();
      console.log(`  …persisted ${spec.id}/${m.id} (${result.status}).`);
    };

    if (sequential) {
      for (const m of pending) await runModel(m);
    } else {
      console.log(
        `  ↻ ${spec.id}: running ${pending.length} model(s) concurrently: ${pending.map((m) => m.id).join(", ")}`,
      );
      await Promise.all(pending.map(runModel));
    }
  }

  // Visual judge pass: render every successful model's HTML to a screenshot and
  // score it perceptually against the reference. Runs once after all HTML exists.
  // Best-effort — a failed render leaves the design-token proxy score in place.
  try {
    for (const s of scenarios) {
      const verdict = await judgeVisual(s.models, referenceHtml, {
        outDir: resolve(SCREENSHOT_DIR, s.id),
        pathPrefix: `${SCREENSHOT_PREFIX}/${s.id}`,
        vision: true,
      });
      verdictsByScenario.set(s.id, verdict.verdicts);
      referenceScreenshot = verdict.referenceScreenshot;
      for (const m of s.models) m.screenshot = verdict.screenshots.get(m.id) ?? m.screenshot;
    }
    await persist();
    console.log("Visual judge pass complete; rescored with perceptual verdicts.");
  } catch (err) {
    console.log(`Visual judge pass skipped: ${err instanceof Error ? err.message : String(err)}`);
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
  scenario: ScenarioSpec,
  grounding: SharedGrounding,
  fixtures: DesignFixtures,
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
    costEstimate: null,
  };
  const ctx = scenario.buildContext();
  try {
    const outcome = await runConversation({
      ctx,
      complete: spec.complete,
      fixtures,
      grounding: grounding.content,
      introEnrichment: scenario.introEnrichment,
      schemaFn: scenario.schemaFn,
    });

    // Record the shared grounding as this model's research brief (every model
    // got the identical grounding — it is not a model differentiator).
    base.research = {
      summary: grounding.content,
      entities: [],
      sources: [],
      flags: [],
      raw: grounding.content,
    };
    base.html = outcome.html;
    base.schema = outcome.schema;
    base.totalMs = outcome.totalMs;
    base.timings = outcome.turns.map((t) => ({
      phase: t.phase,
      ms: t.ms,
      summary: t.summary,
      errorCount: 0,
      warningCount: 0,
      wordCount: 0,
      verdict: t.verdict,
    }));

    // Best-effort cost estimate (the providers don't surface token usage). Built
    // from the actual recorded turn sequence + the deterministic prompts/fixtures
    // re-sent each turn. See cost.ts for the documented assumptions.
    base.costEstimate = estimateCost({
      modelTag: spec.model,
      timings: base.timings,
      htmlChars: outcome.html.length,
      ctx,
      fixtures,
      grounding: grounding.content,
      introEnrichment: scenario.introEnrichment,
    });

    // Validate the deterministic schema and run the full checker suite over the
    // final page (afterAudit: the SEO phase has run).
    const parsedSchema = parseSchema(outcome.schema);
    base.schemaValid = parsedSchema != null;

    const report = runCheckers({
      html: outcome.html,
      registry: ctx.registry,
      pageType: ctx.pageType,
      track: ctx.track,
      classification: ctx.classification,
      city: ctx.city,
      afterAudit: true,
      schema: outcome.schema,
      verifiedCid: scenario.verifiedCid,
      businessName: BUSINESS_NAME,
      entities: [],
    });
    base.checkerReport = report;
    base.linkAudit = report.linkAudit;
    // Reflect the final page's checker counts on the schema turn for the viewer.
    const schemaTiming = base.timings.find((t) => t.phase === "schema");
    if (schemaTiming) {
      schemaTiming.errorCount = report.errorCount;
      schemaTiming.warningCount = report.warningCount;
      schemaTiming.wordCount = report.wordCount;
    }

    console.log(
      `  ✓ ${spec.label} finished in ${(base.totalMs / 1000).toFixed(1)}s ` +
        `(${outcome.rebuilds} rebuild(s), ${report.errorCount} error(s), ${report.warningCount} warning(s))`,
    );
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
