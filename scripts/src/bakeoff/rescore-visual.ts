import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreModels } from "./score.js";
import { judgeVisual } from "./visual.js";
import type { BakeoffResults } from "./types.js";

/**
 * Re-run ONLY the visual judge against an existing bake-off result.
 *
 * The full bake-off (`pnpm bakeoff`) makes live calls to four LLM providers. This
 * script reuses the already-saved model HTML in `results.json`, renders each
 * model's page + the real reference page to screenshots, recomputes the visual
 * score (perceptual pixel-diff + optional vision-LLM) and the composite, writes
 * the screenshots into the viewer's public dir, and saves the updated JSON.
 *
 * Use it to add/refresh the visual judge without burning provider tokens.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = resolve(HERE, "../../../artifacts/bake-off/src/data/results.json");
const REFERENCE_HTML_PATH = resolve(HERE, "../../src/bakeoff/reference/billings-mt.html");
const SCREENSHOT_DIR = resolve(HERE, "../../../artifacts/bake-off/public/screenshots");
const SCREENSHOT_PREFIX = "screenshots";

/** Word-count floor is needed to recompute scores; mirror the registry default. */
async function wordCountFloor(): Promise<number> {
  const { buildRegistry } = await import("@workspace/mc-core");
  return buildRegistry().wordCountFloor;
}

async function main(): Promise<void> {
  const raw = await readFile(RESULTS_PATH, "utf8");
  const results = JSON.parse(raw) as BakeoffResults;
  const referenceHtml = await readFile(REFERENCE_HTML_PATH, "utf8");
  const floor = await wordCountFloor();

  const okTotal = results.scenarios
    .flatMap((s) => s.models)
    .filter((m) => m.status === "ok" && m.html).length;
  console.log(`Re-judging ${okTotal} successful model page(s) visually across ${results.scenarios.length} scenario(s)...`);
  if (okTotal === 0) {
    throw new Error("No successful models with HTML in results.json — nothing to render.");
  }

  // Per-scenario subdirs so identical model ids across scenarios don't collide.
  for (const scenario of results.scenarios) {
    const visual = await judgeVisual(scenario.models, referenceHtml, {
      outDir: join(SCREENSHOT_DIR, scenario.id),
      pathPrefix: `${SCREENSHOT_PREFIX}/${scenario.id}`,
      vision: true,
    });
    results.referenceScreenshot = visual.referenceScreenshot;
    for (const m of scenario.models) {
      m.screenshot = visual.screenshots.get(m.id) ?? null;
    }
    scoreModels(scenario.models, floor, referenceHtml, visual.verdicts);
    scenario.models.sort((a, b) => {
      if (a.status === "error" && b.status !== "error") return 1;
      if (b.status === "error" && a.status !== "error") return -1;
      return (b.scores?.composite ?? -1) - (a.scores?.composite ?? -1);
    });
  }

  await writeFile(RESULTS_PATH, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nUpdated ${RESULTS_PATH}`);
  for (const scenario of results.scenarios) {
    console.log(`\n[${scenario.label}]`);
    for (const m of scenario.models) {
      if (m.status !== "ok" || !m.scores) {
        console.log(`  ${m.label}: ${m.status === "ok" ? "—" : "ERROR"}`);
        continue;
      }
      const s = m.scores;
      const llm = s.visualLlm == null ? "n/a" : `${s.visualLlm}`;
      console.log(
        `  ${m.label}: visual=${s.visualMatch} (pixel=${s.visualPixel} llm=${llm} tokens=${s.visualTokens}) composite=${s.composite}`,
      );
    }
  }
}

main().catch((err) => {
  console.error("Visual rescore failed:", err);
  process.exitCode = 1;
});
