import { eq } from "drizzle-orm";
import { db, promptsTable, promptPublishesTable } from "@workspace/db";
import type { Prompt } from "@workspace/db";
import { commitPromptFile } from "./github";
import { writePromptFile } from "./googleDrive";

export type TargetResult = {
  ok: boolean;
  detail: string;
  reference: string | null;
};

export type PublishOutcome = {
  prompt: Prompt;
  git: TargetResult;
  drive: TargetResult;
};

/**
 * Publish a prompt to both durable masters (GitHub + Google Drive).
 *
 * The DB row is assumed to already hold the content to publish and the bumped
 * version. Git and Drive are treated as fully independent targets: each runs
 * regardless of the other's outcome, neither can throw, and a per-target status
 * is returned so the UI can surface partial success without a silent fallback.
 * A successful Drive write persists the (possibly new) file id mapping, and the
 * attempt is recorded in the publish history.
 */
export async function publishPromptTargets(
  prompt: Prompt,
): Promise<PublishOutcome> {
  const commitMessage = `${brandLabel(prompt.brand)} — ${prompt.name} (v${prompt.version})`;

  const [git, drive] = await Promise.all([
    commitPromptFile({
      path: prompt.gitPath,
      content: prompt.content,
      message: commitMessage,
    }).catch((err: unknown) => failure(err)),
    writePromptFile({
      fileId: prompt.driveFileId,
      name: `${brandLabel(prompt.brand)} — ${prompt.name}.md`,
      content: prompt.content,
    }).catch((err: unknown) => failure(err)),
  ]);

  let updated = prompt;

  // Persist a newly created Drive file id so future publishes update in place.
  if (drive.ok && drive.reference && drive.reference !== prompt.driveFileId) {
    const [row] = await db
      .update(promptsTable)
      .set({ driveFileId: drive.reference })
      .where(eq(promptsTable.id, prompt.id))
      .returning();
    if (row) updated = row;
  }

  // Stamp last published time when at least one master succeeded.
  if (git.ok || drive.ok) {
    const [row] = await db
      .update(promptsTable)
      .set({ lastPublishedAt: new Date() })
      .where(eq(promptsTable.id, prompt.id))
      .returning();
    if (row) updated = row;
  }

  await db.insert(promptPublishesTable).values({
    promptId: prompt.id,
    version: prompt.version,
    gitStatus: git.ok ? "ok" : "failed",
    gitDetail: git.detail,
    gitCommitSha: git.reference,
    driveStatus: drive.ok ? "ok" : "failed",
    driveDetail: drive.detail,
    driveFileId: drive.reference ?? prompt.driveFileId,
  });

  return { prompt: updated, git, drive };
}

function failure(err: unknown): TargetResult {
  return {
    ok: false,
    detail: err instanceof Error ? err.message : "Unexpected error.",
    reference: null,
  };
}

export function brandLabel(brand: string): string {
  switch (brand) {
    case "sts":
      return "STS";
    case "dcd":
      return "DCD";
    case "technocycle":
      return "Technocycle";
    default:
      return brand.toUpperCase();
  }
}
