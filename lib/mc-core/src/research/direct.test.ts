import { describe, expect, it } from "vitest";
import { DirectResearchProvider, type DirectResearchDeps } from "./direct";
import { createPerplexityResearch } from "./perplexity";
import type { ResearchInput } from "./provider";

const INPUT: ResearchInput = {
  city: "Austin",
  state: "TX",
  niche: "electronics recycling",
  track: "page",
  blogTopic: null,
  verifiedCid: null,
};

function deps(overrides: Partial<DirectResearchDeps> = {}): DirectResearchDeps {
  return {
    groundedResearch: async () => ({
      content: "Austin has a strong tech sector. Acme Recycling employs 250 staff per JEDCO.",
      citations: ["https://jedco.example/acme"],
    }),
    fetchEntities: async () => [{ name: "Beta Recyclers", source: "https://serp.example/beta" }],
    synthesize: async () =>
      JSON.stringify({
        summary: "Austin local-market overview for electronics recycling.",
        entities: [
          { name: "Acme Recycling", employeeCount: 250, source: "https://jedco.example/acme", verified: true },
        ],
        sources: ["https://jedco.example/acme"],
      }),
    ...overrides,
  };
}

describe("DirectResearchProvider", () => {
  it("produces a ResearchBrief from grounded research + entities + synthesis", async () => {
    const provider = new DirectResearchProvider(deps());
    const brief = await provider.research(INPUT);
    expect(provider.name).toBe("direct");
    expect(brief.summary).toMatch(/Austin/);
    expect(brief.entities).toHaveLength(1);
    expect(brief.entities[0]!.name).toBe("Acme Recycling");
    // Sources merge perplexity citations, synthesis sources, and serp entity links.
    expect(brief.sources).toContain("https://jedco.example/acme");
    expect(brief.sources).toContain("https://serp.example/beta");
    expect(brief.flags).toEqual([]);
    expect(brief.raw).toBeTruthy();
  });

  it("dedupes merged sources", async () => {
    const provider = new DirectResearchProvider(deps());
    const brief = await provider.research(INPUT);
    expect(new Set(brief.sources).size).toBe(brief.sources.length);
  });

  it("fails loudly on malformed synthesis JSON", async () => {
    const provider = new DirectResearchProvider(deps({ synthesize: async () => "not json at all" }));
    await expect(provider.research(INPUT)).rejects.toThrow(/malformed JSON/i);
  });

  it("fails loudly on an empty synthesis response", async () => {
    const provider = new DirectResearchProvider(deps({ synthesize: async () => "   " }));
    await expect(provider.research(INPUT)).rejects.toThrow(/empty response/i);
  });

  it("fails loudly when synthesis returns no summary", async () => {
    const provider = new DirectResearchProvider(
      deps({ synthesize: async () => JSON.stringify({ entities: [], sources: [] }) }),
    );
    await expect(provider.research(INPUT)).rejects.toThrow(/no summary/i);
  });

  it("fails loudly when grounded research returns empty content", async () => {
    const provider = new DirectResearchProvider(
      deps({ groundedResearch: async () => ({ content: "  ", citations: [] }) }),
    );
    await expect(provider.research(INPUT)).rejects.toThrow(/no content/i);
  });

  it("strips a JSON code fence from the synthesis output", async () => {
    const fenced = "```json\n" + JSON.stringify({ summary: "ok", entities: [], sources: [] }) + "\n```";
    const provider = new DirectResearchProvider(deps({ synthesize: async () => fenced }));
    const brief = await provider.research(INPUT);
    expect(brief.summary).toBe("ok");
  });
});

describe("createPerplexityResearch", () => {
  it("fails loudly when the key is missing", async () => {
    const research = createPerplexityResearch("");
    await expect(research(INPUT)).rejects.toThrow(/PERPLEXITY_API_KEY is not configured/);
  });

  it("calls the API and parses content + citations", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "grounded answer" } }],
          citations: ["https://a.example", "https://b.example"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    const research = createPerplexityResearch("key", fakeFetch);
    const result = await research(INPUT);
    expect(result.content).toBe("grounded answer");
    expect(result.citations).toEqual(["https://a.example", "https://b.example"]);
  });

  it("throws on a non-OK response", async () => {
    const fakeFetch = (async () =>
      new Response("nope", { status: 500, statusText: "Server Error" })) as unknown as typeof fetch;
    const research = createPerplexityResearch("key", fakeFetch);
    await expect(research(INPUT)).rejects.toThrow(/Perplexity research request failed/);
  });

  it("throws on an empty content body", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const research = createPerplexityResearch("key", fakeFetch);
    await expect(research(INPUT)).rejects.toThrow(/empty research response/i);
  });
});
