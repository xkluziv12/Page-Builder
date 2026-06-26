import { BakeoffResults } from "@/types";
import currentData from "@/data/results.json";
import oldData from "@/data/old-bakeoff.json";

export interface Dataset {
  id: string;
  label: string;
  /** Short blurb shown under the switcher. */
  blurb: string;
  results: BakeoffResults;
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
    blurb:
      "Latest top-tier run — Claude Opus, GPT-5.5 / GPT-5.5-pro, Gemini 3.1 Pro, Grok 4.3.",
    results: currentData as BakeoffResults,
  },
  {
    id: "old",
    label: "Old Bake-Off",
    blurb:
      "Earlier full-adherence run — Claude Sonnet 4.6, GPT-5.5, Gemini 3.1 Pro, Grok 4.3.",
    results: oldData as BakeoffResults,
  },
];

export const DEFAULT_DATASET_ID = DATASETS[0].id;

export function getDataset(id: string | undefined): Dataset {
  return DATASETS.find((d) => d.id === id) ?? DATASETS[0];
}
