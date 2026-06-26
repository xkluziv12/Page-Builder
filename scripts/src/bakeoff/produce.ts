import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegistry,
  parseSchema,
  runCheckers,
  type RunContext,
} from "@workspace/mc-core";
import { gmbSchemaPrompt, schemaPrompt, type PromptVars } from "./miniPrompts.js";
import { loadDesignFixtures } from "./fixtures.js";
import { estimateCost } from "./cost.js";
import { runConversation } from "./conversation.js";
import { runRoutedConversation } from "./routed.js";
import { generateSharedGrounding, type SharedGrounding } from "./grounding.js";
import { gmbContextSuffix, resolveGmbProfile } from "./gmb.js";
import { resolveTarget } from "./target.js";
import {
  buildModelsForIds,
  resolveModelId,
  resolveRouting,
  routedModelIds,
  type ResolvedRouting,
  type RoutedModel,
} from "./routing.js";
import type { PhaseTiming } from "./types.js";
import type { BakeoffResults, ModelResult, ScenarioResult } from "./types.js";

/**
 * PRODUCE — the operator-facing page builder behind the two plain-language modes:
 *
 *   "run this through 1 llm"        → BAKEOFF_PRODUCE_MODE=single  (+ BAKEOFF_MODEL)
 *   "run this through the multi llm" → BAKEOFF_PRODUCE_MODE=routed
 *
 * Both drive the SAME build → design-gate → SEO → SEO-verify → schema →
 * link-verify pipeline; the only difference is WHO runs each phase. The existing
 * 6-model comparison (`run.ts`, "all of them") is untouched.
 *
 * SINGLE mode reuses the faithful continuous-chat engine (runConversation) with
 * one chosen model. ROUTED mode uses runRoutedConversation: a main model per
 * phase with OpenAI GPT-5.4 as the backup that auto-takes over on error/refusal/
 * invalid output. Output is written to a SEPARATE produce.json so it never
 * clobbers the comparison results.json, and surfaces in the Bake-Off viewer
 * under the "Produced Page" dataset (copy boxes, preview, schema, checkers).
 *
 * Target + scenario are env-driven so the agent can wire them per chat. A NEW GMB
 * page MUST supply its verified GMB block (BAKEOFF_GMB_JSON) — never invented.
 */

const MODE = (process.env.BAKEOFF_PRODUCE_MODE ?? "").toLowerCase();
const SINGLE_MODEL = process.env.BAKEOFF_MODEL ?? "";
const SCENARIO = (process.env.BAKEOFF_SCENARIO ?? "no-gmb").toLowerCase();

const TARGET = resolveTarget();

const BUSINESS_NAME = "STS Electronic Recycling";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(HERE, "../../../artifacts/bake-off/src/data/produce.json");

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

/** Author the shared grounding with a main→backup fallback (routed mode). */
async function authorGroundingWithFallback(
  main: RoutedModel,
  backup: RoutedModel,
): Promise<SharedGrounding> {
  try {
    return await generateSharedGrounding(main.complete, TARGET.city, TARGET.state, TARGET.niche);
  } catch (err) {
    console.log(
      `  ! grounding via ${main.label} failed (${err instanceof Error ? err.message : String(err)}); ` +
        `falling back to ${backup.label}.`,
    );
    return await generateSharedGrounding(backup.complete, TARGET.city, TARGET.state, TARGET.niche);
  }
}

function describeRouting(r: ResolvedRouting): string {
  return (
    `build:${r.build.main.id} seo:${r.seo.main.id} verify:${r["seo-verify"].main.id} ` +
    `schema:${r.schema.main.id} links:${r["verify-links"].main.id} · backup:${r.build.backup.id}`
  );
}

interface RunOutcome {
  html: string;
  schema: string;
  totalMs: number;
  turns: { phase: string; ms: number; summary: string; verdict?: "passed" | "failed" | null }[];
}

async function main(): Promise<void> {
  if (MODE !== "single" && MODE !== "routed") {
    throw new Error(
      `Set BAKEOFF_PRODUCE_MODE=single|routed. ` +
        `"single" = run EVERY phase through one model (set BAKEOFF_MODEL, e.g. openai, claude, gemini, grok, openai-54). ` +
        `"routed" = the multi-LLM per-phase routing with GPT-5.4 backup.`,
    );
  }

  const isGmb = SCENARIO === "gmb";
  if (SCENARIO !== "gmb" && SCENARIO !== "no-gmb") {
    throw new Error(`BAKEOFF_SCENARIO must be "no-gmb" or "gmb" (got "${SCENARIO}").`);
  }

  console.log(`Produce: mode=${MODE}, scenario=${SCENARIO}, target=${TARGET.city}, ${TARGET.state} — ${TARGET.url}`);

  const fixtures = loadDesignFixtures();
  console.log(
    `Loaded design fixtures: page-builder ${fixtures.pageBuilder.length}, design-tier2 ${fixtures.designTier2.length}, ` +
      `seo-data ${fixtures.seoData.length}, seo-audit ${fixtures.seoAudit.length}, schema-gen ${fixtures.schemaGenerator.length} chars.`,
  );

  const gmb = isGmb ? resolveGmbProfile(TARGET) : null;
  const introEnrichment = isGmb ? gmbContextSuffix(gmb!) : "";
  const schemaPromptFor: (vars: PromptVars) => string = isGmb
    ? (vars) =>
        gmbSchemaPrompt(vars, {
          cid: gmb!.cid,
          gmbUrl: gmb!.gmbUrl,
          businessName: gmb!.businessName,
          street: gmb!.street,
          zip: gmb!.zip,
          phone: gmb!.phone,
          lat: gmb!.lat,
          lng: gmb!.lng,
        })
    : (vars) => schemaPrompt(vars);
  const verifiedCid = isGmb ? gmb!.cid : null;
  const ctx: RunContext = isGmb ? { ...baseContext(), verifiedCid: gmb!.cid } : baseContext();

  let grounding: SharedGrounding;
  let outcome: RunOutcome;
  let runId: string;
  let runLabel: string;
  let runModelTag: string;
  let runProvider: string;
  let costModelTag: string;
  let routingNote: string;

  if (MODE === "single") {
    if (!SINGLE_MODEL.trim()) {
      throw new Error(
        `single mode requires BAKEOFF_MODEL (e.g. openai, chatgpt, claude, gemini, grok, openai-54).`,
      );
    }
    const id = resolveModelId(SINGLE_MODEL);
    const reg = await buildModelsForIds([id]);
    const model = reg.get(id)!;
    console.log(`Single engine: ${model.label} (${model.model}) runs every phase.`);
    grounding = await generateSharedGrounding(model.complete, TARGET.city, TARGET.state, TARGET.niche);
    const conv = await runConversation({
      ctx,
      complete: model.complete,
      fixtures,
      grounding: grounding.content,
      introEnrichment,
      schemaPromptFor,
    });
    outcome = { html: conv.html, schema: conv.schema, totalMs: conv.totalMs, turns: conv.turns };
    runId = `single-${model.id}`;
    runLabel = `${model.label} — single engine`;
    runModelTag = model.model;
    runProvider = model.provider;
    costModelTag = model.model;
    routingNote = `Single engine: ${model.label} (${model.model}) ran every phase through the same pipeline.`;
  } else {
    const reg = await buildModelsForIds(routedModelIds());
    const routing = resolveRouting(reg);
    console.log(`Routed (multi-LLM): ${describeRouting(routing)}`);
    grounding = await authorGroundingWithFallback(routing.grounding.main, routing.grounding.backup);
    const routed = await runRoutedConversation({
      ctx,
      fixtures,
      grounding: grounding.content,
      introEnrichment,
      schemaPromptFor,
      routing,
    });
    outcome = { html: routed.html, schema: routed.schema, totalMs: routed.totalMs, turns: routed.turns };
    const backups = routed.attribution.filter((a) => a.viaBackup);
    runId = "routed-multi";
    runLabel = "Routed (multi-LLM)";
    runModelTag = describeRouting(routing);
    runProvider = "Mixed (routed)";
    costModelTag = routing.build.main.model;
    routingNote =
      `Routed multi-LLM run. Per-phase mains: ${describeRouting(routing)}. ` +
      (backups.length
        ? `Backup (GPT-5.4) stepped in for: ${backups.map((b) => b.phase).join(", ")}.`
        : `No backup was needed — every main model succeeded.`);
  }

  // Assemble the ModelResult (mirrors run.ts's success path, minus the
  // reference-comparison scores: the produced page is for an arbitrary target,
  // so scoring it against the Billings reference would be meaningless — the
  // city-aware CHECKER suite is the meaningful, comparison-free quality signal).
  const timings: PhaseTiming[] = outcome.turns.map((t) => ({
    phase: t.phase,
    ms: t.ms,
    summary: t.summary,
    errorCount: 0,
    warningCount: 0,
    wordCount: 0,
    verdict: t.verdict,
  }));

  const parsedSchema = parseSchema(outcome.schema);
  const report = runCheckers({
    html: outcome.html,
    registry: ctx.registry,
    pageType: ctx.pageType,
    track: ctx.track,
    classification: ctx.classification,
    city: ctx.city,
    afterAudit: true,
    schema: outcome.schema,
    verifiedCid,
    businessName: BUSINESS_NAME,
    entities: [],
  });

  const schemaTiming = timings.find((t) => t.phase === "schema");
  if (schemaTiming) {
    schemaTiming.errorCount = report.errorCount;
    schemaTiming.warningCount = report.warningCount;
    schemaTiming.wordCount = report.wordCount;
  }

  const costEstimate = estimateCost({
    modelTag: costModelTag,
    timings,
    htmlChars: outcome.html.length,
    ctx,
    fixtures,
    grounding: grounding.content,
    introEnrichment,
  });

  const result: ModelResult = {
    id: runId,
    label: runLabel,
    provider: runProvider,
    model: runModelTag,
    status: "ok",
    error: null,
    research: {
      summary: grounding.content,
      entities: [],
      sources: [],
      flags: [],
      raw: grounding.content,
    },
    html: outcome.html,
    schema: outcome.schema,
    schemaValid: parsedSchema != null,
    checkerReport: report,
    linkAudit: report.linkAudit,
    timings,
    totalMs: outcome.totalMs,
    scores: null,
    screenshot: null,
    costEstimate,
  };

  const scenario: ScenarioResult = {
    id: isGmb ? "produce-gmb" : "produce",
    label: `${MODE === "single" ? "Single engine" : "Multi-LLM routed"} — ${isGmb ? "GMB" : "No-GMB"}`,
    description:
      `${MODE === "single" ? "One model ran every phase" : "Main-per-phase routing with GPT-5.4 backup"} ` +
      `of the same build → design-gate → SEO → SEO-verify → schema → link-verify pipeline for ` +
      `${TARGET.city}, ${TARGET.state}.`,
    notes: [
      routingNote,
      isGmb
        ? "GMB scenario: the verified Google Business Profile block (CID + full address) was supplied to the build and schema phases."
        : "No-GMB scenario: city/state targeting only — no CID, no street address, no local phone (per the No-GMB checklist).",
      `Cost is a best-effort estimate priced at the ${costModelTag} tier${MODE === "routed" ? " (representative — a routed run mixes provider tiers, so this is approximate)" : ""}; token usage is not captured.`,
      "Comparison scores (HTML/visual closeness) are omitted: this is a production page for an arbitrary target, not a re-run against the Billings reference. The checker report is the quality signal.",
    ],
    models: [result],
  };

  const output: BakeoffResults = {
    ranAt: new Date().toISOString(),
    target: TARGET,
    grounding: { source: grounding.source, content: grounding.content },
    scenarios: [scenario],
    referenceScreenshot: null,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n✓ Produced page written to ${OUTPUT_PATH}`);
  console.log(
    `  ${result.label}: ${(result.totalMs / 1000).toFixed(1)}s, ${report.errorCount} error(s), ` +
      `${report.warningCount} warning(s), schema ${result.schemaValid ? "valid" : "INVALID"}, ~$${costEstimate.totalUsd.toFixed(2)} est.`,
  );
  console.log(`  View it in the Bake-Off viewer under the "Produced Page" dataset.`);
}

main().catch((err) => {
  console.error("Produce run failed:", err);
  process.exitCode = 1;
});
