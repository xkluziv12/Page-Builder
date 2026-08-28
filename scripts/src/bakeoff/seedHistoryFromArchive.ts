/**
 * One-off script: folds the existing dated archive/<folder>/results.json snapshots
 * into the frontend's history dataset, so they appear as selectable dated
 * leaderboard tabs alongside future harness-archived runs. Run manually
 * (`pnpm --filter @workspace/scripts exec tsx src/bakeoff/seedHistoryFromArchive.ts`)
 * — it is NOT part of the normal bake-off run and never re-runs automatically,
 * so re-running it just re-syncs the same three folders idempotently.
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { archiveSnapshot } from "./history.js";
import type { BakeoffResults } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = resolve(HERE, "archive");

const FOLDERS: Array<{ folder: string; label: string; blurb: string }> = [
  {
    folder: "2026-06-23-full-adherence",
    label: "2026-06-23 — Full Adherence",
    blurb:
      "Full adherence to the human checklist: verbatim mini-prompts + real fixtures, intro handshake validated, seo-verify/verify-links verdicts acted on. Sonnet-tier baseline, GMB + No-GMB, 4 models. Effort: unknown (recorded before effort tracking existed).",
  },
  {
    folder: "2026-06-23-opus-tier-4model",
    label: "2026-06-23 — Opus-tier (4 model, GMB)",
    blurb:
      "Intermediate snapshot preserving the GMB scenario data captured during the Opus-tier run just before GMB was dropped. 4 models, OpenAI = ERROR (pre background-mode fix). Effort: unknown (recorded before effort tracking existed).",
  },
  {
    folder: "2026-06-23-opus-tier-5model",
    label: "2026-06-23 — Opus-tier (5 model, No-GMB)",
    blurb:
      "Top-tier No-GMB-only deliverable: Claude Opus 4.8 + Gemini 3.1 Pro + Grok 4.3 + both OpenAI tiers (gpt-5.5 standard and gpt-5.5-pro via background mode). Effort: unknown (recorded before effort tracking existed).",
  },
];

async function main(): Promise<void> {
  for (const { folder, label, blurb } of FOLDERS) {
    const dir = join(ARCHIVE_DIR, folder);
    const raw = await readFile(join(dir, "results.json"), "utf8");
    const results = JSON.parse(raw) as BakeoffResults;
    // Historical entries never recorded an effort setting — mark it explicitly
    // "unknown" rather than guessing, per the project's fail-loud convention.
    for (const scenario of results.scenarios) {
      for (const model of scenario.models) {
        if (model.effort === undefined) (model as unknown as Record<string, unknown>).effort = null;
      }
    }
    await archiveSnapshot(results, {
      runId: folder,
      label,
      blurb,
      sourceScreenshotRoot: join(dir, "screenshots"),
    });
    console.log(`Seeded history entry: ${folder}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
