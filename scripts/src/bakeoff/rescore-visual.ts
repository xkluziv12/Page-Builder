import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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

  const ok = results.models.filter((m) => m.status === "ok" && m.html);
  console.log(`Re-judging ${ok.length} successful model page(s) visually...`);
  if (ok.length === 0) {
    throw new Error("No successful models with HTML in results.json — nothing to render.");
  }

  const visual = await judgeVisual(results.models, referenceHtml, {
    outDir: SCREENSHOT_DIR,
    pathPrefix: SCREENSHOT_PREFIX,
    vision: true,
  });

  for (const m of results.models) {
    m.screenshot = visual.screenshots.get(m.id) ?? null;
  }
  results.referenceScreenshot = visual.referenceScreenshot;

  scoreModels(results.models, floor, referenceHtml, visual.verdicts);
  results.models.sort((a, b) => (b.scores?.composite ?? -1) - (a.scores?.composite ?? -1));

  await writeFile(RESULTS_PATH, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nUpdated ${RESULTS_PATH}`);
  for (const m of results.models) {
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

main().catch((err) => {
  console.error("Visual rescore failed:", err);
  process.exitCode = 1;
});
