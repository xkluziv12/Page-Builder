import { eq } from "drizzle-orm";
import { db, promptsTable, promptPublishesTable } from "@workspace/db";
import type { Prompt } from "@workspace/db";
import { writePromptFile } from "./googleDrive";

export type TargetResult = {
  ok: boolean;
  detail: string;
  reference: string | null;
};

export type PublishOutcome = {
  prompt: Prompt;
  drive: TargetResult;
};

/**
 * Publish a prompt to the durable master (Google Drive).
 *
 * The DB row is assumed to already hold the content to publish and the bumped
 * version. Drive runs as an independent target: it never throws, and a status
 * is returned so the UI can surface failure without a silent fallback. A
 * successful Drive write persists the (possibly new) file id mapping, and the
 * attempt is recorded in the publish history.
 *
 * NOTE: prompts are authored upstream in GITHUB_SOURCE_REPO and pulled into the
 * DB read-only by the git auto-sync. There is intentionally no outbound GitHub
 * publish here — the source repo is the durable git master.
 */
export async function publishPromptTargets(
  prompt: Prompt,
): Promise<PublishOutcome> {
  const drive = await writePromptFile({
    fileId: prompt.driveFileId,
    name: `${brandLabel(prompt.brand)} — ${prompt.name}.md`,
    content: prompt.content,
  }).catch((err: unknown) => failure(err));

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

  // Stamp last published time when the master succeeded.
  if (drive.ok) {
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
    driveStatus: drive.ok ? "ok" : "failed",
    driveDetail: drive.detail,
    driveFileId: drive.reference ?? prompt.driveFileId,
  });

  return { prompt: updated, drive };
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
