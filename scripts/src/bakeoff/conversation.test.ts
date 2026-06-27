import { describe, expect, it } from "vitest";
import {
  SEO_VERDICT_FAIL,
  SEO_VERDICT_PASS,
  assertNotRefusal,
  readVerdict,
} from "./conversation";

// T005 correctness primitives: the routed pipeline's phase validator treats a
// refusal / empty response as invalid (so the backup steps in / the run fails
// loud), and a verification turn with NO ✅/❌ verdict line reads as `null` —
// the trigger for the null-verdict re-verify gate rather than a silent pass.

describe("assertNotRefusal — routed phase validator", () => {
  it("throws on a wrong-model STOP / refusal fixture", () => {
    expect(() =>
      assertNotRefusal("🚫 WRONG MODEL — I cannot proceed. STOP.", "build"),
    ).toThrow(/STOP \/ refusal/i);
  });

  it("throws on an explicit refusal to build", () => {
    expect(() =>
      assertNotRefusal("I will not build this page as requested.", "build"),
    ).toThrow(/STOP \/ refusal/i);
  });

  it("throws on empty / whitespace-only output", () => {
    expect(() => assertNotRefusal("   \n  ", "build")).toThrow(/empty output/i);
  });

  it("does NOT throw on a normal, compliant response", () => {
    expect(() =>
      assertNotRefusal("Understood. Here is the full page:\n<!DOCTYPE html>…", "build"),
    ).not.toThrow();
  });
});

describe("readVerdict — null-verdict gate trigger", () => {
  it("returns null when neither ✅ nor ❌ verdict line is present", () => {
    const raw = "I reviewed the page and it broadly looks fine to me.";
    expect(readVerdict(raw, SEO_VERDICT_PASS, SEO_VERDICT_FAIL)).toBeNull();
  });

  it("reads an explicit PASS verdict", () => {
    expect(
      readVerdict("FINAL VERDICT: SEO VERIFICATION PASSED", SEO_VERDICT_PASS, SEO_VERDICT_FAIL),
    ).toBe("passed");
  });

  it("reads an explicit FAIL verdict", () => {
    expect(
      readVerdict("FINAL VERDICT: SEO VERIFICATION FAILED", SEO_VERDICT_PASS, SEO_VERDICT_FAIL),
    ).toBe("failed");
  });
});
