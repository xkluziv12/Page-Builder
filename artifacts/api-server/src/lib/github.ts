import { ReplitConnectors } from "@replit/connectors-sdk";

async function gh(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<Response> {
  const connectors = new ReplitConnectors();
  const options: { method?: string; body?: string; headers?: Record<string, string> } =
    {};
  if (init?.method) options.method = init.method;
  if (init?.body !== undefined) {
    options.body = JSON.stringify(init.body);
    options.headers = { "Content-Type": "application/json" };
  }
  return connectors.proxy("github", path, options);
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * The read-only source-of-truth repo that owns the master prompt logic.
 * Page Terminal READS from this repo (never writes).
 *   - GITHUB_SOURCE_REPO   (format "owner/repo", e.g. "xkluziv12/master-prompts")
 *   - GITHUB_SOURCE_BRANCH (optional, defaults to "main")
 */
function parseSourceRepo(): { owner: string; repo: string } | null {
  const full = process.env.GITHUB_SOURCE_REPO?.trim();
  if (!full || !full.includes("/")) return null;
  const [owner, repo] = full.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function sourceBranch(): string {
  return process.env.GITHUB_SOURCE_BRANCH?.trim() || "main";
}

/**
 * Current HEAD commit SHA of the source repo's branch. Cheap (one request);
 * used to detect "did anything change?" before fetching file contents.
 */
export async function getSourceHeadSha(): Promise<
  { ok: true; sha: string } | { ok: false; detail: string }
> {
  const repo = parseSourceRepo();
  if (!repo) {
    return { ok: false, detail: "GITHUB_SOURCE_REPO is not configured." };
  }
  const res = await gh(
    `/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(sourceBranch())}`,
  );
  if (!res.ok) {
    return {
      ok: false,
      detail: `Could not read source HEAD (HTTP ${res.status}). Check GITHUB_SOURCE_REPO and connected-account access.`,
    };
  }
  const json = (await res.json()) as { sha?: string };
  return json.sha
    ? { ok: true, sha: json.sha }
    : { ok: false, detail: "Source HEAD response had no commit SHA." };
}

/**
 * Read a single file's decoded text from the source repo (read-only).
 */
export async function readSourceFile(
  path: string,
): Promise<{ ok: true; content: string } | { ok: false; detail: string }> {
  const repo = parseSourceRepo();
  if (!repo) {
    return { ok: false, detail: "GITHUB_SOURCE_REPO is not configured." };
  }
  const res = await gh(
    `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(sourceBranch())}`,
  );
  if (!res.ok) {
    return {
      ok: false,
      detail: `GitHub read failed for ${path} (HTTP ${res.status}).`,
    };
  }
  const json = (await res.json()) as {
    content?: string;
    encoding?: string;
    size?: number;
  };
  if (!json.content) {
    return {
      ok: false,
      detail:
        json.size && json.size > 1_000_000
          ? `Source file ${path} is too large for the contents API (${json.size} bytes).`
          : `Source file ${path} returned no content.`,
    };
  }
  const content = Buffer.from(
    json.content,
    (json.encoding as BufferEncoding) || "base64",
  ).toString("utf-8");
  return { ok: true, content };
}
