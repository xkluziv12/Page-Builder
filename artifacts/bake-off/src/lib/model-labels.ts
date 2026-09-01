import type { BakeoffResults, ModelResult, Provenance } from "@/types";

/**
 * Shared, presentation-only labelling for a recorded result. Every helper here
 * treats an ABSENT field as "not recorded" and says so — it never fills a gap
 * with a plausible default, because the datasets deliberately mix runs recorded
 * before and after effort/provenance/variant tracking existed.
 */

/** Compact "actual source" label. Never assume direct-api when absent. */
export function provenanceLabel(p: Provenance | null | undefined): string {
  if (!p) return "Not recorded";
  if (p.provider && p.model) return `${p.provider}/${p.model}`;
  if (p.provider) return p.provider;
  return p.sourceKind || "Not recorded";
}

/** The model SLOT behind a variant id, for grouping a family's effort variants.
 * Falls back to splitting the id, so legacy ids (which carry no separator and no
 * `baseId`) group under themselves exactly as before. */
export function baseIdOf(model: Pick<ModelResult, "id" | "baseId">): string {
  if (model.baseId?.trim()) return model.baseId.trim();
  const idx = model.id.indexOf(".");
  return idx === -1 ? model.id : model.id.slice(0, idx);
}

/**
 * How this cell's reasoning effort should read. The distinction that matters:
 * a real "low"/"medium" tier vs. a provider-default CONTROL run on a provider
 * that has no effort knob — those must never look the same.
 */
export function effortLabel(model: ModelResult): string {
  const effort = model.effort;
  if (effort == null || effort === "") return "unknown (not recorded)";
  if (effort === "not-supported") return "control run (provider has no effort control)";
  if (effort === "not-applicable") return "n/a (tag takes no effort setting)";
  if (effort === "provider-default") return "provider default (no effort sent)";
  // A concrete tier. Say whether the operator actually asked for it, when known.
  if (model.effortRequested) return `${effort} (requested)`;
  if (model.effortSupported === true) return `${effort} (adapter default)`;
  return effort;
}

/** True when this cell was run at an explicitly requested effort tier — the only
 * case where comparing it against another tier of the same model is meaningful. */
export function hasRequestedEffort(model: ModelResult): boolean {
  return typeof model.effortRequested === "string" && model.effortRequested.trim() !== "";
}

/** One-line target identity for a dataset, so rows from different cities are
 * never silently compared as if they were the same page. */
export function targetLabel(results: BakeoffResults): string {
  const t = results.target;
  if (!t) return "target not recorded";
  const place = [t.city, t.state].filter(Boolean).join(", ");
  return place || t.url || "target not recorded";
}
