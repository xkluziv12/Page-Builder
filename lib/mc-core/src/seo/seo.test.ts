import { describe, expect, it } from "vitest";
import {
  parseCityState,
  stateNameForAbbr,
  normalizeTargetUrl,
  isPrivateHostname,
  isPublicHostname,
  fetchWithValidatedDns,
  normalizeStateToAbbr,
} from "./url";
import { extractLocations, cityNamesEquivalent } from "./location";
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
  it("rejects alternate numeric spellings of private IPv4 addresses", () => {
    for (const raw of [
      "http://2130706433/",
      "http://0177.0.0.1/",
      "http://0x7f000001/",
      "http://127.1/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
    ]) {
      expect(normalizeTargetUrl(raw)).toBeNull();
    }
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
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "0.0.0.0",
      "192.0.2.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
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

describe("isPublicHostname", () => {
  it("requires every DNS answer to be public", async () => {
    const resolver = async () => ["93.184.216.34", "10.0.0.8"];
    await expect(isPublicHostname("public.example.com", resolver)).resolves.toBe(false);
  });

  it("allows a hostname with only public DNS answers", async () => {
    const resolver = async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];
    await expect(isPublicHostname("public.example.com", resolver)).resolves.toBe(true);
  });
});

describe("fetchWithValidatedDns", () => {
  it("refuses a private answer at the connection lookup boundary", async () => {
    let lookups = 0;
    await expect(
      fetchWithValidatedDns("http://rebind.example.com/austin-tx", {}, async () => {
        lookups += 1;
        return ["127.0.0.1"];
      }),
    ).rejects.toThrow("Refusing to connect to a non-public address");
    expect(lookups).toBe(1);
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
    const resolver = async (host: string) =>
      host === "blocked.example.com" ? ["127.0.0.1"] : ["93.184.216.34"];
    const fakeFetch = (async (input: string) => {
      hosts.push(new URL(input).hostname);
      if (new URL(input).hostname === "public.example.com") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://blocked.example.com/secret" },
        });
      }
      return new Response("should not reach", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await probeTargetPage("https://public.example.com/redir", fakeFetch, resolver);
    expect(hosts).toEqual(["public.example.com"]);
    expect(r.exists).toBe(false);
  });

  it("refuses a public hostname that resolves to a private address", async () => {
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return new Response("x", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await probeTargetPage(
      "https://rebind.example.com/austin-tx",
      fakeFetch,
      async () => ["169.254.169.254"],
    );
    expect(called).toBe(false);
    expect(r).toEqual({ exists: false, status: null, wordCount: 0 });
  });

  it("reads a normal public page", async () => {
    const fakeFetch = (async () =>
      new Response("<html><body><p>one two three</p></body></html>", {
        status: 200,
      })) as unknown as typeof fetch;
    const r = await probeTargetPage(
      "https://public.example.com/austin-tx",
      fakeFetch,
      async () => ["93.184.216.34"],
    );
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

describe("normalizeStateToAbbr", () => {
  it("accepts abbreviations and full names, rejects junk", () => {
    expect(normalizeStateToAbbr("tx")).toBe("TX");
    expect(normalizeStateToAbbr("TX")).toBe("TX");
    expect(normalizeStateToAbbr("Texas")).toBe("TX");
    expect(normalizeStateToAbbr("  florida ")).toBe("FL");
    expect(normalizeStateToAbbr("Notastate")).toBe(null);
    expect(normalizeStateToAbbr("")).toBe(null);
  });
});

describe("extractLocations", () => {
  it("pulls city/state from JSON-LD PostalAddress", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type":"LocalBusiness","address":{"@type":"PostalAddress","addressLocality":"Austin","addressRegion":"TX"}}
    </script></head><body></body></html>`;
    expect(extractLocations(html)).toEqual([{ city: "Austin", state: "TX" }]);
  });

  it("pulls City, ST ZIP from visible text", () => {
    const html = "<html><body><footer>Visit us at 1 Main St, Portland, OR 97201</footer></body></html>";
    expect(extractLocations(html)).toContainEqual({ city: "Portland", state: "OR" });
  });

  it("normalizes a full state name in JSON-LD", () => {
    const html = `<script type="application/ld+json">
      {"address":{"addressLocality":"portland","addressRegion":"Maine"}}
    </script>`;
    expect(extractLocations(html)).toEqual([{ city: "Portland", state: "ME" }]);
  });

  it("dedupes repeated signals and ignores malformed JSON-LD", () => {
    const html = `
      <script type="application/ld+json">{ not valid json }</script>
      <script type="application/ld+json">{"address":{"addressLocality":"Austin","addressRegion":"TX"}}</script>
      <p>Austin, TX 78701</p>`;
    expect(extractLocations(html)).toEqual([{ city: "Austin", state: "TX" }]);
  });

  it("returns nothing for a page with no location signals", () => {
    expect(extractLocations("<html><body><p>hello world</p></body></html>")).toEqual([]);
  });
});

describe("cityNamesEquivalent", () => {
  it("matches the same locality across case, punctuation and abbreviations", () => {
    expect(cityNamesEquivalent("Austin", "austin")).toBe(true);
    expect(cityNamesEquivalent("St. Louis", "Saint Louis")).toBe(true);
    expect(cityNamesEquivalent("St Louis", "saint louis")).toBe(true);
    expect(cityNamesEquivalent("Ft Worth", "Fort Worth")).toBe(true);
    expect(cityNamesEquivalent("Mt Pleasant", "Mount Pleasant")).toBe(true);
  });

  it("never substring-matches a different locality", () => {
    expect(cityNamesEquivalent("York", "New York")).toBe(false);
    expect(cityNamesEquivalent("Port", "Portland")).toBe(false);
    expect(cityNamesEquivalent("Orange", "West Orange")).toBe(false);
    expect(cityNamesEquivalent("Portland", "Portsmouth")).toBe(false);
    expect(cityNamesEquivalent("", "Austin")).toBe(false);
  });
});
