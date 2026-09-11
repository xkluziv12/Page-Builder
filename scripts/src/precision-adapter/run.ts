import { buildRecord, MAX_REPAIR_TURNS, TARGET } from "./buildRecord.js";

/**
 * CLI entry point for the target-adapter proof.
 *
 *   npx tsx scripts/src/precision-adapter/run.ts
 *
 * Prints the final validation result, the number of repair turns used, and, on
 * success, the full JSON record. Anything that is NOT a normal validation
 * failure (missing credential, API error, timeout, malformed prompt pack) exits
 * non-zero with the real error, never a summarised one.
 */

function rule(title: string): void {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

async function main(): Promise<number> {
  rule(`Precision E-Cycle target-adapter proof: ${TARGET.city}, ${TARGET.state}`);

  const outcome = await buildRecord();

  rule("RESULT");
  console.log(`model:            ${outcome.model}`);
  console.log(`credential from:  ${outcome.authSource}`);
  console.log(`target:           ${outcome.target.city}, ${outcome.target.state} (slug "${outcome.target.slug}")`);
  console.log(`validation:       ${outcome.ok ? "PASS" : "FAIL"}`);
  console.log(`repair turns:     ${outcome.repairTurns} of ${MAX_REPAIR_TURNS} allowed`);
  console.log(
    `visible words:    ${outcome.visibleWords === null ? "not countable" : outcome.visibleWords}`,
  );

  if (!outcome.ok) {
    rule(`REMAINING FAILURES (${outcome.errors.length})`);
    outcome.errors.forEach((e, i) => console.log(`${i + 1}. ${e}`));
    return 1;
  }

  rule("RECORD");
  console.log(JSON.stringify(outcome.record, null, 2));
  return 0;
}

// Fail loud: log the real error and exit non-zero. No swallowing, no fallback.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error("\n[run] the adapter run failed:");
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  },
);
