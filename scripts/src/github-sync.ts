import { mirrorToGitHub } from "@workspace/github-sync";

/**
 * One-off manual mirror push: workspace → GitHub (same engine as the
 * api-server's background auto-sync). Exits non-zero on failure.
 *
 *   pnpm --filter @workspace/scripts run github:sync
 */
async function main(): Promise<void> {
  console.log("Mirroring workspace to GitHub…");
  const summary = await mirrorToGitHub({ message: "Manual sync from Replit workspace" });
  if (!summary.ok) {
    console.error(`SYNC FAILED: ${summary.detail}`);
    for (const err of summary.errors.slice(1)) console.error(`  - ${err}`);
    process.exit(1);
  }
  if (summary.skipped) {
    console.log(summary.detail);
  } else {
    console.log(summary.detail);
    console.log(`Commit: ${summary.commitSha}`);
  }
}

void main();
