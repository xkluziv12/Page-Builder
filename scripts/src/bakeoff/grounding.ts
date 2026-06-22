import { DirectResearchProvider, type ResearchProvider } from "@workspace/mc-core";
import type { CompleteFn } from "./providers";

export interface SharedGrounding {
  /** The shared research prose every model synthesizes its brief from. */
  content: string;
  /** Where this grounding came from (for the results transparency record). */
  source: string;
}

const GROUNDING_NOTE =
  "[MODEL-KNOWLEDGE GROUNDING — Perplexity/SerpAPI keys are not configured in this environment, " +
  "so this is NOT a live web search. It is one model-authored local-market brief, generated ONCE and " +
  "shared identically across every model so the page-build comparison is fair.]";

/**
 * Author the single shared research grounding for the target locality. This is
 * generated once (by the production synthesis model) and fed identically into
 * every model's research-synthesis step, isolating the build/audit/schema work
 * as the thing actually being compared.
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
  const res = await complete(system, user);
  if (!res.content.trim()) {
    throw new Error("Shared grounding author returned no content; cannot run the bake-off without grounding.");
  }
  return { content: `${GROUNDING_NOTE}\n\n${res.content.trim()}`, source: "model-knowledge (shared)" };
}

/**
 * Build a per-model {@link ResearchProvider} that synthesizes a brief from the
 * SAME shared grounding. Each model runs its own synthesis step (the production
 * DirectResearchProvider flow), but the grounding + entity seeds are identical
 * across models.
 */
export function researchProviderFor(
  grounding: SharedGrounding,
  synthesizeComplete: CompleteFn,
): ResearchProvider {
  return new DirectResearchProvider({
    groundedResearch: async () => ({ content: grounding.content, citations: [] }),
    fetchEntities: async () => [],
    synthesize: async (system, user) => (await synthesizeComplete(system, user)).content,
  });
}
