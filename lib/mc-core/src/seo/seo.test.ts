import { describe, expect, it } from "vitest";
import {
  parseCityState,
  stateNameForAbbr,
  normalizeTargetUrl,
  isPrivateHostname,
} from "./url";
import {
  deriveClassification,
  estimateWordCount,
  probeTargetPage,
} from "./classify";
import { deriveCompetition } from "./competition";
import { parseSerp } from "./serpapi";
import { parseKeywordOverview } from "./dataforseo";

describe("parseCityState", () => {
  it("parses niche-prefixed slug with abbreviation", () => {
    const r = parseCityState(
      "https://www.stselectronicrecyclinginc.com/electronics-recycling-austin-tx",
    );
    expect(r).toEqual({
      city: "Austin",
      state: "TX",
      stateName: "Texas",
      niche: "electronics recycling",
    });
  });

  it("parses multi-word city", () => {
    const r = parseCityState("https://x.com/electronics-recycling-san-antonio-tx");
    expect(r?.city).toBe("San Antonio");
    expect(r?.state).toBe("TX");
  });

  it("parses city-first slug with trailing niche", () => {
    const r = parseCityState("https://x.com/austin-tx-electronics-recycling");
    expect(r?.city).toBe("Austin");
    expect(r?.state).toBe("TX");
  });

  it("parses full state name", () => {
    const r = parseCityState("https://x.com/san-antonio-texas");
    expect(r?.city).toBe("San Antonio");
    expect(r?.state).toBe("TX");
  });

  it("parses two-word state name", () => {
    const r = parseCityState("https://x.com/electronics-recycling-buffalo-new-york");
    expect(r?.city).toBe("Buffalo");
    expect(r?.state).toBe("NY");
  });

  it("returns null when no state is present", () => {
    expect(parseCityState("https://x.com/about-us")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseCityState("not a url at all spaces")).toBeNull();
  });
});

describe("stateNameForAbbr", () => {
  it("expands abbreviations", () => {
    expect(stateNameForAbbr("TX")).toBe("Texas");
    expect(stateNameForAbbr("ny")).toBe("New York");
  });
});

describe("deriveClassification", () => {
  it("returns NEW_BUILD when page does not exist", () => {
    expect(deriveClassification({ exists: false, status: 404, wordCount: 0 })).toBe(
      "NEW_BUILD",
    );
  });
  it("returns REVAMP for a thin existing page", () => {
    expect(deriveClassification({ exists: true, status: 200, wordCount: 120 })).toBe(
      "REVAMP",
    );
  });
  it("returns LIGHT_TOUCH for a substantial existing page", () => {
    expect(deriveClassification({ exists: true, status: 200, wordCount: 1500 })).toBe(
      "LIGHT_TOUCH",
    );
  });
});

describe("estimateWordCount", () => {
  it("strips tags/script/style", () => {
    const html =
      "<html><head><style>.a{color:red}</style><script>var x=1;</script></head><body><h1>Hello world</h1><p>three more words here</p></body></html>";
    expect(estimateWordCount(html)).toBe(6);
  });
});

describe("normalizeTargetUrl", () => {
  it("prepends https when scheme is missing", () => {
    expect(normalizeTargetUrl("stsrecycling.com/electronics-recycling-austin-tx")).toBe(
      "https://stsrecycling.com/electronics-recycling-austin-tx",
    );
  });
  it("keeps an explicit http(s) URL", () => {
    expect(normalizeTargetUrl("http://x.com/austin-tx")).toBe("http://x.com/austin-tx");
  });
  it("rejects non-http(s) schemes", () => {
    expect(normalizeTargetUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeTargetUrl("ftp://x.com/a")).toBeNull();
  });
});

describe("isPrivateHostname", () => {
  it("flags loopback and private ranges", () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.1",
      "172.16.5.5",
      "169.254.1.1",
      "::1",
      "metadata.internal",
      "printer.local",
    ]) {
      expect(isPrivateHostname(h)).toBe(true);
    }
  });
  it("allows public hosts", () => {
    for (const h of ["stsrecycling.com", "8.8.8.8", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateHostname(h)).toBe(false);
    }
  });
});

describe("probeTargetPage (SSRF guard)", () => {
  it("refuses to fetch a private host", async () => {
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return new Response("x", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await probeTargetPage("http://169.254.169.254/latest/meta-data", fakeFetch);
    expect(called).toBe(false);
    expect(r).toEqual({ exists: false, status: null, wordCount: 0 });
  });

  it("blocks a redirect into private space", async () => {
    const hosts: string[] = [];
    const fakeFetch = (async (input: string) => {
      hosts.push(new URL(input).hostname);
      if (new URL(input).hostname === "public.example.com") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/secret" },
        });
      }
      return new Response("should not reach", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await probeTargetPage("https://public.example.com/redir", fakeFetch);
    expect(hosts).toEqual(["public.example.com"]);
    expect(r.exists).toBe(false);
  });

  it("reads a normal public page", async () => {
    const fakeFetch = (async () =>
      new Response("<html><body><p>one two three</p></body></html>", {
        status: 200,
      })) as unknown as typeof fetch;
    const r = await probeTargetPage("https://public.example.com/austin-tx", fakeFetch);
    expect(r.exists).toBe(true);
    expect(r.wordCount).toBe(3);
  });
});

describe("deriveCompetition", () => {
  it("trusts DataForSEO difficulty when present", () => {
    expect(
      deriveCompetition({ adsCount: 0, localPackCount: 0, organicCount: 0, difficulty: 80 }),
    ).toEqual({ competition: "HIGH", score: 80 });
    expect(
      deriveCompetition({ adsCount: 0, localPackCount: 0, organicCount: 0, difficulty: 10 }),
    ).toEqual({ competition: "LOW", score: 10 });
  });
  it("falls back to SERP density", () => {
    const low = deriveCompetition({
      adsCount: 0,
      localPackCount: 1,
      organicCount: 5,
      difficulty: null,
    });
    expect(low.competition).toBe("LOW");
    const high = deriveCompetition({
      adsCount: 5,
      localPackCount: 3,
      organicCount: 10,
      difficulty: null,
    });
    expect(high.competition).toBe("HIGH");
  });
});

describe("parseSerp", () => {
  it("extracts organic, local pack, ads, PAA, related", () => {
    const r = parseSerp({
      organic_results: [
        { title: "A", link: "https://a.com", position: 1 },
        { title: "B", link: "https://b.com", position: 2 },
      ],
      local_results: { places: [{}, {}, {}] },
      ads: [{}, {}],
      related_questions: [{ question: "what is e-waste?" }],
      related_searches: [{ query: "computer recycling austin" }],
    });
    expect(r.organic).toHaveLength(2);
    expect(r.localPackCount).toBe(3);
    expect(r.adsCount).toBe(2);
    expect(r.peopleAlsoAsk).toEqual(["what is e-waste?"]);
    expect(r.relatedSearches).toEqual(["computer recycling austin"]);
  });
});

describe("parseKeywordOverview", () => {
  it("extracts keyword metrics from nested DataForSEO shape", () => {
    const r = parseKeywordOverview({
      tasks: [
        {
          result: [
            {
              items: [
                {
                  keyword: "electronics recycling austin tx",
                  keyword_info: { search_volume: 320, competition_level: "MEDIUM" },
                  keyword_properties: { keyword_difficulty: 42 },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(r).toEqual([
      {
        keyword: "electronics recycling austin tx",
        searchVolume: 320,
        difficulty: 42,
        competition: "MEDIUM",
      },
    ]);
  });
});
