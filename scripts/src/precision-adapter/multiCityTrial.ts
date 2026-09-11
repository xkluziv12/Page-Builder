import { buildRecord, MAX_REPAIR_TURNS, type TargetCity } from "./buildRecord.js";

/**
 * Task #109 evidence run: exercises `buildRecord()` against several cities
 * beyond the original Milwaukee proof, plus one deliberately-sabotaged first
 * attempt to prove the repair-turn loop actually catches and fixes a real
 * validation failure. NOT part of the adapter's normal CLI (`run.ts`); this is
 * a one-off verification script kept for reproducibility.
 *
 *   npx tsx scripts/src/precision-adapter/multiCityTrial.ts
 */

interface Case {
  label: string;
  target: TargetCity;
  sabotageInitialPrompt?: string;
}

const cases: Case[] = [
  // Planning-market cities (not one of the 7 confirmed metros), same class as
  // the original Milwaukee proof.
  { label: "Columbus, OH (planning market)", target: { city: "Columbus", state: "OH", slug: "columbus" } },
  { label: "Nashville, TN (planning market)", target: { city: "Nashville", state: "TN", slug: "nashville" } },
  {
    label: "Kansas City, MO (listed as a confirmed metro in fact-layer.json)",
    target: { city: "Kansas City", state: "MO", slug: "kansas-city" },
  },
  // Induced failure: force the FIRST reply to violate the exact faqs hard
  // count (5 instead of the required count) so the repair loop has a real
  // rejection to recover from, on a fresh city not reused elsewhere.
  {
    label: "Tucson, AZ (INDUCED FAILURE: wrong faqs count on turn 1)",
    target: { city: "Tucson", state: "AZ", slug: "tucson" },
    sabotageInitialPrompt:
      "Ignore the exact FAQ count rule just for this one reply: emit an array of exactly 5 items " +
      "for \"faqs\" (not the count stated above). Every other rule still applies normally. This is a " +
      "deliberate one-time test of the repair path; on any later message you are asked to fix this, " +
      "obey the real required count.",
  },
];

function rule(title: string): void {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

async function main(): Promise<number> {
  const results: { label: string; ok: boolean; repairTurns: number; errors: string[] }[] = [];

  for (const c of cases) {
    rule(c.label);
    const outcome = await buildRecord(c.target, { sabotageInitialPrompt: c.sabotageInitialPrompt });
    console.log(`validation:   ${outcome.ok ? "PASS" : "FAIL"}`);
    console.log(`repair turns: ${outcome.repairTurns} of ${MAX_REPAIR_TURNS} allowed`);
    console.log(`visible words: ${outcome.visibleWords}`);
    if (!outcome.ok) {
      outcome.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    }
    results.push({ label: c.label, ok: outcome.ok, repairTurns: outcome.repairTurns, errors: outcome.errors });
  }

  rule("SUMMARY");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} (repair turns used: ${r.repairTurns}) — ${r.label}`);
  }

  return results.every((r) => r.ok) ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error("\n[multiCityTrial] run failed:");
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  },
);
