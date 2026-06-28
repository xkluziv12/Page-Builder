/**
 * Offline backfill of per-model COST ESTIMATES into existing bake-off result
 * files. Token usage was not captured when these runs executed, so this replays
 * each model's recorded turn sequence through the same `estimateCost` the live
 * harness now uses. Idempotent: re-running overwrites the estimate in place.
 *
 *   pnpm --filter @workspace/scripts run bakeoff:cost
 *
 * Targets:
 *  - artifacts/bake-off/src/data/results.json     (current top-tier run)
 *  - artifacts/bake-off/src/data/old-bakeoff.json (archived full-adherence run)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunContext } from "@workspace/mc-core";
import { estimateCost, billingsNoGmbContext } from "./cost.js";
import { gmbContextSuffix, PORTLAND_GMB } from "./gmb.js";
import { loadDesignFixtures } from "./fixtures.js";
import type { BakeoffResults, ScenarioResult, ModelResult } from "./types.js";

// This file lives at <repo>/scripts/src/bakeoff/backfill-cost.ts, so the repo
// root is three directories up. Resolve from here (not cwd) because `pnpm
// --filter` runs with cwd set to the package dir, not the workspace root.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const TARGETS = [
  "artifacts/bake-off/src/data/results.json",
  "artifacts/bake-off/src/data/old-bakeoff.json",
];

function contextForScenario(scenarioId: string): { ctx: RunContext; introEnrichment: string } {
  if (scenarioId === "gmb") {
    return {
      ctx: { ...billingsNoGmbContext(), verifiedCid: PORTLAND_GMB.cid },
      introEnrichment: gmbContextSuffix(PORTLAND_GMB),
    };
  }
  return { ctx: billingsNoGmbContext(), introEnrichment: "" };
}

function backfillFile(relPath: string): void {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) {
    console.log(`skip (missing): ${relPath}`);
    return;
  }
  const data = JSON.parse(readFileSync(abs, "utf8")) as BakeoffResults;
  const fixtures = loadDesignFixtures();
  const grounding = data.grounding?.content ?? "";
  if (!grounding) {
    throw new Error(`${relPath}: no grounding.content — cannot estimate input size honestly.`);
  }

  let updated = 0;
  for (const scenario of data.scenarios as ScenarioResult[]) {
    const { ctx, introEnrichment } = contextForScenario(scenario.id);
    for (const model of scenario.models as ModelResult[]) {
      if (model.status !== "ok" || !model.timings?.length) {
        model.costEstimate = null;
        continue;
      }
      model.costEstimate = estimateCost({
        modelTag: model.model,
        timings: model.timings,
        htmlChars: (model.html ?? "").length,
        ctx,
        fixtures,
        grounding,
        introEnrichment,
      });
      updated++;
      const c = model.costEstimate;
      console.log(
        `  [${scenario.id}] ${model.id.padEnd(11)} ${model.model.padEnd(28)} ` +
          `in ${String(c.inputTokens).padStart(8)} / out ${String(c.outputTokens).padStart(6)} tok ` +
          `→ $${c.totalUsd.toFixed(2)}`,
      );
    }
  }
  writeFileSync(abs, JSON.stringify(data, null, 2));
  console.log(`✓ ${relPath}: backfilled ${updated} model(s)\n`);
}

for (const t of TARGETS) {
  console.log(`Backfilling ${t} …`);
  backfillFile(t);
}
console.log("Done.");
