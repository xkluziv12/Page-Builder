import { describe, expect, it } from "vitest";
import { billingsNoGmbContext } from "./cost";
import {
  BILLINGS_GMB,
  generateGmbSchema,
  generateNoGmbSchema,
  gmbContextSuffix,
} from "./gmb";
import {
  HQ_PHONE,
  buildPrompt,
  rebuildPrompt,
  seoPrompt,
  seoVerifyPrompt,
  verifyLinksPrompt,
  verifyLinksFixPrompt,
} from "./miniPrompts";

// The No-GMB backup-phone contract: a No-GMB page falls back to the STS HQ main
// line for call buttons, on-page contact, and the deterministic schema's
// `telephone`, while local address / local-branch phone / CID stay forbidden.
// This contract lives only in prompt text + one schema function, so these tests
// lock it in so a future edit can't silently drop the phone or re-introduce a
// forbidden local field.

describe("generateNoGmbSchema — No-GMB backup-phone contract", () => {
  const schemaJson = generateNoGmbSchema(billingsNoGmbContext());
  const schema = JSON.parse(schemaJson) as Record<string, unknown>;

  it("sets telephone to the STS HQ backup line", () => {
    expect(schema.telephone).toBe("844-699-2913");
    expect(HQ_PHONE).toBe("844-699-2913");
  });

  it("omits a local street address", () => {
    expect(schemaJson).not.toContain("streetAddress");
    const address = schema.address as Record<string, unknown> | undefined;
    expect(address?.streetAddress).toBeUndefined();
  });

  it("omits a postal code", () => {
    expect(schemaJson).not.toContain("postalCode");
    const address = schema.address as Record<string, unknown> | undefined;
    expect(address?.postalCode).toBeUndefined();
  });

  it("omits a CID / identifier", () => {
    expect(schema.identifier).toBeUndefined();
    expect(schemaJson).not.toContain("identifier");
    expect(schemaJson).not.toContain("cid:");
  });

  it("omits hasMap (GMB-only)", () => {
    expect(schema.hasMap).toBeUndefined();
    expect(schemaJson).not.toContain("hasMap");
  });
});

// The symmetric GMB contract: an enriched GMB page DOES carry the local
// PostalAddress (streetAddress + postalCode), the verified CID `identifier`,
// `hasMap`, `geo` coordinates, and its OWN GMB profile phone — never the STS HQ
// backup line that the No-GMB scenario falls back to. These tests lock that in
// so a future edit can't quietly drop a required GMB field or accidentally swap
// in the HQ number.
describe("generateGmbSchema — GMB enriched-field contract", () => {
  const schemaJson = generateGmbSchema(billingsNoGmbContext(), BILLINGS_GMB);
  const schema = JSON.parse(schemaJson) as Record<string, unknown>;
  const address = schema.address as Record<string, unknown> | undefined;

  it("includes the local street address", () => {
    expect(address?.streetAddress).toBe(BILLINGS_GMB.street);
  });

  it("includes the postal code", () => {
    expect(address?.postalCode).toBe(BILLINGS_GMB.zip);
  });

  it("includes the CID identifier", () => {
    expect(schema.identifier).toBe(BILLINGS_GMB.cid);
    expect(schemaJson).toContain("cid:");
  });

  it("includes hasMap", () => {
    expect(schema.hasMap).toBe(BILLINGS_GMB.gmbUrl);
  });

  it("includes geo coordinates", () => {
    expect(schema.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: BILLINGS_GMB.lat,
      longitude: BILLINGS_GMB.lng,
    });
  });

  it("uses the GMB profile phone, NOT the HQ backup line", () => {
    expect(schema.telephone).toBe(BILLINGS_GMB.phone);
    expect(schema.telephone).not.toBe(HQ_PHONE);
  });
});

describe("gmbContextSuffix — enriched-context block", () => {
  const suffix = gmbContextSuffix(BILLINGS_GMB);

  it("carries the explicit page_url + GMB data", () => {
    expect(suffix).toContain(`page_url: ${BILLINGS_GMB.pageUrl}`);
    expect(suffix).toContain(`gmb_url: ${BILLINGS_GMB.gmbUrl}`);
    expect(suffix).toContain(`gmb_cid: ${BILLINGS_GMB.cid}`);
    expect(suffix).toContain("GMB data:");
    expect(suffix).toContain(BILLINGS_GMB.businessName);
    expect(suffix).toContain(BILLINGS_GMB.phone);
  });

  it("labels the block EXPERIMENTAL / illustrative, not verified ground truth", () => {
    expect(suffix).toContain("EXPERIMENTAL");
    expect(suffix).toMatch(/illustrative/i);
    expect(suffix).toMatch(/NOT verified/i);
  });
});

describe("No-GMB prompt strings — backup-phone contract", () => {
  const vars = {
    city: "Billings",
    state: "MT",
    url: "https://www.stselectronicrecyclinginc.com/billings-mt",
    niche: "electronics recycling",
    pageName: "billings-electronics-recycling.html",
    hubSpoke: "",
  };

  const promptCases: Array<[string, string]> = [
    ["build", buildPrompt(vars)],
    ["rebuild", rebuildPrompt(vars, "Hero form on wrong side")],
    ["seo", seoPrompt(vars)],
    ["seo-verify", seoVerifyPrompt(vars)],
    ["verify-links", verifyLinksPrompt()],
    ["verify-links fix", verifyLinksFixPrompt()],
  ];

  // A line carries a prohibition only when a negative/forbidding marker sits on
  // the SAME line as the forbidden thing — so "do NOT invent a local phone" or
  // "❌ A street address" count, but a hypothetical "include a local phone" would
  // not. This is what makes the test enforce the contract rather than keywords.
  const PROHIBIT = /\b(do not|don't|never|no|remove|without|forbid)\b|❌|🚫/i;
  const hasProhibitiveLine = (prompt: string, subject: RegExp): boolean =>
    prompt.split("\n").some((line) => subject.test(line) && PROHIBIT.test(line));

  for (const [name, prompt] of promptCases) {
    describe(`${name} prompt`, () => {
      it("references the STS HQ backup number", () => {
        expect(prompt).toContain(HQ_PHONE);
      });

      it("explicitly prohibits an invented LOCAL phone", () => {
        expect(hasProhibitiveLine(prompt, /local[^\n]*phone/i)).toBe(true);
      });

      it("explicitly prohibits a local street address", () => {
        expect(hasProhibitiveLine(prompt, /street address/i)).toBe(true);
      });
    });
  }
});
