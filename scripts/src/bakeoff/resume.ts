import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { compareTarget, type BakeoffTarget } from "./target.js";
import { baseIdOf } from "./variants.js";
import type { ModelResult, ScenarioResult } from "./types.js";

/**
 * Resume + persistence rules for the live `results.json`.
 *
 * The harness persists after EVERY model so an interrupted long run can be
 * relaunched and continue. That resume was previously keyed on `scenarioId +
 * modelId` ALONE, with no check that the recorded dataset described the same
 * page — so pointing the harness at a new city silently inherited the previous
 * city's shared grounding and skipped every model whose id already appeared in
 * the old file. {@link readPrior} makes the resume identity TARGET-AWARE: a
 * dataset is reusable only when it proves it is the same target.
 *
 * Kept separate from `run.ts` (which executes on import) so these rules are
 * unit-testable with fixtures and no provider credentials.
 */

export interface PriorGrounding {
  source: string;
  content: string;
}

/** A recorded scenario's own presentation metadata, kept so a scenario that is
 * NOT run this pass can be persisted verbatim instead of rebuilt from a spec
 * that may not exist for this target. */
export interface PriorScenarioMeta {
  label: string;
  description: string;
  notes: string[];
}

export interface Prior {
  /** Shared grounding to reuse, or null when none is reusable. */
  grounding: PriorGrounding | null;
  /** scenarioId -> (result id -> already-completed ModelResult). */
  done: Map<string, Map<string, ModelResult>>;
  /** scenarioId -> its recorded label/description/notes. */
  scenarioMeta: Map<string, PriorScenarioMeta>;
  /**
   * Why the prior dataset was NOT reused, or null when it was (or when there was
   * no prior file). Logged verbatim so a discarded resume is always visible
   * rather than looking like a first run.
   */
  rejectedReason: string | null;
  /** True when a syntactically valid prior dataset existed on disk at all. */
  hadPriorFile: boolean;
}

function emptyPrior(rejectedReason: string | null, hadPriorFile: boolean): Prior {
  return {
    grounding: null,
    done: new Map(),
    scenarioMeta: new Map(),
    rejectedReason,
    hadPriorFile,
  };
}

/** Does a force-rerun token select this recorded result? Matches `all`, the exact
 * variant id, or the base id (so `BAKEOFF_FORCE=gemini` re-runs every gemini
 * effort variant, which is what an operator naming a model slot means). */
export function isForcedId(force: Set<string>, result: { id: string; baseId?: string | null }): boolean {
  if (force.has("all")) return true;
  if (force.has(result.id)) return true;
  return force.has(result.baseId?.trim() || baseIdOf(result.id));
}

/**
 * Interpret an already-parsed prior `results.json`.
 *
 * Reuse requires ALL of: a readable scenarios array, and a recorded `target`
 * that matches this run's target on every field. Anything else yields an empty
 * prior plus a reason — never a partial/optimistic reuse, because reusing the
 * wrong grounding is invisible in the output while corrupting every model's
 * research input.
 */
export function readPrior(
  parsed: unknown,
  target: BakeoffTarget,
  force: Set<string>,
): Prior {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyPrior("the prior results file is not a JSON object", false);
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.scenarios)) {
    return emptyPrior("the prior results file records no scenarios array", false);
  }

  const match = compareTarget(obj.target as Record<string, unknown> | undefined, target);
  if (!match.match) {
    return emptyPrior(
      `prior results.json is for a DIFFERENT target and was not reused — ${match.reason}. ` +
        `Nothing from it (grounding or completed models) carries over.`,
      true,
    );
  }

  const grounding =
    obj.grounding &&
    typeof obj.grounding === "object" &&
    typeof (obj.grounding as PriorGrounding).content === "string" &&
    (obj.grounding as PriorGrounding).content.trim()
      ? {
          source: (obj.grounding as PriorGrounding).source ?? "model-knowledge (shared)",
          content: (obj.grounding as PriorGrounding).content,
        }
      : null;

  const done = new Map<string, Map<string, ModelResult>>();
  const scenarioMeta = new Map<string, PriorScenarioMeta>();
  for (const scenario of obj.scenarios as ScenarioResult[]) {
    if (!scenario || typeof scenario.id !== "string" || !Array.isArray(scenario.models)) continue;
    const models = new Map<string, ModelResult>();
    for (const model of scenario.models) {
      if (!model || typeof model.id !== "string") continue;
      // Forced ids are dropped from the recorded set so they re-run IN PLACE;
      // every other result — including results for models not selected this pass
      // — is kept so a filtered rerun never wipes the rest of the dataset.
      if (isForcedId(force, model)) continue;
      models.set(model.id, model);
    }
    done.set(scenario.id, models);
    scenarioMeta.set(scenario.id, {
      label: typeof scenario.label === "string" ? scenario.label : scenario.id,
      description: typeof scenario.description === "string" ? scenario.description : "",
      notes: Array.isArray(scenario.notes) ? scenario.notes : [],
    });
  }

  return { grounding, done, scenarioMeta, rejectedReason: null, hadPriorFile: true };
}

/** Read + interpret the prior results file. A missing/corrupt file is a clean
 * first run (with a reason), never a crash. */
export async function loadPrior(
  path: string,
  target: BakeoffTarget,
  force: Set<string>,
): Promise<Prior> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return emptyPrior(null, false);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return emptyPrior(
      `the prior results file could not be parsed (${
        err instanceof Error ? err.message : String(err)
      }); starting fresh`,
      false,
    );
  }
  return readPrior(parsed, target, force);
}

/**
 * Write JSON so the file on disk is ALWAYS a complete, valid dataset.
 *
 * The value is serialized in full BEFORE anything is written, then written to a
 * sibling temp file and renamed over the destination (rename is atomic within a
 * filesystem). A crash, a reaped process, or a concurrent reader therefore sees
 * either the previous complete dataset or the new complete dataset, never a
 * truncated one — which previously would have made the whole run's results
 * unreadable to both the viewer's build and the next resume.
 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, serialized, "utf8");
  await rename(tmp, path);
}

/**
 * Before a run overwrites a live results.json belonging to a DIFFERENT target,
 * keep a timestamped safety copy beside it (the existing `results.prior-*.json`
 * convention). Best-effort: a failure here must not fail the run, and the run's
 * own history archive remains the durable record.
 */
export async function backupPriorResults(path: string, stamp: string): Promise<string | null> {
  const dest = path.replace(/\.json$/, `.prior-${stamp}.json`);
  try {
    await copyFile(path, dest);
    return dest;
  } catch {
    return null;
  }
}
