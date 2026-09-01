import type { CompleteFn } from "./providers.js";

export interface SharedGrounding {
  /** The shared local-market research prose every model receives identically. */
  content: string;
  /** Where this grounding came from (for the results transparency record). */
  source: string;
}

const GROUNDING_NOTE =
  "[MODEL-KNOWLEDGE GROUNDING — Perplexity/SerpAPI keys are not configured in this environment, " +
  "so this is NOT a live web search. It is one model-authored local-market brief, generated ONCE and " +
  "shared identically across every model so the page-build comparison is fair.]";

/** Base provenance string, unchanged from the original single-author harness. */
const BASE_SOURCE = "model-knowledge (shared)";

/** Who wrote the brief, for the transparency record only. Deliberately kept OUT
 * of {@link SharedGrounding.content}: the brief itself must stay byte-identical
 * for every cell, so no model can tell which provider authored its input. */
export interface GroundingAuthorInfo {
  provider: string;
  model: string;
}

/** `model-knowledge (shared; authored by Google gemini-3.7-flash)`. Falls back to
 * the bare historical string when no author is supplied. */
export function groundingSourceLabel(author?: GroundingAuthorInfo | null): string {
  if (!author) return BASE_SOURCE;
  return `model-knowledge (shared; authored by ${author.provider} ${author.model})`;
}

/**
 * Author the single shared research grounding for the target locality. Generated
 * ONCE (by the production synthesis model) and inlined identically into every
 * model's conversation, so the build/audit/schema work is the thing actually
 * being compared — not each model's research recall. This is the one place a
 * `system` instruction is used; the model build conversations carry none.
 *
 * `author` only labels the provenance. Omit it and the source string stays the
 * original bare `model-knowledge (shared)`, so existing callers are unchanged.
 */
export async function generateSharedGrounding(
  complete: CompleteFn,
  city: string,
  state: string,
  niche: string,
  author?: GroundingAuthorInfo | null,
): Promise<SharedGrounding> {
  const system = [
    "You are a meticulous local-market research analyst for STS Electronic Recycling.",
    "Produce a detailed, well-organized local-market research summary in prose.",
    "Cover: major local employers and industries, the competitive landscape for the niche,",
    "relevant demographics and institutions, and any local e-waste/recycling regulations or programs.",
    "Be concrete with names where you can. Do not fabricate precise figures — if a number is an",
    "estimate from general knowledge, say so explicitly.",
  ].join("\n");
  const user = [
    `Locality: ${city}, ${state} (USA). Niche: ${niche}.`,
    "Write the local-market research summary now (prose, ~400-600 words).",
  ].join("\n");
  const res = await complete([{ role: "user", content: user }], system);
  if (!res.content.trim()) {
    const who = author ? `${author.provider} ${author.model}` : "the configured author";
    throw new Error(
      `Shared grounding author (${who}) returned no content; cannot run the bake-off without grounding.`,
    );
  }
  return {
    content: `${GROUNDING_NOTE}\n\n${res.content.trim()}`,
    source: groundingSourceLabel(author),
  };
}
