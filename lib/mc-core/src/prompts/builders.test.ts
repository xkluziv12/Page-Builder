import { describe, expect, it } from "vitest";
import { buildRegistry } from "../registry";
import { describeContext } from "../engine/context";
import type { GmbProfile, RunContext } from "../types";
import { auditPagePrompt, buildPagePrompt, promptForPhase, schemaPrompt } from "./builders";

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
