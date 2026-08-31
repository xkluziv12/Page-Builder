import { ModelResult } from "@/types";
import { DATASETS, type Dataset } from "@/data/datasets";

/**
 * One recorded run of one exact model (matched by scenario id + the provider
 * model identifier, `ModelResult.model` — never by display label or slot id,
 * since those can collide across unrelated models or drift between runs) in
 * one dataset. `isCurrent` is true only for the pinned "current" dataset;
 * every other dataset (old/produce/history snapshots) is archived.
 */
export interface ModelVersion {
  datasetId: string;
  datasetLabel: string;
  scenarioId: string;
  scenarioLabel: string;
  isCurrent: boolean;
  /** ISO timestamp for this version, when known — null when neither the
   * dataset nor its results file carries a valid date. */
  ranAtIso: string | null;
  /** Human-readable date, or "Current"/"Undated" when `ranAtIso` is null. */
  dateLabel: string;
  model: ModelResult;
}

function isValidDateStr(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Resolve the display date for a dataset: the dataset's own `ranAt` (set for
 * history snapshots) takes precedence over the results file's `ranAt`, since
 * the hand-maintained current/old/produce entries don't set the former. Falls
 * back to a clear "Current"/"Undated" label rather than fabricating a date. */
function resolveVersionDate(dataset: Dataset): { ranAtIso: string | null; dateLabel: string } {
  if (isValidDateStr(dataset.ranAt)) {
    return { ranAtIso: dataset.ranAt, dateLabel: formatDate(dataset.ranAt) };
  }
  if (isValidDateStr(dataset.results.ranAt)) {
    return { ranAtIso: dataset.results.ranAt, dateLabel: formatDate(dataset.results.ranAt) };
  }
  return { ranAtIso: null, dateLabel: dataset.id === "current" ? "Current" : "Undated" };
}

/**
 * Every recorded version of one exact model in one exact scenario, across
 * every dataset (current/old/produce/history), sorted current-first then
 * newest-to-oldest, with undated archives last. Does not merge results across
 * different scenarios or different provider model identifiers.
 */
export function getModelVersions(scenarioId: string, providerModel: string): ModelVersion[] {
  const versions: ModelVersion[] = [];
  const seenRunTimestamps = new Set<string>();
  for (const dataset of DATASETS) {
    const scenario = dataset.results.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) continue;
    for (const model of scenario.models) {
      if (model.model !== providerModel) continue;
      const { ranAtIso, dateLabel } = resolveVersionDate(dataset);
      // Pinned datasets appear before generated history snapshots in DATASETS.
      // Keep that first representation when the same run was archived twice.
      if (ranAtIso && seenRunTimestamps.has(ranAtIso)) continue;
      if (ranAtIso) seenRunTimestamps.add(ranAtIso);
      versions.push({
        datasetId: dataset.id,
        datasetLabel: dataset.label,
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        isCurrent: dataset.id === "current",
        ranAtIso,
        dateLabel,
        model,
      });
    }
  }
  return versions.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.ranAtIso && b.ranAtIso) return a.ranAtIso < b.ranAtIso ? 1 : -1;
    if (a.ranAtIso) return -1;
    if (b.ranAtIso) return 1;
    return 0;
  });
}
