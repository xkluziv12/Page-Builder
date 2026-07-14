import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * One-way GitHub mirror engine.
 *
 * Mirrors the tracked working tree of this workspace to a GitHub repo via the
 * Git Data API (blobs → tree → commit → ref). The workspace is the source of
 * truth: remote-only edits are overwritten by the next sync commit.
 *
 * Uses ONLY read-only git commands locally (`git rev-parse`, `git ls-files`);
 * all writes happen remotely through the GitHub REST API.
 */

export const TOKEN_ENV = "xkluziv12_git";
const DEFAULT_REPO = "xkluziv12/page-terminal";
const DEFAULT_BRANCH = "main";
const API_BASE = "https://api.github.com";
const BLOB_UPLOAD_CONCURRENCY = 8;
const FILE_READ_CONCURRENCY = 16;

export type MirrorConfig = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  root: string;
};

export type ConfigResult =
  | { ok: true; config: MirrorConfig }
  | { ok: false; detail: string };

export type LocalEntry = { mode: string; sha: string; size: number };

export type LocalSnapshot = {
  /** path → blob entry for every tracked (or untracked-but-not-ignored) file */
  entries: Map<string, LocalEntry>;
  /** Digest of the whole snapshot — cheap "did anything change?" fingerprint. */
  digest: string;
  /** Local HEAD commit at snapshot time (informational only). */
  localHead: string | null;
};

export type SnapshotResult =
  | { ok: true; snapshot: LocalSnapshot }
  | { ok: false; detail: string };

export type MirrorSummary = {
  ok: boolean;
  /** True when nothing needed to be pushed (remote already matches). */
  skipped: boolean;
  detail: string;
  /** The remote commit SHA created by this sync (or the existing head when skipped). */
  commitSha: string | null;
  added: number;
  modified: number;
  deleted: number;
  /** Snapshot digest this summary corresponds to (null when snapshot failed). */
  digest: string | null;
  errors: string[];
};

/** Resolve config from env. Fails loudly (as a value) when the token is absent. */
export async function resolveMirrorConfig(): Promise<ConfigResult> {
  const token = process.env[TOKEN_ENV]?.trim();
  if (!token) {
    return {
      ok: false,
      detail: `GitHub sync token missing: the "${TOKEN_ENV}" secret is not set. Auto-sync cannot run.`,
    };
  }
  const full = process.env.GITHUB_SYNC_REPO?.trim() || DEFAULT_REPO;
  const [owner, repo] = full.split("/");
  if (!owner || !repo) {
    return {
      ok: false,
      detail: `GITHUB_SYNC_REPO is malformed ("${full}") — expected "owner/repo".`,
    };
  }
  const branch = process.env.GITHUB_SYNC_BRANCH?.trim() || DEFAULT_BRANCH;
  const root = await gitToplevel();
  if (!root) {
    return { ok: false, detail: "Could not resolve the git workspace root (git rev-parse --show-toplevel failed)." };
  }
  return { ok: true, config: { token, owner, repo, branch, root } };
}

async function gitToplevel(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      maxBuffer: 1024 * 1024,
    });
    const root = stdout.trim();
    return root || null;
  } catch {
    return null;
  }
}

async function gitLines(root: string, args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.split("\0").filter((s) => s.length > 0);
}

function gitBlobSha(content: Buffer): string {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Snapshot the syncable working tree: git-TRACKED files only (working-tree
 * contents of everything in the index). Untracked and gitignored content
 * (node_modules, .env, .local, drafts, secrets) never appears here — new files
 * sync once the platform commits them. Symlinks become 120000 blobs (link
 * target as content); gitlinks/submodules are skipped.
 */
export async function computeLocalSnapshot(root: string): Promise<SnapshotResult> {
  try {
    // Index modes (and gitlink detection) for cached files.
    const staged = await gitLines(root, ["ls-files", "-z", "-s"]);
    const indexMode = new Map<string, string>();
    for (const line of staged) {
      // "<mode> <sha> <stage>\t<path>"
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const mode = line.slice(0, line.indexOf(" "));
      indexMode.set(line.slice(tab + 1), mode);
    }

    const unique = [...indexMode.keys()].sort();

    const entries = new Map<string, LocalEntry>();
    const rows = await mapLimit(unique, FILE_READ_CONCURRENCY, async (path) => {
      const idxMode = indexMode.get(path);
      if (idxMode === "160000") return null; // submodule gitlink — cannot mirror as a blob
      const abs = `${root}/${path}`;
      let stat;
      try {
        stat = await fs.lstat(abs);
      } catch {
        return null; // tracked in index but deleted locally → mirrors as a remote deletion
      }
      if (stat.isDirectory()) return null;
      let content: Buffer;
      let mode: string;
      if (stat.isSymbolicLink()) {
        content = Buffer.from(await fs.readlink(abs), "utf-8");
        mode = "120000";
      } else {
        content = await fs.readFile(abs);
        // Index mode wins, except a tracked symlink replaced by a regular
        // file on disk: trust the filesystem.
        mode = idxMode === "100755" ? "100755" : "100644";
      }
      return { path, entry: { mode, sha: gitBlobSha(content), size: content.length } };
    });
    for (const row of rows) {
      if (row) entries.set(row.path, row.entry);
    }

    const digestHash = createHash("sha1");
    for (const [path, entry] of [...entries.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      digestHash.update(`${path}\0${entry.mode}\0${entry.sha}\n`);
    }

    let localHead: string | null = null;
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
      localHead = stdout.trim() || null;
    } catch {
      localHead = null;
    }

    return {
      ok: true,
      snapshot: { entries, digest: digestHash.digest("hex"), localHead },
    };
  } catch (err) {
    return {
      ok: false,
      detail: `Local snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

type GhResponse = { status: number; json: unknown; text: string };

async function gh(
  config: MirrorConfig,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<GhResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function ghError(what: string, res: GhResponse): string {
  const message =
    res.json && typeof res.json === "object" && "message" in res.json
      ? String((res.json as { message: unknown }).message)
      : res.text.slice(0, 200);
  return `${what} failed (HTTP ${res.status}): ${message}`;
}

type RemoteState = {
  headSha: string | null;
  treeSha: string | null;
  /** path → { sha, mode } for every blob in the remote tree. */
  blobs: Map<string, { sha: string; mode: string }>;
};

async function fetchRemoteState(
  config: MirrorConfig,
): Promise<{ ok: true; state: RemoteState } | { ok: false; detail: string }> {
  const refRes = await gh(
    config,
    `/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(config.branch)}`,
  );
  if (refRes.status === 404 || refRes.status === 409) {
    // Branch (or whole repo) is empty — first sync creates it.
    return { ok: true, state: { headSha: null, treeSha: null, blobs: new Map() } };
  }
  if (refRes.status !== 200) {
    return { ok: false, detail: ghError(`Reading remote ref heads/${config.branch}`, refRes) };
  }
  const headSha = (refRes.json as { object?: { sha?: string } })?.object?.sha;
  if (!headSha) return { ok: false, detail: "Remote ref response had no commit SHA." };

  const commitRes = await gh(
    config,
    `/repos/${config.owner}/${config.repo}/git/commits/${headSha}`,
  );
  if (commitRes.status !== 200) {
    return { ok: false, detail: ghError("Reading remote head commit", commitRes) };
  }
  const treeSha = (commitRes.json as { tree?: { sha?: string } })?.tree?.sha;
  if (!treeSha) return { ok: false, detail: "Remote commit response had no tree SHA." };

  const treeRes = await gh(
    config,
    `/repos/${config.owner}/${config.repo}/git/trees/${treeSha}?recursive=1`,
  );
  if (treeRes.status !== 200) {
    return { ok: false, detail: ghError("Reading remote tree", treeRes) };
  }
  const treeJson = treeRes.json as {
    truncated?: boolean;
    tree?: { path?: string; type?: string; sha?: string; mode?: string }[];
  };
  if (treeJson.truncated) {
    return {
      ok: false,
      detail: "Remote tree listing was truncated by GitHub — refusing to diff against an incomplete tree.",
    };
  }
  const blobs = new Map<string, { sha: string; mode: string }>();
  for (const item of treeJson.tree ?? []) {
    if (item.type === "blob" && item.path && item.sha && item.mode) {
      blobs.set(item.path, { sha: item.sha, mode: item.mode });
    }
  }
  return { ok: true, state: { headSha, treeSha, blobs } };
}

export type MirrorOptions = {
  /** Reuse a snapshot already computed by the caller (avoids re-hashing). */
  snapshot?: LocalSnapshot;
  /** Override the commit message (a timestamp is always appended). */
  message?: string;
};

/**
 * Run one full mirror pass: diff the local snapshot against the remote tree,
 * upload changed blobs, and advance the remote branch by exactly one commit.
 * Never throws — every failure comes back as a loud `ok: false` summary.
 */
export async function mirrorToGitHub(opts: MirrorOptions = {}): Promise<MirrorSummary> {
  const fail = (detail: string, digest: string | null = null): MirrorSummary => ({
    ok: false,
    skipped: false,
    detail,
    commitSha: null,
    added: 0,
    modified: 0,
    deleted: 0,
    digest,
    errors: [detail],
  });

  const configResult = await resolveMirrorConfig();
  if (!configResult.ok) return fail(configResult.detail);
  const config = configResult.config;

  let snapshot = opts.snapshot;
  if (!snapshot) {
    const snapResult = await computeLocalSnapshot(config.root);
    if (!snapResult.ok) return fail(snapResult.detail);
    snapshot = snapResult.snapshot;
  }
  if (snapshot.entries.size === 0) {
    return fail("Local snapshot is empty — refusing to mirror an empty tree (this would delete everything remotely).", snapshot.digest);
  }

  const remoteResult = await fetchRemoteState(config);
  if (!remoteResult.ok) return fail(remoteResult.detail, snapshot.digest);
  const remote = remoteResult.state;

  const toUpload: string[] = [];
  const changedEntries: { path: string; mode: string; sha: string }[] = [];
  let added = 0;
  let modified = 0;
  for (const [path, entry] of snapshot.entries) {
    const remoteEntry = remote.blobs.get(path);
    if (!remoteEntry) {
      added++;
      toUpload.push(path);
      changedEntries.push({ path, mode: entry.mode, sha: entry.sha });
    } else if (remoteEntry.sha !== entry.sha || remoteEntry.mode !== entry.mode) {
      modified++;
      if (remoteEntry.sha !== entry.sha) toUpload.push(path);
      changedEntries.push({ path, mode: entry.mode, sha: entry.sha });
    }
  }
  const deletions: string[] = [];
  for (const path of remote.blobs.keys()) {
    if (!snapshot.entries.has(path)) deletions.push(path);
  }

  if (changedEntries.length === 0 && deletions.length === 0 && remote.headSha) {
    return {
      ok: true,
      skipped: true,
      detail: `Remote already matches the workspace (head ${remote.headSha.slice(0, 7)}).`,
      commitSha: remote.headSha,
      added: 0,
      modified: 0,
      deleted: 0,
      digest: snapshot.digest,
      errors: [],
    };
  }

  // Upload changed/added blobs.
  const uploadErrors: string[] = [];
  await mapLimit(toUpload, BLOB_UPLOAD_CONCURRENCY, async (path) => {
    const expected = snapshot!.entries.get(path)!;
    let content: Buffer;
    try {
      const abs = `${config.root}/${path}`;
      const stat = await fs.lstat(abs);
      content = stat.isSymbolicLink()
        ? Buffer.from(await fs.readlink(abs), "utf-8")
        : await fs.readFile(abs);
    } catch (err) {
      uploadErrors.push(`Read failed for ${path}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const res = await gh(config, `/repos/${config.owner}/${config.repo}/git/blobs`, {
      method: "POST",
      body: { content: content.toString("base64"), encoding: "base64" },
    });
    if (res.status !== 201) {
      uploadErrors.push(ghError(`Blob upload for ${path}`, res));
      return;
    }
    const sha = (res.json as { sha?: string })?.sha;
    if (sha !== expected.sha) {
      uploadErrors.push(
        `Blob SHA mismatch for ${path}: expected ${expected.sha}, GitHub returned ${sha ?? "nothing"}. File may have changed mid-sync.`,
      );
    }
  });
  if (uploadErrors.length > 0) {
    return {
      ...fail(`Aborting sync — ${uploadErrors.length} blob upload(s) failed. First: ${uploadErrors[0]}`, snapshot.digest),
      errors: uploadErrors,
    };
  }

  // Build the new tree on top of the remote tree (unchanged entries carry over).
  const treeEntries: { path: string; mode: string; type: "blob"; sha: string | null }[] = [
    ...changedEntries.map((e) => ({ path: e.path, mode: e.mode, type: "blob" as const, sha: e.sha })),
    ...deletions.map((path) => ({ path, mode: "100644", type: "blob" as const, sha: null })),
  ];
  const treeRes = await gh(config, `/repos/${config.owner}/${config.repo}/git/trees`, {
    method: "POST",
    body: {
      ...(remote.treeSha ? { base_tree: remote.treeSha } : {}),
      tree: treeEntries,
    },
  });
  if (treeRes.status !== 201) return fail(ghError("Tree creation", treeRes), snapshot.digest);
  const newTreeSha = (treeRes.json as { sha?: string })?.sha;
  if (!newTreeSha) return fail("Tree creation returned no SHA.", snapshot.digest);

  const message =
    (opts.message?.trim() || "Auto-sync from Replit workspace") +
    ` — ${new Date().toISOString()}` +
    (snapshot.localHead ? ` (workspace HEAD ${snapshot.localHead.slice(0, 7)})` : "");
  const commitRes = await gh(config, `/repos/${config.owner}/${config.repo}/git/commits`, {
    method: "POST",
    body: {
      message,
      tree: newTreeSha,
      parents: remote.headSha ? [remote.headSha] : [],
    },
  });
  if (commitRes.status !== 201) return fail(ghError("Commit creation", commitRes), snapshot.digest);
  const commitSha = (commitRes.json as { sha?: string })?.sha;
  if (!commitSha) return fail("Commit creation returned no SHA.", snapshot.digest);

  const refPath = `/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(config.branch)}`;
  const refRes = remote.headSha
    ? await gh(config, refPath, { method: "PATCH", body: { sha: commitSha, force: true } })
    : await gh(config, `/repos/${config.owner}/${config.repo}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${config.branch}`, sha: commitSha },
      });
  if (refRes.status !== 200 && refRes.status !== 201) {
    return fail(ghError(`Updating ref heads/${config.branch}`, refRes), snapshot.digest);
  }

  return {
    ok: true,
    skipped: false,
    detail: `Pushed ${commitSha.slice(0, 7)} to ${config.owner}/${config.repo}@${config.branch}: +${added} added, ~${modified} modified, -${deletions.length} deleted.`,
    commitSha,
    added,
    modified,
    deleted: deletions.length,
    digest: snapshot.digest,
    errors: [],
  };
}
