import type { PhaseName } from "@workspace/mc-core";

/**
 * The run-level summary answers "who produced the current page HTML?"
 * Schema, research, and publish keep their own phase provenance and must not
 * replace the HTML attribution.
 */
export function shouldUpdatePageProvenance(phase: PhaseName, htmlChanged: boolean): boolean {
  return htmlChanged && (phase === "build" || phase === "audit");
}