import { BakeoffResults } from "@/types";
import currentData from "@/data/results.json";
import oldData from "@/data/old-bakeoff.json";
import produceData from "@/data/produce.json";
import historyManifest from "@/data/history/manifest.json";

export interface Dataset {
  id: string;
  label: string;
  /** Short blurb shown under the switcher. */
  blurb: string;
  results: BakeoffResults;
  /** ISO timestamp this dataset represents, when known — drives history sort
   * order and display. Undefined for the hand-maintained current/old/produce
   * entries (they're pinned first regardless). */
  ranAt?: string;
}

/**
 * Every dated run snapshot under `data/history/*.json`, eagerly bundled at
 * build time. New entries appear automatically the next time the app is
 * built/rebuilt — the harness (`archiveSnapshot`) and the archive-seed script
 * are the only writers of this directory; nothing here needs manual editing to
 * add a future run.
 */
const historyFiles = import.meta.glob<{ default: BakeoffResults }>("./history/*.json", {
  eager: true,
});

const HISTORY_DATASETS: Dataset[] = (historyManifest as Array<{
  id: string;
  file: string;
  label: string;
  blurb: string;
  ranAt: string;
}>)
  .map((entry): Dataset | null => {
    const mod = historyFiles[`./history/${entry.file}`];
    if (!mod) return null;
    return {
      id: `history-${entry.id}`,
      label: entry.label,
      blurb: entry.blurb,
      results: mod.default,
      ranAt: entry.ranAt,
    };
  })
  .filter((d): d is Dataset => d !== null)
  .sort((a, b) => (a.ranAt! < b.ranAt! ? 1 : -1));

/**
 * Derives a human-readable model line-up from a results file's own model
 * entries, so the blurb can never drift out of sync when results.json is
 * regenerated with a different set of models.
 */
function summarizeModelLineup(results: BakeoffResults): string {
  const labels = Array.from(
    new Set(results.scenarios.flatMap((scenario) => scenario.models.map((m) => m.label))),
  );
  return labels.length > 0 ? labels.join(", ") : "no models recorded";
}

/**
 * The bake-off runs the viewer can switch between. "current" is the latest
 * top-tier run; "old" is the archived full-adherence run (different model
 * line-up). Both are No-GMB only.
 */
export const DATASETS: Dataset[] = [
  {
    id: "current",
    label: "Current Bake-Off",
    blurb: `Latest top-tier run — ${summarizeModelLineup(currentData as BakeoffResults)}. Fairness-fixed (neutralized intro), with real measured token cost + full per-turn transcripts.`,
    results: currentData as BakeoffResults,
  },
  {
    id: "old",
    label: "Old Bake-Off",
    blurb:
      "Earlier full-adherence run — Claude Sonnet 4.6, GPT-5.5, Gemini 3.1 Pro, Grok 4.3.",
    results: oldData as BakeoffResults,
  },
  {
    id: "produce",
    label: "Produced Page",
    blurb:
      "Production builder — \"run this through 1 llm\" (single engine) or \"run this through the multi llm\" (main-per-phase routing with a GPT-5.4 backup).",
    results: produceData as BakeoffResults,
  },
  ...HISTORY_DATASETS,
];

export const DEFAULT_DATASET_ID = DATASETS[0].id;

export function getDataset(id: string | undefined): Dataset {
  return DATASETS.find((d) => d.id === id) ?? DATASETS[0];
}
