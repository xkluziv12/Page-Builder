import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  computeLocalSnapshot,
  computeSnapshotDigest,
  diffAgainstRemote,
  gitBlobSha,
  mirrorToGitHub,
  TOKEN_ENV,
  type LocalEntry,
} from "./mirror";

const execFileAsync = promisify(execFile);

function entry(sha: string, mode = "100644"): LocalEntry {
  return { mode, sha, size: 1 };
}

describe("gitBlobSha", () => {
  it("matches git's well-known empty-blob SHA", () => {
    expect(gitBlobSha(Buffer.alloc(0))).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });

  it("matches git hash-object for known content", () => {
    // echo "hello" | git hash-object --stdin
    expect(gitBlobSha(Buffer.from("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    // printf "what is up, doc?" | git hash-object --stdin
    expect(gitBlobSha(Buffer.from("what is up, doc?"))).toBe(
      "bd9dbf5aae1a3862dd1526723246b20206e5fc37",
    );
  });

  it("includes the byte length in the header (same bytes, different result than plain sha1)", () => {
    const a = gitBlobSha(Buffer.from("abc"));
    // plain sha1("abc")
    expect(a).not.toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it("hashes binary content byte-exactly", () => {
    // printf '\x00\x01\x02' | git hash-object --stdin
    expect(gitBlobSha(Buffer.from([0, 1, 2]))).toBe(
      "8352675d67aed6625ece79af41c27fdb4ee2e867",
    );
  });
});

describe("computeSnapshotDigest", () => {
  const shaA = gitBlobSha(Buffer.from("a"));
  const shaB = gitBlobSha(Buffer.from("b"));

  it("is stable regardless of Map insertion order", () => {
    const m1 = new Map([
      ["b.txt", entry(shaB)],
      ["a.txt", entry(shaA)],
    ]);
    const m2 = new Map([
      ["a.txt", entry(shaA)],
      ["b.txt", entry(shaB)],
    ]);
    expect(computeSnapshotDigest(m1)).toBe(computeSnapshotDigest(m2));
  });

  it("changes when content changes", () => {
    const base = new Map([["a.txt", entry(shaA)]]);
    const changed = new Map([["a.txt", entry(shaB)]]);
    expect(computeSnapshotDigest(base)).not.toBe(computeSnapshotDigest(changed));
  });

  it("changes when only a mode changes", () => {
    const base = new Map([["a.txt", entry(shaA, "100644")]]);
    const exec = new Map([["a.txt", entry(shaA, "100755")]]);
    expect(computeSnapshotDigest(base)).not.toBe(computeSnapshotDigest(exec));
  });

  it("changes when a path is renamed", () => {
    const base = new Map([["a.txt", entry(shaA)]]);
    const renamed = new Map([["c.txt", entry(shaA)]]);
    expect(computeSnapshotDigest(base)).not.toBe(computeSnapshotDigest(renamed));
  });

  it("changes when an entry is added or removed", () => {
    const one = new Map([["a.txt", entry(shaA)]]);
    const two = new Map([
      ["a.txt", entry(shaA)],
      ["b.txt", entry(shaB)],
    ]);
    expect(computeSnapshotDigest(one)).not.toBe(computeSnapshotDigest(two));
    expect(computeSnapshotDigest(new Map())).not.toBe(computeSnapshotDigest(one));
  });
});

describe("diffAgainstRemote", () => {
  const shaA = gitBlobSha(Buffer.from("a"));
  const shaB = gitBlobSha(Buffer.from("b"));

  it("returns an empty diff when local and remote match", () => {
    const local = new Map([["a.txt", entry(shaA)]]);
    const remote = new Map([["a.txt", { sha: shaA, mode: "100644" }]]);
    const d = diffAgainstRemote(local, remote);
    expect(d.added).toBe(0);
    expect(d.modified).toBe(0);
    expect(d.deletions).toEqual([]);
    expect(d.changedEntries).toEqual([]);
    expect(d.toUpload).toEqual([]);
  });

  it("detects additions and schedules an upload", () => {
    const local = new Map([["new.txt", entry(shaA)]]);
    const d = diffAgainstRemote(local, new Map());
    expect(d.added).toBe(1);
    expect(d.toUpload).toEqual(["new.txt"]);
    expect(d.changedEntries).toEqual([{ path: "new.txt", mode: "100644", sha: shaA }]);
    expect(d.deletions).toEqual([]);
  });

  it("detects content modifications and schedules an upload", () => {
    const local = new Map([["a.txt", entry(shaB)]]);
    const remote = new Map([["a.txt", { sha: shaA, mode: "100644" }]]);
    const d = diffAgainstRemote(local, remote);
    expect(d.modified).toBe(1);
    expect(d.added).toBe(0);
    expect(d.toUpload).toEqual(["a.txt"]);
    expect(d.changedEntries).toEqual([{ path: "a.txt", mode: "100644", sha: shaB }]);
  });

  it("detects mode-only changes without uploading the blob again", () => {
    const local = new Map([["run.sh", entry(shaA, "100755")]]);
    const remote = new Map([["run.sh", { sha: shaA, mode: "100644" }]]);
    const d = diffAgainstRemote(local, remote);
    expect(d.modified).toBe(1);
    expect(d.toUpload).toEqual([]); // same content already on the remote
    expect(d.changedEntries).toEqual([{ path: "run.sh", mode: "100755", sha: shaA }]);
  });

  it("detects deletions (remote-only paths)", () => {
    const local = new Map([["keep.txt", entry(shaA)]]);
    const remote = new Map([
      ["keep.txt", { sha: shaA, mode: "100644" }],
      ["gone.txt", { sha: shaB, mode: "100644" }],
    ]);
    const d = diffAgainstRemote(local, remote);
    expect(d.deletions).toEqual(["gone.txt"]);
    expect(d.added).toBe(0);
    expect(d.modified).toBe(0);
  });

  it("handles a mixed add/modify/mode/delete diff in one pass", () => {
    const local = new Map([
      ["added.txt", entry(shaA)],
      ["changed.txt", entry(shaB)],
      ["chmod.sh", entry(shaA, "100755")],
      ["same.txt", entry(shaA)],
    ]);
    const remote = new Map([
      ["changed.txt", { sha: shaA, mode: "100644" }],
      ["chmod.sh", { sha: shaA, mode: "100644" }],
      ["same.txt", { sha: shaA, mode: "100644" }],
      ["deleted.txt", { sha: shaB, mode: "100644" }],
    ]);
    const d = diffAgainstRemote(local, remote);
    expect(d.added).toBe(1);
    expect(d.modified).toBe(2);
    expect(d.deletions).toEqual(["deleted.txt"]);
    expect(d.toUpload.sort()).toEqual(["added.txt", "changed.txt"]);
    expect(d.changedEntries.map((e) => e.path).sort()).toEqual([
      "added.txt",
      "changed.txt",
      "chmod.sh",
    ]);
  });
});

describe("mirrorToGitHub empty-snapshot guard", () => {
  const savedToken = process.env[TOKEN_ENV];
  const savedRepo = process.env.GITHUB_SYNC_REPO;

  afterEach(() => {
    if (savedToken === undefined) delete process.env[TOKEN_ENV];
    else process.env[TOKEN_ENV] = savedToken;
    if (savedRepo === undefined) delete process.env.GITHUB_SYNC_REPO;
    else process.env.GITHUB_SYNC_REPO = savedRepo;
    vi.unstubAllGlobals();
  });

  it("refuses to mirror an empty tree and never touches the network", async () => {
    process.env[TOKEN_ENV] = "test-token-never-used";
    process.env.GITHUB_SYNC_REPO = "example/never-hit";
    const fetchSpy = vi.fn(() => {
      throw new Error("network must not be reached in tests");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const summary = await mirrorToGitHub({
      snapshot: { entries: new Map(), digest: "deadbeef", localHead: null },
    });

    expect(summary.ok).toBe(false);
    expect(summary.detail).toMatch(/refusing to mirror an empty tree/i);
    expect(summary.digest).toBe("deadbeef");
    expect(summary.commitSha).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails loudly (without network) when the token secret is absent", async () => {
    delete process.env[TOKEN_ENV];
    const fetchSpy = vi.fn(() => {
      throw new Error("network must not be reached in tests");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const summary = await mirrorToGitHub({
      snapshot: { entries: new Map([["a", entry(gitBlobSha(Buffer.from("a")))]]), digest: "d", localHead: null },
    });

    expect(summary.ok).toBe(false);
    expect(summary.detail).toContain(TOKEN_ENV);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("computeLocalSnapshot (temp git repo fixture)", () => {
  let repo: string;

  async function git(args: string[]) {
    await execFileAsync("git", args, { cwd: repo });
  }

  beforeAll(async () => {
    repo = await fs.mkdtemp(join(tmpdir(), "mirror-test-"));
    await git(["init", "-q"]);
    await git(["config", "user.email", "test@example.com"]);
    await git(["config", "user.name", "Test"]);

    await fs.writeFile(join(repo, "plain.txt"), "hello\n");
    await fs.writeFile(join(repo, "script.sh"), "#!/bin/sh\n");
    await fs.chmod(join(repo, "script.sh"), 0o755);
    await fs.symlink("plain.txt", join(repo, "link.txt"));
    await fs.writeFile(join(repo, "untracked.txt"), "never synced\n");
    await git(["add", "plain.txt", "script.sh", "link.txt"]);
    // Fake submodule gitlink straight in the index (no real clone needed).
    await git([
      "update-index",
      "--add",
      "--cacheinfo",
      "160000,e69de29bb2d1d6434b8b29ae775ad8c2e48c5391,vendored-submodule",
    ]);
    // A tracked file deleted from disk should drop out of the snapshot.
    await fs.writeFile(join(repo, "deleted-locally.txt"), "bye\n");
    await git(["add", "deleted-locally.txt"]);
    await fs.rm(join(repo, "deleted-locally.txt"));
  });

  afterAll(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  it("captures tracked files with correct modes/SHAs, skips submodules, symlinks as 120000, ignores untracked", async () => {
    const result = await computeLocalSnapshot(repo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { entries, digest } = result.snapshot;

    expect([...entries.keys()].sort()).toEqual(["link.txt", "plain.txt", "script.sh"]);

    expect(entries.get("plain.txt")).toMatchObject({
      mode: "100644",
      sha: "ce013625030ba8dba906f756967f9e9ca394464a", // git hash of "hello\n"
    });
    expect(entries.get("script.sh")?.mode).toBe("100755");
    expect(entries.get("link.txt")).toMatchObject({
      mode: "120000",
      sha: gitBlobSha(Buffer.from("plain.txt")), // link target as blob content
    });

    // Submodule gitlink and untracked/locally-deleted files never appear.
    expect(entries.has("vendored-submodule")).toBe(false);
    expect(entries.has("untracked.txt")).toBe(false);
    expect(entries.has("deleted-locally.txt")).toBe(false);

    expect(digest).toBe(computeSnapshotDigest(entries));
  });

  it("digest is stable across repeated snapshots and changes when content changes", async () => {
    const first = await computeLocalSnapshot(repo);
    const second = await computeLocalSnapshot(repo);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.snapshot.digest).toBe(second.snapshot.digest);

    await fs.writeFile(join(repo, "plain.txt"), "changed\n");
    const third = await computeLocalSnapshot(repo);
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.snapshot.digest).not.toBe(first.snapshot.digest);
    await fs.writeFile(join(repo, "plain.txt"), "hello\n");
  });
});
