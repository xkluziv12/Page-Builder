import { ReplitConnectors } from "@replit/connectors-sdk";
import type { TargetResult } from "./promptSync";

/**
 * Commit a prompt file to the operator's GitHub prompts repo.
 *
 * Uses the Replit GitHub connector (blueprint id="github") via the connectors
 * proxy, which injects the OAuth token and handles refresh automatically.
 *
 * The repo is supplied at build time via env:
 *   - GITHUB_PROMPTS_REPO   (required, format "owner/repo")
 *   - GITHUB_PROMPTS_BRANCH (optional, defaults to the repo default branch)
 *
 * Returns a structured result; it never throws so a git failure cannot abort
 * an otherwise-successful publish (Drive + DB stay intact and the target is
 * retryable). The resulting commit SHA is returned as `reference`.
 */
export async function commitPromptFile(opts: {
  path: string;
  content: string;
  message: string;
}): Promise<TargetResult> {
  const repo = parseRepo();
  if (!repo) {
    return {
      ok: false,
      detail:
        "GITHUB_PROMPTS_REPO is not configured (expected 'owner/repo').",
      reference: null,
    };
  }

  const base = `/repos/${repo.owner}/${repo.repo}`;

  const branch = await resolveBranch(base);
  if (!branch.ok) {
    return { ok: false, detail: branch.detail, reference: null };
  }

  const contentsPath = `${base}/contents/${encodePath(opts.path)}`;

  // Look up the existing file SHA so we update in place rather than fail.
  let sha: string | undefined;
  const existing = await gh(
    `${contentsPath}?ref=${encodeURIComponent(branch.name)}`,
  );
  if (existing.ok) {
    const json = (await existing.json()) as { sha?: string };
    sha = json.sha;
  } else if (existing.status !== 404) {
    return {
      ok: false,
      detail: `GitHub read failed (HTTP ${existing.status}).`,
      reference: null,
    };
  }

  const put = await gh(contentsPath, {
    method: "PUT",
    body: {
      message: opts.message,
      content: Buffer.from(opts.content, "utf-8").toString("base64"),
      branch: branch.name,
      ...(sha ? { sha } : {}),
    },
  });

  if (!put.ok) {
    const text = await put.text().catch(() => "");
    return {
      ok: false,
      detail: `GitHub commit failed (HTTP ${put.status}).${
        text ? ` ${text.slice(0, 200)}` : ""
      }`,
      reference: null,
    };
  }

  const json = (await put.json()) as { commit?: { sha?: string } };
  const commitSha = json.commit?.sha ?? null;
  return {
    ok: true,
    detail: `Committed to ${repo.owner}/${repo.repo}@${branch.name}`,
    reference: commitSha,
  };
}

function parseRepo(): { owner: string; repo: string } | null {
  const full = process.env.GITHUB_PROMPTS_REPO?.trim();
  if (!full || !full.includes("/")) return null;
  const [owner, repo] = full.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

async function resolveBranch(
  base: string,
): Promise<{ ok: true; name: string } | { ok: false; detail: string }> {
  const configured = process.env.GITHUB_PROMPTS_BRANCH?.trim();
  if (configured) return { ok: true, name: configured };

  const res = await gh(base);
  if (!res.ok) {
    return {
      ok: false,
      detail: `Could not read GitHub repo (HTTP ${res.status}). Check the repo name and that the connected account has access.`,
    };
  }
  const json = (await res.json()) as { default_branch?: string };
  return { ok: true, name: json.default_branch ?? "main" };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

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

/**
 * The read-only source-of-truth repo that owns the master prompt logic.
 * Page Terminal READS from this repo (never writes); writes go to
 * GITHUB_PROMPTS_REPO instead.
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
