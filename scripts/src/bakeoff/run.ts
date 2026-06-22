import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
import { GenericLlmEngine } from "./engine.js";
import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeOpenRouterComplete,
} from "./providers.js";
import { generateSharedGrounding, researchProviderFor, type SharedGrounding } from "./grounding.js";
import { scoreModels } from "./score.js";
import type { BakeoffResults, ModelResult, PhaseTiming } from "./types.js";

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
const OPENAI_MODEL = "gpt-5.4";

const PHASES: PhaseName[] = ["research", "build", "audit", "schema"];

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(HERE, "../../../artifacts/bake-off/src/data/results.json");
const REFERENCE_HTML_PATH = resolve(HERE, "../../src/bakeoff/reference/billings-mt.html");

interface ModelSpec {
  id: string;
  label: string;
  provider: string;
  model: string;
  engine: AIEngine;
}

function buildContext(): RunContext {
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

async function main(): Promise<void> {
  console.log(`Bake-Off target: ${TARGET.city}, ${TARGET.state} — ${TARGET.url}`);

  const claudeComplete = makeClaudeComplete(CLAUDE_MODEL);
  const geminiComplete = makeGeminiComplete(GEMINI_MODEL);
  const openaiComplete = makeOpenAIComplete(OPENAI_MODEL);
  const grokModel = await discoverNewestGrok();
  console.log(`Discovered newest Grok tag: ${grokModel}`);
  const grokComplete = makeOpenRouterComplete(grokModel);

  const referenceHtml = await readFile(REFERENCE_HTML_PATH, "utf8");
  console.log(`Loaded reference page (${referenceHtml.length} chars) for closeness scoring.`);

  console.log("Authoring shared research grounding (once)...");
  const grounding = await generateSharedGrounding(
    claudeComplete,
    TARGET.city,
    TARGET.state,
    TARGET.niche,
  );

  const specs: Array<ModelSpec & { synth: typeof claudeComplete }> = [
    {
      id: "claude",
      label: "Claude Sonnet 4.6",
      provider: "Anthropic",
      model: CLAUDE_MODEL,
      engine: new GenericLlmEngine("claude", claudeComplete),
      synth: claudeComplete,
    },
    {
      id: "gemini",
      label: "Gemini 3.1 Pro",
      provider: "Google",
      model: GEMINI_MODEL,
      engine: new GenericLlmEngine("gemini", geminiComplete),
      synth: geminiComplete,
    },
    {
      id: "openai",
      label: "OpenAI GPT-5.4",
      provider: "OpenAI",
      model: OPENAI_MODEL,
      engine: new GenericLlmEngine("openai", openaiComplete),
      synth: openaiComplete,
    },
    {
      id: "grok",
      label: "Grok (xAI)",
      provider: "xAI via OpenRouter",
      model: grokModel,
      engine: new GenericLlmEngine("grok", grokComplete),
      synth: grokComplete,
    },
  ];

  const ctx = buildContext();
  console.log(`Running ${specs.length} models in parallel...`);

  const results = await Promise.all(
    specs.map((spec) => {
      const researchProvider = researchProviderFor(grounding, spec.synth);
      return runOneModelWith(spec, ctx, researchProvider);
    }),
  );

  scoreModels(results, ctx.registry.wordCountFloor, referenceHtml);
  results.sort((a, b) => (b.scores?.composite ?? -1) - (a.scores?.composite ?? -1));

  const output: BakeoffResults = {
    ranAt: new Date().toISOString(),
    target: TARGET,
    grounding: { source: grounding.source, content: grounding.content },
    notes: [
      "Each model runs the OLD No-GMB checklist exactly as a VA would: Page Builder (MASTER PAGE BUILDER v3.5) → SEO Audit (MASTER SEO AUDIT v10.12.3) → deterministic Schema (No-GMB: city/state targeting, NO CID, NO street address) → checker/link-audit verify. Joomla publish is intentionally NOT run.",
      "All four models run through the Replit AI Integrations proxy (no raw provider keys).",
      "Schema is generated deterministically (identical across models) — exactly what the VA's 'Auto-Generate Schema' button does in No-GMB mode — so it is not a model differentiator.",
      "htmlMatch / visualMatch score each model's final page against the real published Billings, MT page (scripts/src/bakeoff/reference/billings-mt.html): htmlMatch = tag-structure cosine + visible-text overlap; visualMatch = design-token (colors/CSS vars/fonts/layout-class) overlap.",
      "Research grounding is a single shared model-authored brief — live web grounding (Perplexity/SerpAPI) is not configured in this environment.",
      "A model failing a phase is isolated and does not abort the others.",
    ],
    models: results,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");
  console.log(`\nResults written to ${OUTPUT_PATH}`);
  for (const m of results) {
    const score = m.scores ? `${m.scores.composite}/100` : "—";
    console.log(`  ${m.label}: ${m.status === "ok" ? score : `ERROR (${m.error})`}`);
  }
}

async function runOneModelWith(
  spec: ModelSpec,
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
      const out = await runPhase(phase, ctx, state, { engine: spec.engine, publisher, researchProvider });
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
