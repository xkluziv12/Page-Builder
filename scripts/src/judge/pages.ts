import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The three pages under test. They are the OLD bake-off (no-GMB scenario)
 * versions, because that is the only run where all three of these specific
 * models built the same page side-by-side under one shared grounding — i.e. the
 * only apples-to-apples set containing Sonnet 4.6, GPT-5.5, and Gemini 3.1 Pro.
 *
 * Pages are presented to every judge BLIND, as "Page A/B/C", so no judge can
 * favour (or punish) a model it recognises. The label→model mapping below is
 * revealed only in the final report, never to the judges.
 */
const WANT = [
  { label: "A", model: "claude-sonnet-4-6", nice: "Sonnet 4.6" },
  { label: "B", model: "gpt-5.5", nice: "GPT-5.5" },
  { label: "C", model: "gemini-3.1-pro-preview", nice: "Gemini 3.1 Pro" },
] as const;

export interface JudgePage {
  label: string;
  model: string;
  nice: string;
  html: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OLD_BAKEOFF = resolve(
  __dirname,
  "../../../artifacts/bake-off/src/data/old-bakeoff.json",
);

export async function loadPages(): Promise<JudgePage[]> {
  const raw = await readFile(OLD_BAKEOFF, "utf8");
  const data = JSON.parse(raw) as {
    scenarios: { id: string; models: { id: string; model: string; html?: string }[] }[];
  };
  const scenario = data.scenarios.find((s) => s.id === "no-gmb");
  if (!scenario) throw new Error("no-gmb scenario not found in old-bakeoff.json");

  return WANT.map((w) => {
    const m = scenario.models.find((x) => x.model === w.model);
    if (!m || !m.html || !m.html.trim()) {
      throw new Error(`Page HTML for ${w.model} not found/empty in old-bakeoff no-gmb scenario.`);
    }
    return { label: w.label, model: w.model, nice: w.nice, html: m.html };
  });
}
