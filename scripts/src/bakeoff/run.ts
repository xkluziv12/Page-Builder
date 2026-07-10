import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegistry,
  parseSchema,
  runCheckers,
  WORD_COUNT_CEILINGS,
  type RunContext,
} from "@workspace/mc-core";
import { schemaPrompt, gmbSchemaPrompt, type PromptVars, type PromptGmb } from "./miniPrompts.js";
import {
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeGrokComplete,
  type CompleteFn,
} from "./providers.js";
import { loadDesignFixtures, type DesignFixtures } from "./fixtures.js";
import { estimateCost, costFromUsage } from "./cost.js";
import { runConversation, type TranscriptEntry } from "./conversation.js";
import { generateSharedGrounding, type SharedGrounding } from "./grounding.js";
import { gmbContextSuffix, resolveGmbProfile, promptGmbFrom, type GmbProfile } from "./gmb.js";
import { loadReferenceHtml, resolveTarget, type BakeoffTarget } from "./target.js";
import { scoreModels } from "./score.js";
import { judgeVisual, type VisualVerdict } from "./visual.js";
import type { BakeoffResults, ModelResult, ScenarioResult, TokenUsage } from "./types.js";

/** The build target (city/state/niche/url) — env-driven, defaults to Billings, MT. */
const TARGET = resolveTarget();

const CLAUDE_MODEL = "claude-sonnet-5";
const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";
const GEMINI_FLASH_MODEL = "gemini-3.5-flash";
const OPENAI_MODEL = "gpt-5.6-terra";
const GROK_MODEL = "grok-4.5";

const BUSINESS_NAME = "STS Electronic Recycling";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(HERE, "../../../artifacts/bake-off/src/data/results.json");
/** Screenshots are written into the viewer's public dir so it can serve them. */
const SCREENSHOT_DIR = resolve(HERE, "../../../artifacts/bake-off/public/screenshots");
const SCREENSHOT_PREFIX = "screenshots";
// Full per-turn transcripts are written to their own files (one per scenario ×
// model) under the viewer's public dir, keeping results.json lean while making
// every turn — prompt, raw reply, usage, and any error — inspectable.
const TRANSCRIPT_DIR = resolve(HERE, "../../../artifacts/bake-off/public/transcripts");
const TRANSCRIPT_PREFIX = "transcripts";

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
  /** Per-scenario schema prompt for the Phase-4 AI schema turn (No-GMB or GMB). */
  schemaPromptFor: (vars: PromptVars) => string;
  /** The page's target URL, used verbatim for the prompts (GMB pageUrl for the
   * GMB scenario, else TARGET.url). */
  pageUrl: string;
  /** Verified GMB NAP block for the GMB scenario; null for the faithful No-GMB
   * path (prompts stay byte-identical). */
  gmb: PromptGmb | null;
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

function noGmbScenario(): ScenarioSpec {
  return {
    id: "no-gmb",
    label: "No-GMB (production context)",
    description:
      "The exact human No-GMB checklist a VA runs today, one continuous chat per model: verbatim copyPrompt() prompts, the real uploaded design files inlined, city/state targeting only, NO explicit page_url and NO GMB block.",
    introEnrichment: "",
    schemaPromptFor: (vars) => schemaPrompt(vars),
    pageUrl: TARGET.url,
    gmb: null,
    buildContext: baseContext,
    verifiedCid: null,
    notes: [
      "Every model runs the IDENTICAL No-GMB checklist in ONE stateful conversation: intro (files uploaded + rules + model check) → build → design gate / force-rebuild loop → SEO audit → SEO verification → schema (Schema Generator AI turn) → link verification. The prompt text is the tool's verbatim copyPrompt() output; the real uploaded design files are inlined as the API-faithful stand-in for file uploads.",
      "This is the faithful production reproduction. The context deliberately omits an explicit page_url and any Google Business Profile (GMB) block — STS spoke pages target a service-area city, not a verified storefront.",
      "Schema is a real AI turn running the uploaded Master Schema Generator (v1.4.1) under the No-GMB overrides (city/state only, NO CID, NO street address). The model must emit a <script type=\"application/ld+json\">…</script> block; the harness extracts and validates the JSON-LD inside it (fail loud otherwise).",
      "If a model refuses to build under this context (asking for page_url / GMB data first) it surfaces as no HTML and is recorded faithfully as an ERROR — it is NOT patched away, because special-casing one model would break the apples-to-apples comparison.",
    ],
  };
}

/** Per-open-day human hours lines for the GMB schema turn (closed days omitted,
 * "Open 24 hours" preserved). Empty when the profile carries no structured hours. */
function gmbHoursLines(gmb: GmbProfile): string[] {
  if (!gmb.openingHours || gmb.openingHours.length === 0) return [];
  return gmb.openingHours
    .filter((h) => !h.closed)
    .map((h) =>
      h.open24
        ? `${h.day}: Open 24 hours`
        : `${h.day}: ${h.opens ?? "00:00"} – ${h.closes ?? "23:59"}`,
    );
}

function gmbScenario(gmb: GmbProfile): ScenarioSpec {
  return {
    id: "gmb",
    label: "GMB-enriched context",
    description:
      "The SAME checklist and prompts as No-GMB, with one identical enrichment handed to every model: an explicit page_url plus a Google Business Profile (GMB) data block in the intro.",
    introEnrichment: gmbContextSuffix(gmb),
    schemaPromptFor: (vars) =>
      gmbSchemaPrompt(vars, {
        cid: gmb.cid,
        gmbUrl: gmb.gmbUrl,
        businessName: gmb.businessName,
        street: gmb.street,
        zip: gmb.zip,
        phone: gmb.phone,
        lat: gmb.lat,
        lng: gmb.lng,
        hoursLines: gmbHoursLines(gmb),
      }),
    pageUrl: gmb.pageUrl,
    gmb: promptGmbFrom(gmb),
    buildContext: () => ({ ...baseContext(), verifiedCid: gmb.cid }),
    verifiedCid: gmb.cid,
    notes: [
      "The dead-simple input path: every model receives the IDENTICAL intro (explicit page_url + the page's verified GMB block) and builds the page with its real local NAP (name/address/phone), hours, CID, and map link.",
      "The GMB values (CID, street address, phone, coordinates) are the page's VERIFIED Google Business Profile, which the model MUST use as the page's contact info. For a real run they are supplied via BAKEOFF_GMB_JSON; the built-in Billings sample uses reserved-fictional values for the smoke path only.",
      "Schema here is a real AI turn running the uploaded Master Schema Generator (v1.4.1) with the verified CID + full address block, so the emitted JSON-LD carries the identifier/PostalAddress/geo/?cid= map URL a GMB page requires. The model must emit a <script type=\"application/ld+json\">…</script> block, validated by the harness.",
    ],
  };
}

/**
 * Build the scenario set for a target. The No-GMB scenario is always present
 * (it's the production-faithful path and needs no location-specific block). The
 * GMB scenario is included only when a GMB profile is available — for the
 * Portland smoke target that's the {@link PORTLAND_GMB} stand-in; for any
 * other city it requires a verified `BAKEOFF_GMB_JSON` block (see
 * {@link resolveGmbProfile}), so a new-city run without one drops the GMB
 * scenario rather than inventing location data or aborting the whole run.
 */
function buildScenarios(gmb: GmbProfile | null): ScenarioSpec[] {
  const specs = [noGmbScenario()];
  if (gmb) specs.push(gmbScenario(gmb));
  return specs;
}

/**
 * Optional scenario filter (comma-separated scenario ids, e.g. `no-gmb`). When
 * set via `BAKEOFF_SCENARIOS`, only the listed scenarios are run/persisted; the
 * default runs every available scenario. This only narrows WHICH scenarios run —
 * it never changes a scenario's context, prompts, or schema, so each scenario
 * stays a faithful reproduction. Fails loudly if a filter names no known scenario.
 */
const SCENARIO_FILTER = (process.env.BAKEOFF_SCENARIOS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Optional model filter (comma-separated model ids, e.g. `claude`). Used by the
 * end-to-end smoke check to run a single model. Never changes prompts/fixtures.
 */
const MODEL_FILTER = (process.env.BAKEOFF_MODELS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Optional per-model overrides, applied generically by model id — never
 * special-cased to one model. `BAKEOFF_MODEL_OVERRIDES` is a JSON object of
 * `{ [modelId]: { model?, label? } }` that swaps the underlying provider tag
 * and/or the display label for any spec (e.g. run the Claude slot on a
 * different Sonnet revision). Fails loud on malformed JSON.
 */
const MODEL_OVERRIDES: Record<string, { model?: string; label?: string }> = (() => {
  const raw = process.env.BAKEOFF_MODEL_OVERRIDES?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`entry "${id}" must be an object with optional string model/label`);
      }
      const { model, label } = entry as Record<string, unknown>;
      if (model !== undefined && typeof model !== "string") {
        throw new Error(`entry "${id}".model must be a string`);
      }
      if (label !== undefined && typeof label !== "string") {
        throw new Error(`entry "${id}".label must be a string`);
      }
    }
    return parsed as Record<string, { model?: string; label?: string }>;
  } catch (err) {
    throw new Error(
      `BAKEOFF_MODEL_OVERRIDES is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
})();

/**
 * Model ids to force-rerun even when a prior (ok OR error) result exists for
 * them — comma-separated, or `all`. Used to re-run a single model in place
 * (e.g. after fixing an errored slot) while every other model resumes from the
 * recorded results.json untouched.
 */
const FORCE_RERUN = new Set(
  (process.env.BAKEOFF_FORCE ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const forced = (id: string): boolean => FORCE_RERUN.has("all") || FORCE_RERUN.has(id);

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
      // Forced ids are dropped from the recorded set so they re-run in place;
      // every other model resumes from results.json untouched.
      for (const model of s.models) if (!forced(model.id)) m.set(model.id, model);
      done.set(s.id, m);
    }
  }

  return { grounding, done };
}

async function main(): Promise<void> {
  console.log(`Bake-Off target: ${TARGET.city}, ${TARGET.state} — ${TARGET.url}`);

  // Resolve the GMB profile for the GMB scenario. Available for the Billings
  // smoke target (illustrative block) or whenever BAKEOFF_GMB_JSON is supplied;
  // otherwise the GMB scenario is unavailable for this city (no invented data).
  let gmb: GmbProfile | null = null;
  let gmbError: string | null = null;
  try {
    gmb = resolveGmbProfile(TARGET);
  } catch (err) {
    gmbError = err instanceof Error ? err.message : String(err);
  }

  const allScenarios = buildScenarios(gmb);
  // An explicit BAKEOFF_SCENARIOS=gmb on a city with no GMB block fails loud —
  // the operator asked for it specifically, so don't silently drop it.
  if (SCENARIO_FILTER.includes("gmb") && !gmb) {
    throw new Error(`BAKEOFF_SCENARIOS requested "gmb" but no GMB block is available: ${gmbError}`);
  }
  const activeScenarios = SCENARIO_FILTER.length
    ? allScenarios.filter((s) => SCENARIO_FILTER.includes(s.id))
    : allScenarios;
  if (SCENARIO_FILTER.length && activeScenarios.length === 0) {
    throw new Error(
      `BAKEOFF_SCENARIOS=${SCENARIO_FILTER.join(",")} matched no known scenario (have: ${allScenarios.map((s) => s.id).join(", ")}).`,
    );
  }
  if (!gmb && gmbError && !SCENARIO_FILTER.length) {
    console.log(`Skipping GMB scenario for ${TARGET.city}, ${TARGET.state}: ${gmbError}`);
  }
  console.log(`Active scenario(s): ${activeScenarios.map((s) => s.id).join(", ")}`);

  // Load the real uploaded design files up front — fail loud before any API call
  // if a fixture is missing or empty.
  const fixtures = loadDesignFixtures();
  console.log(
    `Loaded design fixtures: page-builder ${fixtures.pageBuilder.length}, design-tier2 ${fixtures.designTier2.length}, seo-data ${fixtures.seoData.length}, seo-audit ${fixtures.seoAudit.length} chars.`,
  );

  const prior = await loadPrior();
  // Only needed to author the shared grounding when none is recorded yet; the
  // per-model complete fns are built (with any overrides) alongside `models`.
  const claudeComplete = makeClaudeComplete(CLAUDE_MODEL);

  const reference = await loadReferenceHtml(TARGET);
  const referenceHtml = reference.html;

  // ONE shared grounding feeds BOTH scenarios, so the only difference between
  // them is the GMB enrichment — never the research input. Reuse the grounding
  // already recorded in results.json when present; otherwise author it once.
  const grounding = await loadOrAuthorGrounding(prior.grounding, claudeComplete);

  const baseModels: Array<{
    id: string;
    label: string;
    provider: ModelSpec["provider"];
    model: string;
    make: (tag: string) => CompleteFn;
  }> = [
    { id: "claude", label: "Claude Sonnet 5", provider: "Anthropic", model: CLAUDE_MODEL, make: makeClaudeComplete },
    { id: "gemini", label: "Gemini 3.1 Pro", provider: "Google", model: GEMINI_PRO_MODEL, make: makeGeminiComplete },
    { id: "gemini-flash", label: "Gemini 3.5 Flash", provider: "Google", model: GEMINI_FLASH_MODEL, make: makeGeminiComplete },
    { id: "openai", label: `OpenAI ${OPENAI_MODEL.toUpperCase()}`, provider: "OpenAI", model: OPENAI_MODEL, make: makeOpenAIComplete },
    { id: "grok", label: "Grok 4.5", provider: "xAI", model: GROK_MODEL, make: makeGrokComplete },
  ];
  // Apply per-model overrides (tag/label) generically by id — the override
  // swaps the provider tag and rebuilds that model's complete fn to match, so
  // the recorded `model` field always reflects what actually ran.
  let models: ModelSpec[] = baseModels.map((m) => {
    const ovr = MODEL_OVERRIDES[m.id];
    const model = ovr?.model ?? m.model;
    if (ovr?.model && ovr.model !== m.model) {
      console.log(`Override: ${m.id} model ${m.model} -> ${model}`);
    }
    return {
      id: m.id,
      label: ovr?.label ?? m.label,
      provider: m.provider,
      model,
      complete: m.make(model),
    };
  });
  if (MODEL_FILTER.length) {
    models = models.filter((m) => MODEL_FILTER.includes(m.id));
    if (models.length === 0) {
      throw new Error(`BAKEOFF_MODELS=${MODEL_FILTER.join(",")} matched no known model.`);
    }
    console.log(`Active model(s): ${models.map((m) => m.id).join(", ")}`);
  }

  // Seed the working scenario set from EVERY prior (resumable) result — not just
  // the active/filtered models. A BAKEOFF_MODELS filter must only decide which
  // models RUN this pass; models absent from the filter still need to survive
  // the next persist(), or a single-model rerun would wipe the rest of the
  // dataset. Forced ids are already dropped from prior.done in loadPrior.
  const scenarios: ScenarioResult[] = activeScenarios.map((spec) => ({
    id: spec.id,
    label: spec.label,
    description: spec.description,
    notes: spec.notes,
    models: [...(prior.done.get(spec.id)?.values() ?? [])],
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
        WORD_COUNT_CEILINGS[TARGET.pageType] ?? 0,
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

  for (const spec of activeScenarios) {
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

/** Sum the real per-turn token usage into one run-level total. Returns null when
 * no turn reported usage (so cost falls back to the character-based estimate). */
function sumUsage(transcript: TranscriptEntry[]): TokenUsage | null {
  const withUsage = transcript.filter((t) => t.usage);
  if (withUsage.length === 0) return null;
  return withUsage.reduce<TokenUsage>(
    (acc, t) => ({
      inputTokens: acc.inputTokens + t.usage!.inputTokens,
      cachedInputTokens: acc.cachedInputTokens + t.usage!.cachedInputTokens,
      outputTokens: acc.outputTokens + t.usage!.outputTokens,
      reasoningTokens: acc.reasoningTokens + t.usage!.reasoningTokens,
    }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  );
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
    usage: null,
    transcriptPath: null,
  };
  const ctx = scenario.buildContext();
  // Mutable per-turn transcript sink: filled AS the conversation runs, so even a
  // run that fails loud mid-pipeline leaves a partial transcript + usage behind.
  const transcript: TranscriptEntry[] = [];
  try {
    const outcome = await runConversation({
      ctx,
      complete: spec.complete,
      fixtures,
      grounding: grounding.content,
      introEnrichment: scenario.introEnrichment,
      schemaPromptFor: scenario.schemaPromptFor,
      pageUrl: scenario.pageUrl,
      gmb: scenario.gmb,
      transcript,
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

    // Cost: PREFER the measured cost from real provider-reported token usage;
    // fall back to the character-based estimate only when no turn returned usage.
    base.usage = sumUsage(transcript);
    base.costEstimate = base.usage
      ? costFromUsage(spec.model, base.usage)
      : estimateCost({
          modelTag: spec.model,
          timings: base.timings,
          htmlChars: outcome.html.length,
          ctx,
          fixtures,
          grounding: grounding.content,
          introEnrichment: scenario.introEnrichment,
          pageUrl: scenario.pageUrl,
          gmb: scenario.gmb,
        });

    // Validate the AI-generated schema (the harness already confirmed it was a
    // valid <script type="application/ld+json"> block and stored the raw JSON) and
    // run the full checker suite over the final page (afterAudit: SEO has run).
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
    // Keep the partial usage from whatever turns DID run before the failure, and
    // surface the measured spend-to-failure so an errored run still shows cost.
    base.usage = sumUsage(transcript);
    if (base.usage) base.costEstimate = costFromUsage(spec.model, base.usage);
    console.log(`  ✗ ${spec.label} failed: ${base.error}`);
  }

  // Persist the full per-turn transcript (best-effort, OK OR error path) so every
  // run — including a failed one — is inspectable. A write failure must never
  // fail the run, mirroring the screenshot write.
  try {
    const rel = `${TRANSCRIPT_PREFIX}/${scenario.id}/${spec.id}.json`;
    const abs = resolve(TRANSCRIPT_DIR, scenario.id, `${spec.id}.json`);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(
      abs,
      JSON.stringify(
        {
          scenario: scenario.id,
          modelId: spec.id,
          label: spec.label,
          model: spec.model,
          status: base.status,
          error: base.error,
          totalMs: base.totalMs,
          usage: base.usage,
          turns: transcript,
        },
        null,
        2,
      ),
      "utf8",
    );
    base.transcriptPath = rel;
  } catch (err) {
    console.log(
      `  ! ${spec.label} transcript write skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return base;
}

main().catch((err) => {
  console.error("Bake-off run failed:", err);
  process.exitCode = 1;
});
