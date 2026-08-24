import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../registry";
import { describeContext } from "../engine/context";
import type { GmbProfile, RunContext } from "../types";
import {
  auditPagePrompt,
  buildPagePrompt,
  promptForPhase,
  schemaPrompt,
  verifyPrompt,
} from "./builders";
import { pageBuilderPrompt, schemaGeneratorPrompt, seoAuditPrompt } from "./editorialReview";

function ctx(extra: Partial<RunContext> = {}): RunContext {
  return {
    city: "Austin",
    state: "TX",
    track: "page",
    classification: "NEW_BUILD",
    competition: "LOW",
    pageType: "SPOKE",
    niche: "general",
    existingUrls: [],
    handoff: null,
    verifiedCid: null,
    designBibleHash: null,
    blogTopic: null,
    researchBrief: {
      summary: "ok",
      entities: [],
      sources: [],
      flags: [],
      raw: null,
    } as unknown as RunContext["researchBrief"],
    seoIntel: null,
    registry: buildRegistry(),
    ...extra,
  } as RunContext;
}

const GMB: GmbProfile = {
  businessName: "STS Electronic Recycling",
  street: "1 Main St",
  zip: "78701",
  phone: "555-1212",
  hours: "Mon-Fri 9-5",
  cid: "cid:123",
  gmbUrl: "https://maps.google.com/?cid=123",
  county: "Travis",
  lat: 30.2,
  lng: -97.7,
};

const HTML = "<html><body>x</body></html>";

describe("shared prompt builders — No-GMB byte-for-byte parity", () => {
  it("build prompt user text matches the legacy Dashboard string exactly", () => {
    const c = ctx();
    const legacy = `Build the page for the following job:\n\n${describeContext(c)}`;
    expect(buildPagePrompt(c).user).toBe(legacy);
  });

  it("audit prompt user text matches the legacy Dashboard string exactly", () => {
    const c = ctx();
    const legacy = `Audit and improve the following page. Return the full corrected HTML.\n\nContext:\n${describeContext(
      c,
    )}\n\nCurrent HTML:\n${HTML}`;
    expect(auditPagePrompt(c, HTML).user).toBe(legacy);
  });

  it("schema prompt user text matches the legacy Dashboard string exactly", () => {
    const c = ctx();
    const legacy = `Generate JSON-LD schema for the following page.\n\nContext:\n${describeContext(
      c,
    )}\n\nPage HTML:\n${HTML}`;
    expect(schemaPrompt(c, HTML).user).toBe(legacy);
  });

  it("No-GMB prompts contain no verified-NAP block", () => {
    const c = ctx();
    expect(buildPagePrompt(c).user.toUpperCase()).not.toContain("VERIFIED GOOGLE BUSINESS");
    expect(schemaPrompt(c, HTML).user.toUpperCase()).not.toContain("VERIFIED GOOGLE BUSINESS");
  });
});

describe("shared prompt builders — GMB-aware branch", () => {
  it("build prompt diverges from No-GMB and carries the real NAP + CID", () => {
    const noGmb = buildPagePrompt(ctx()).user;
    const gmb = buildPagePrompt(ctx({ gmb: GMB })).user;
    expect(gmb).not.toBe(noGmb);
    expect(gmb).toContain("1 Main St");
    expect(gmb).toContain("cid:123");
    expect(gmb).toContain("555-1212");
  });

  it("schema prompt carries the verified GMB block", () => {
    const gmb = schemaPrompt(ctx({ gmb: GMB }), HTML).user;
    expect(gmb).toContain("cid:123");
    expect(gmb).toContain("1 Main St");
  });
});

describe("verify prompt — facility language", () => {
  it("states the current facility size and rejects the obsolete figure", () => {
    const obsoleteFacilitySize = ["600", "000"].join(",");
    for (const c of [ctx(), ctx({ gmb: GMB })]) {
      const { user } = verifyPrompt(c, HTML);
      expect(user).toContain(`CORRECT: "serving ${c.city} from our 200,000 sq ft facility"`);
      expect(user).not.toContain(obsoleteFacilitySize);
    }
  });
});

describe("promptForPhase dispatch", () => {
  it("returns a non-empty prompt for every phase in both modes", () => {
    for (const c of [ctx(), ctx({ gmb: GMB })]) {
      for (const phase of ["build", "audit", "schema", "verify"] as const) {
        const { user } = promptForPhase(phase, c, HTML);
        expect(user.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("reviewed prompt wording", () => {
  it("removes awkward cleanup artifacts without removing compliance guidance", () => {
    const prompts = [pageBuilderPrompt, schemaGeneratorPrompt, seoAuditPrompt];
    const awkwardPhrases = [
      "an certification",
      "an certified",
      "certification certification",
      "certified processing, certified processing",
      "secure data destruction and secure data destruction",
    ];

    expect(
      awkwardPhrases.filter((phrase) =>
        prompts.some((prompt) => prompt.toLowerCase().includes(phrase)),
      ),
    ).toEqual([]);

    for (const requiredGuidance of ["ITAD", "NIST 800-88", "HIPAA"]) {
      expect(prompts.every((prompt) => prompt.includes(requiredGuidance))).toBe(true);
    }
  });

  it("matches the corresponding reviewed bake-off fixture directives", () => {
    const fixture = (name: string) =>
      readFileSync(
        new URL(`../../../../scripts/src/bakeoff/fixtures/master-${name}.txt`, import.meta.url),
        "utf8",
      ).trim();

    const reviewedDirectives = [
      [
        pageBuilderPrompt,
        fixture("page-builder"),
        "a certification claim sitting next to a city name",
      ],
      [
        schemaGeneratorPrompt,
        fixture("schema-generator"),
        "documented data-destruction process supports compliance",
      ],
      [
        seoAuditPrompt,
        fixture("seo-audit"),
        "The figure is under review by the COO, so this is a report, not a correction.",
      ],
    ];

    for (const [prompt, masterFixture, directive] of reviewedDirectives) {
      expect(prompt).toContain(directive);
      expect(masterFixture).toContain(directive);
    }
  });
});
