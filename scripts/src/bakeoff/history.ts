import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BakeoffResults } from "./types.js";

/**
 * Archives a completed bake-off run as a permanent, dated history entry the
 * frontend leaderboard can list as its own selectable tab — WITHOUT disturbing
 * the live `results.json` overwrite-on-persist behaviour that resumability
 * depends on. A history entry is a self-contained copy: its own JSON snapshot
 * plus its own namespaced copy of every screenshot it references, so a later
 * run overwriting the live `public/screenshots/<scenario>/...` files can never
 * corrupt an already-archived entry.
 *
 * Best-effort by design (mirrors the screenshot/transcript writers elsewhere in
 * the harness): a failure here must never fail the run itself.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const HISTORY_DATA_DIR = resolve(HERE, "../../../artifacts/bake-off/src/data/history");
const HISTORY_SCREENSHOT_ROOT = resolve(HERE, "../../../artifacts/bake-off/public/screenshots/history");
const HISTORY_SCREENSHOT_PREFIX = "screenshots/history";
const MANIFEST_PATH = join(HISTORY_DATA_DIR, "manifest.json");

export interface HistoryManifestEntry {
  id: string;
  file: string;
  label: string;
  blurb: string;
  ranAt: string;
}

async function loadManifest(): Promise<HistoryManifestEntry[]> {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryManifestEntry[]) : [];
  } catch {
    return [];
  }
}

/** Copy one screenshot file referenced by a results.json into this history
 * entry's namespaced folder, if it exists. Missing files are skipped silently
 * (older archives sometimes lack a given screenshot). */
async function copyIntoHistory(
  relPath: string | null,
  sourceScreenshotRoot: string,
  runId: string,
): Promise<string | null> {
  if (!relPath) return null;
  // Source paths are recorded as "screenshots/<scenario>/<file>" (live) or
  // already "screenshots/..." (archive) — strip any "screenshots/" prefix so we
  // resolve relative to the given source screenshot root uniformly.
  const stripped = relPath.replace(/^screenshots\//, "");
  const src = join(sourceScreenshotRoot, stripped);
  const destRel = `${HISTORY_SCREENSHOT_PREFIX}/${runId}/${stripped}`;
  const dest = resolve(HERE, "../../../artifacts/bake-off/public", destRel);
  try {
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    return destRel;
  } catch {
    return null;
  }
}

/**
 * Archive one run into the history dataset.
 * @param sourceScreenshotRoot Absolute dir screenshot paths in `results` are
 *   relative to (after stripping a leading "screenshots/") — the live
 *   `public/screenshots` dir for a just-completed run, or an archive folder's
 *   own `screenshots` dir when seeding from `archive/`.
 */
export async function archiveSnapshot(
  results: BakeoffResults,
  opts: { runId: string; label: string; blurb: string; sourceScreenshotRoot: string },
): Promise<void> {
  const { runId, label, blurb, sourceScreenshotRoot } = opts;
  const snapshot: BakeoffResults = JSON.parse(JSON.stringify(results));

  // IMPORTANT: never fall back to the original path on a failed/missing copy —
  // the original points at the LIVE, mutable public/screenshots dir, which a
  // later run overwrites. A permanent history snapshot must only ever point at
  // its own namespaced copy or be explicitly null (rendered as "unavailable"),
  // never at a path that can silently start showing a different run's image.
  snapshot.referenceScreenshot = await copyIntoHistory(
    snapshot.referenceScreenshot,
    sourceScreenshotRoot,
    runId,
  );
  for (const scenario of snapshot.scenarios) {
    for (const model of scenario.models) {
      model.screenshot = await copyIntoHistory(model.screenshot, sourceScreenshotRoot, runId);
    }
  }

  await mkdir(HISTORY_DATA_DIR, { recursive: true });
  const file = `${runId}.json`;
  await writeFile(join(HISTORY_DATA_DIR, file), JSON.stringify(snapshot, null, 2), "utf8");

  const manifest = await loadManifest();
  const entry: HistoryManifestEntry = { id: runId, file, label, blurb, ranAt: results.ranAt };
  const idx = manifest.findIndex((m) => m.id === runId);
  if (idx >= 0) manifest[idx] = entry;
  else manifest.push(entry);
  manifest.sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1));
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}
