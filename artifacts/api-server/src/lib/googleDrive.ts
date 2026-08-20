import { ReplitConnectors } from "@replit/connectors-sdk";
import type { TargetResult } from "./promptSync";

/**
 * Write a prompt's content to its mapped Google Drive file (creating it in the
 * configured folder if it does not exist yet).
 *
 * Uses the Replit Google Drive connector (blueprint id="google-drive") via the
 * connectors proxy, which injects the OAuth token and handles refresh. The app
 * holds the `drive.file` scope, so it can only see/modify files it created —
 * which is why we auto-create the folder rather than relying on a pre-existing
 * external one.
 *
 * Config supplied at build time via env:
 *   - GOOGLE_DRIVE_PROMPTS_FOLDER_ID (optional). If unset, a folder named
 *     "M.A.R.K. Prompts" is found-or-created and used as the parent.
 *
 * Returns a structured result and never throws, so a Drive failure cannot abort
 * an otherwise-successful publish (git + DB stay intact and the target is
 * retryable). The (possibly newly created) Drive file id is returned as
 * `reference` so the caller can persist the mapping.
 */
const FOLDER_NAME = "M.A.R.K. Prompts";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_MIME = "text/markdown";

export async function writePromptFile(opts: {
  fileId: string | null;
  name: string;
  content: string;
}): Promise<TargetResult> {
  // Update in place when we already have a mapped file.
  if (opts.fileId) {
    const updated = await uploadMedia(opts.fileId, opts.content);
    if (!updated.ok) {
      return {
        ok: false,
        detail: `Google Drive update failed (HTTP ${updated.status}).${detailText(updated.text)}`,
        reference: null,
      };
    }
    return {
      ok: true,
      detail: "Updated existing Google Drive file.",
      reference: opts.fileId,
    };
  }

  // Otherwise resolve the parent folder and create a new file.
  const folder = await resolveFolderId();
  if (!folder.ok) {
    return { ok: false, detail: folder.detail, reference: null };
  }

  const createRes = await drive("/drive/v3/files?fields=id", {
    method: "POST",
    json: { name: opts.name, parents: [folder.id], mimeType: FILE_MIME },
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    return {
      ok: false,
      detail: `Google Drive create failed (HTTP ${createRes.status}).${detailText(text)}`,
      reference: null,
    };
  }
  const created = (await createRes.json()) as { id?: string };
  if (!created.id) {
    return {
      ok: false,
      detail: "Google Drive create returned no file id.",
      reference: null,
    };
  }

  const media = await uploadMedia(created.id, opts.content);
  if (!media.ok) {
    return {
      ok: false,
      detail: `Google Drive content upload failed (HTTP ${media.status}).${detailText(media.text)}`,
      reference: created.id,
    };
  }

  return {
    ok: true,
    detail: `Created file in "${FOLDER_NAME}".`,
    reference: created.id,
  };
}

async function uploadMedia(
  fileId: string,
  content: string,
): Promise<{ ok: boolean; status: number; text?: string }> {
  const res = await drive(
    `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
    { method: "PATCH", media: content },
  );
  if (res.ok) return { ok: true, status: res.status };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, text };
}

async function resolveFolderId(): Promise<
  { ok: true; id: string } | { ok: false; detail: string }
> {
  const configured = process.env.GOOGLE_DRIVE_PROMPTS_FOLDER_ID?.trim();
  if (configured) return { ok: true, id: configured };

  const query = `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  const searchRes = await drive(
    `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&spaces=drive`,
  );
  if (searchRes.ok) {
    const json = (await searchRes.json()) as { files?: { id?: string }[] };
    const existing = json.files?.[0]?.id;
    if (existing) return { ok: true, id: existing };
  } else if (searchRes.status !== 404) {
    const text = await searchRes.text().catch(() => "");
    return {
      ok: false,
      detail: `Google Drive folder lookup failed (HTTP ${searchRes.status}).${detailText(text)}`,
    };
  }

  const createRes = await drive("/drive/v3/files?fields=id", {
    method: "POST",
    json: { name: FOLDER_NAME, mimeType: FOLDER_MIME },
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    return {
      ok: false,
      detail: `Google Drive folder create failed (HTTP ${createRes.status}).${detailText(text)}`,
    };
  }
  const created = (await createRes.json()) as { id?: string };
  if (!created.id) {
    return { ok: false, detail: "Google Drive folder create returned no id." };
  }
  return { ok: true, id: created.id };
}

async function drive(
  path: string,
  init?: { method?: string; json?: unknown; media?: string },
): Promise<Response> {
  const connectors = new ReplitConnectors();
  const options: { method?: string; body?: string; headers?: Record<string, string> } =
    {};
  if (init?.method) options.method = init.method;
  if (init?.json !== undefined) {
    options.body = JSON.stringify(init.json);
    options.headers = { "Content-Type": "application/json" };
  } else if (init?.media !== undefined) {
    options.body = init.media;
    options.headers = { "Content-Type": FILE_MIME };
  }
  return connectors.proxy("google-drive", path, options);
}

function detailText(text?: string): string {
  if (!text) return "";
  return ` ${text.slice(0, 200)}`;
}
