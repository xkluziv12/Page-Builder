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

/**
 * Author the single shared research grounding for the target locality. Generated
 * ONCE (by the production synthesis model) and inlined identically into every
 * model's conversation, so the build/audit/schema work is the thing actually
 * being compared — not each model's research recall. This is the one place a
 * `system` instruction is used; the model build conversations carry none.
 */
export async function generateSharedGrounding(
  complete: CompleteFn,
  city: string,
  state: string,
  niche: string,
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
    throw new Error("Shared grounding author returned no content; cannot run the bake-off without grounding.");
  }
  return { content: `${GROUNDING_NOTE}\n\n${res.content.trim()}`, source: "model-knowledge (shared)" };
}
