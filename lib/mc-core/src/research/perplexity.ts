import type { ResearchInput } from "./provider";

export const PERPLEXITY_BASE = "https://api.perplexity.ai/chat/completions";

/** Default Perplexity model — web-grounded with inline citations. */
const DEFAULT_MODEL = "sonar-pro";

/** Web-grounded research text plus the citation URLs that grounded it. */
export interface GroundedResearch {
  content: string;
  citations: string[];
}

/** A function that performs live, web-grounded research for a locality. */
export type GroundedResearchFn = (input: ResearchInput) => Promise<GroundedResearch>;

function researchPrompt(input: ResearchInput): string {
  const topic = input.blogTopic ? ` Focus area: ${input.blogTopic}.` : "";
  return [
    `Research the local market for "${input.niche}" in ${input.city}, ${input.state} (USA) for STS Electronic Recycling.${topic}`,
    "Gather, with citations to authoritative sources (government/economic-development sites, business directories, news):",
    "- Major local employers and recyclers/competitors, including verified employee counts where available (cite the source for each figure).",
    "- Notable local industries, institutions, and demographics relevant to electronics recycling demand.",
    "- Local regulations, e-waste programs, and any city/county specifics.",
    "Prefer verified, sourced figures over estimates. If a figure is an estimate, say so explicitly.",
  ].join("\n");
}

/**
 * Build a {@link GroundedResearchFn} backed by the Perplexity API. The key is
 * checked at call time (not construction) so a missing key fails the research
 * phase loudly — never silently degrading to an ungrounded brief. Any non-OK
 * response or empty body throws.
 */
export function createPerplexityResearch(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  model: string = DEFAULT_MODEL,
): GroundedResearchFn {
  return async (input: ResearchInput): Promise<GroundedResearch> => {
    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        "PERPLEXITY_API_KEY is not configured; cannot run web-grounded research. Set the key or select the n8n research provider (MC_RESEARCH_PROVIDER=n8n).",
      );
    }
    const res = await fetchImpl(PERPLEXITY_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a meticulous local-market research analyst. Answer only with web-grounded facts and cite every figure.",
          },
          { role: "user", content: researchPrompt(input) },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Perplexity research request failed (${res.status} ${res.statusText}): ${body.slice(0, 300)}`,
      );
    }
    const data = (await res.json()) as Record<string, unknown>;
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = typeof message?.content === "string" ? message.content : "";
    if (!content.trim()) {
      throw new Error(
        "Perplexity returned an empty research response; cannot build a page on missing research.",
      );
    }
    const citations = Array.isArray(data.citations)
      ? (data.citations as unknown[]).map(String).filter(Boolean)
      : [];
    return { content, citations };
  };
}
