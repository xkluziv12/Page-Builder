/**
 * Offline backfill of per-model COST ESTIMATES into existing bake-off result
 * files. Token usage was not captured when these runs executed, so this replays
 * each model's recorded turn sequence through the same `estimateCost` the live
 * harness now uses. Idempotent: re-running overwrites the estimate in place.
 *
 *   pnpm --filter @workspace/scripts run bakeoff:cost
 *
 * Targets the current dataset, the legacy dataset, and every history snapshot.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunContext } from "@workspace/mc-core";
import { estimateCost, costFromUsage, billingsNoGmbContext } from "./cost.js";
import { gmbContextSuffix, PORTLAND_GMB } from "./gmb.js";
import { loadDesignFixtures } from "./fixtures.js";
import type { BakeoffResults, ScenarioResult, ModelResult, TokenUsage } from "./types.js";

// This file lives at <repo>/scripts/src/bakeoff/backfill-cost.ts, so the repo
// root is three directories up. Resolve from here (not cwd) because `pnpm
// --filter` runs with cwd set to the package dir, not the workspace root.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const HISTORY_DIR = resolve(ROOT, "artifacts/bake-off/src/data/history");
const TARGETS = [
  "artifacts/bake-off/src/data/results.json",
  "artifacts/bake-off/src/data/old-bakeoff.json",
  ...(existsSync(HISTORY_DIR)
    ? readdirSync(HISTORY_DIR)
        .filter((name) => name.endsWith(".json"))
        .filter((name) => name !== "manifest.json")
        .sort()
        .map((name) => `artifacts/bake-off/src/data/history/${name}`)
    : []),
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

function measuredUsageWithTurns(model: ModelResult): TokenUsage | null {
  if (!model.usage) return null;
  const aggregateUsage = (): TokenUsage => {
    const { turns: _unverifiedTurns, ...usage } = model.usage!;
    return usage;
  };
  if (!model.transcriptPath) return aggregateUsage();
  const transcriptFile = resolve(ROOT, "artifacts/bake-off/public", model.transcriptPath);
  if (!existsSync(transcriptFile)) return aggregateUsage();
  try {
    const transcript = JSON.parse(readFileSync(transcriptFile, "utf8")) as {
      turns?: Array<{ usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null }>;
    };
    const turns = (transcript.turns ?? [])
      .filter((turn) => turn.usage)
      .map((turn) => turn.usage!);
    if (!turns.length) return aggregateUsage();
    const totals = turns.reduce(
      (acc, turn) => ({
        inputTokens: acc.inputTokens + turn.inputTokens,
        cachedInputTokens: acc.cachedInputTokens + turn.cachedInputTokens,
        outputTokens: acc.outputTokens + turn.outputTokens,
      }),
      { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    );
    // History snapshots can point at a shared transcript filename that was
    // later overwritten by a newer run. Only attach per-turn bands when the
    // transcript is demonstrably the transcript for this model result.
    if (
      totals.inputTokens !== model.usage.inputTokens ||
      totals.cachedInputTokens !== model.usage.cachedInputTokens ||
      totals.outputTokens !== model.usage.outputTokens
    ) {
      return aggregateUsage();
    }
    return { ...model.usage, turns };
  } catch {
    return model.usage;
  }
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
      const measuredUsage = measuredUsageWithTurns(model);
      if (measuredUsage) {
        // Reprice measured runs with the current provider-specific rate card,
        // including each provider's actual cache-hit price.
        model.usage = measuredUsage;
        model.costEstimate = costFromUsage(model.model, measuredUsage);
        updated++;
        const c = model.costEstimate;
        console.log(
          `  [${scenario.id}] ${model.id.padEnd(11)} ${model.model.padEnd(28)} ` +
            `measured in ${String(c.inputTokens).padStart(8)} / out ${String(c.outputTokens).padStart(6)} tok ` +
            `→ $${c.totalUsd.toFixed(2)}`,
        );
        continue;
      }
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
