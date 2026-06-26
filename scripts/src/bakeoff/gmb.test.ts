import { describe, expect, it } from "vitest";
import { billingsNoGmbContext } from "./cost";
import { generateNoGmbSchema } from "./gmb";
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
