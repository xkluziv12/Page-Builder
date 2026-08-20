import { describe, expect, it } from "vitest";
import { scanJsonLd } from "./jsonld";
import { runGtmetrixSpeedCheck } from "./gtmetrix";
import { runPostPublishQc } from "./index";

function ldScript(json: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
}

describe("scanJsonLd", () => {
  it("passes a clean single-block page", () => {
    const html = `<html><head>${ldScript({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "@id": "https://x.com/#biz",
      name: "STS",
    })}</head></html>`;
    const scan = scanJsonLd(html);
    expect(scan.ran).toBe(true);
    expect(scan.passed).toBe(true);
    expect(scan.blockCount).toBe(1);
    expect(scan.duplicateTypes).toEqual([]);
  });

  it("flags two LocalBusiness blocks as a duplicate singleton type", () => {
    const block = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "STS",
    };
    const html = ldScript(block) + ldScript({ ...block, name: "STS 2" });
    const scan = scanJsonLd(html);
    expect(scan.passed).toBe(false);
    expect(scan.duplicateTypes).toContain("LocalBusiness");
    expect(scan.blockCount).toBe(2);
  });

  it("detects duplicate singletons inside a single @graph block", () => {
    const html = ldScript({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", "@id": "https://x.com/#page" },
        { "@type": "WebPage", "@id": "https://x.com/#page2" },
      ],
    });
    const scan = scanJsonLd(html);
    expect(scan.passed).toBe(false);
    expect(scan.duplicateTypes).toContain("WebPage");
  });

  it("flags the same @id defined on two typed nodes", () => {
    const html = ldScript({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "@id": "https://x.com/#shared" },
        { "@type": "WebSite", "@id": "https://x.com/#shared" },
      ],
    });
    const scan = scanJsonLd(html);
    expect(scan.passed).toBe(false);
    expect(scan.conflictingIds).toContain("https://x.com/#shared");
  });

  it("does NOT flag an @id that is reused only as a reference pointer", () => {
    const html = ldScript({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", "@id": "https://x.com/#page", about: { "@id": "https://x.com/#biz" } },
        { "@type": "LocalBusiness", "@id": "https://x.com/#biz" },
      ],
    });
    const scan = scanJsonLd(html);
    expect(scan.conflictingIds).toEqual([]);
    expect(scan.passed).toBe(true);
  });

  it("does NOT flag legitimately repeatable types", () => {
    const html = ldScript({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Service", name: "Recycling" },
        { "@type": "Service", name: "Shredding" },
      ],
    });
    const scan = scanJsonLd(html);
    expect(scan.passed).toBe(true);
    expect(scan.duplicateTypes).toEqual([]);
  });

  it("flags malformed JSON", () => {
    const html = `<script type="application/ld+json">{ "@type": "LocalBusiness", }broken</script>`;
    const scan = scanJsonLd(html);
    expect(scan.passed).toBe(false);
    expect(scan.invalidBlockIndexes).toEqual([0]);
    expect(scan.blocks[0]?.valid).toBe(false);
  });

  it("notes when no JSON-LD is present", () => {
    const scan = scanJsonLd("<html><body>nothing</body></html>");
    expect(scan.blockCount).toBe(0);
    expect(scan.issues.some((i) => /No JSON-LD/.test(i))).toBe(true);
  });
});

/** Build a fetch stub that walks GTmetrix's start → poll → report sequence. */
function gtmetrixFetch(report: Record<string, unknown>, state = "completed"): typeof fetch {
  let calls = 0;
  return (async (url: string) => {
    calls += 1;
    const u = String(url);
    if (u.endsWith("/tests") && calls === 1) {
      return json({ data: { id: "t1", type: "test", attributes: { state: "queued" } } });
    }
    if (u.endsWith("/tests/t1")) {
      return json({
        data: {
          id: "t1",
          attributes: { state },
          links: { report: "https://gtmetrix.com/api/2.0/reports/r1" },
        },
      });
    }
    if (u.endsWith("/reports/r1")) {
      return json({ data: { id: "r1", attributes: report, links: { report_url: "https://gtmetrix.com/reports/r1" } } });
    }
    return json({}, 404);
  }) as unknown as typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fastPoll = { pollIntervalMs: 0, maxPollMs: 1000, sleep: async () => {} };

describe("runGtmetrixSpeedCheck", () => {
  it("passes a fast page", async () => {
    const check = await runGtmetrixSpeedCheck({
      apiKey: "k",
      url: "https://x.com/page",
      fetchImpl: gtmetrixFetch({ performance_score: 95, largest_contentful_paint: 1200, structure_score: 90 }),
      ...fastPoll,
    });
    expect(check.ran).toBe(true);
    expect(check.passed).toBe(true);
    expect(check.metrics?.performanceScore).toBe(95);
    expect(check.metrics?.lcp).toBe(1200);
  });

  it("fails when performance score is below 85", async () => {
    const check = await runGtmetrixSpeedCheck({
      apiKey: "k",
      url: "https://x.com/page",
      fetchImpl: gtmetrixFetch({ performance_score: 70, largest_contentful_paint: 1000 }),
      ...fastPoll,
    });
    expect(check.passed).toBe(false);
    expect(check.failReasons.some((r) => /Performance score/.test(r))).toBe(true);
  });

  it("fails when LCP exceeds 2.5s", async () => {
    const check = await runGtmetrixSpeedCheck({
      apiKey: "k",
      url: "https://x.com/page",
      fetchImpl: gtmetrixFetch({ performance_score: 95, largest_contentful_paint: 3200 }),
      ...fastPoll,
    });
    expect(check.passed).toBe(false);
    expect(check.failReasons.some((r) => /LCP/.test(r))).toBe(true);
  });

  it("captures an API error without throwing", async () => {
    const failing = (async () => json({ error: "bad key" }, 401)) as unknown as typeof fetch;
    const check = await runGtmetrixSpeedCheck({
      apiKey: "k",
      url: "https://x.com/page",
      fetchImpl: failing,
      ...fastPoll,
    });
    expect(check.ran).toBe(false);
    expect(check.passed).toBe(false);
    expect(check.error).toMatch(/401/);
  });
});

describe("runPostPublishQc", () => {
  const cleanHtml = `<html><head>${ldScript({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "STS",
  })}</head></html>`;

  it("records a skipped GTmetrix check when no API key is set and overall fails", async () => {
    const fetchImpl = (async () => new Response(cleanHtml, { status: 200 })) as unknown as typeof fetch;
    const report = await runPostPublishQc({ url: "https://x.com/page", fetchImpl });
    expect(report.jsonLd.passed).toBe(true);
    expect(report.gtmetrix.ran).toBe(false);
    expect(report.gtmetrix.error).toMatch(/GTMETRIX_API_KEY/);
    expect(report.passed).toBe(false);
  });

  it("passes when both the speed check and the JSON-LD scan pass", async () => {
    const fetchImpl = (async (url: string) => {
      const u = String(url);
      if (u.includes("gtmetrix.com/api")) {
        return gtmetrixFetch({ performance_score: 95, largest_contentful_paint: 1000 })(url);
      }
      return new Response(cleanHtml, { status: 200 });
    }) as unknown as typeof fetch;
    const report = await runPostPublishQc({
      url: "https://x.com/page",
      gtmetrixApiKey: "k",
      fetchImpl,
      gtmetrixOptions: fastPoll,
    });
    expect(report.passed).toBe(true);
    expect(report.gtmetrix.passed).toBe(true);
    expect(report.jsonLd.passed).toBe(true);
  });

  it("fails overall when the JSON-LD scan finds a duplicate even if speed passes", async () => {
    const dupHtml =
      ldScript({ "@type": "LocalBusiness", name: "a" }) + ldScript({ "@type": "LocalBusiness", name: "b" });
    const fetchImpl = (async (url: string) => {
      const u = String(url);
      if (u.includes("gtmetrix.com/api")) {
        return gtmetrixFetch({ performance_score: 95, largest_contentful_paint: 1000 })(url);
      }
      return new Response(dupHtml, { status: 200 });
    }) as unknown as typeof fetch;
    const report = await runPostPublishQc({
      url: "https://x.com/page",
      gtmetrixApiKey: "k",
      fetchImpl,
      gtmetrixOptions: fastPoll,
    });
    expect(report.gtmetrix.passed).toBe(true);
    expect(report.jsonLd.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  it("captures a fetch failure on the live page", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const report = await runPostPublishQc({ url: "https://x.com/page", gtmetrixApiKey: "k", fetchImpl, gtmetrixOptions: fastPoll });
    expect(report.jsonLd.ran).toBe(false);
    expect(report.jsonLd.error).toMatch(/ECONNREFUSED/);
    expect(report.passed).toBe(false);
  });
});
