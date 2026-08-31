import { describe, expect, it } from "vitest";
import { costFromUsage } from "./cost";
import type { TokenUsage } from "./types";

// Focused, network-free coverage of the price-tier SELECTION logic in
// `priceFor` (private) via its only observable surface, `costFromUsage`. Order
// matters in PRICE_TIERS — more specific tags must win over broader family
// catch-alls (e.g. DeepSeek v4 Pro vs. the v4 Flash default, GPT-5.5 Pro vs.
// the generic "…pro" catch-all) — so these assertions pin exactly that.

const usage: TokenUsage = {
  inputTokens: 1_000_000,
  cachedInputTokens: 0,
  outputTokens: 1_000_000,
  reasoningTokens: 0,
};

describe("costFromUsage — price-tier selection", () => {
  it("matches DeepSeek v4 Pro to its own tier, not the v4 Flash default", () => {
    const c = costFromUsage("deepseek-v4-pro", usage);
    expect(c.pricePerMInput).toBe(0.66);
    expect(c.pricePerMOutput).toBe(1.98);
  });

  it("matches DeepSeek v4 Flash to the cheaper flash tier", () => {
    const c = costFromUsage("deepseek-v4-flash", usage);
    expect(c.pricePerMInput).toBe(0.22);
    expect(c.pricePerMOutput).toBe(0.66);
  });

  it("matches Gemini 3.7 Flash to its introductory tier, not the Pro default", () => {
    const c = costFromUsage("gemini-3.7-flash", usage);
    expect(c.pricePerMInput).toBe(0.75);
    expect(c.pricePerMOutput).toBe(3.75);
  });

  it("matches a plain Gemini tag to the Pro tier", () => {
    const c = costFromUsage("gemini-3.1-pro", usage);
    expect(c.pricePerMInput).toBe(2);
    expect(c.pricePerMOutput).toBe(12);
  });

  it("matches GPT-5.5 Pro to its own tier, not the generic pro catch-all", () => {
    const c = costFromUsage("gpt-5.5-pro", usage);
    expect(c.pricePerMInput).toBe(30);
    expect(c.pricePerMOutput).toBe(180);
  });

  it("matches GPT-5.4 Pro to its own (cheaper) tier", () => {
    const c = costFromUsage("gpt-5.4-pro", usage);
    expect(c.pricePerMInput).toBe(5);
    expect(c.pricePerMOutput).toBe(30);
  });

  it("falls back to the generic pro tier for an unversioned pro tag", () => {
    const c = costFromUsage("o3-pro", usage);
    expect(c.pricePerMInput).toBe(30);
    expect(c.pricePerMOutput).toBe(180);
  });

  it("distinguishes Claude Opus from Sonnet", () => {
    expect(costFromUsage("claude-opus-4-8", usage).pricePerMInput).toBe(5);
    expect(costFromUsage("claude-sonnet-5", usage).pricePerMInput).toBe(3);
  });

  it("falls back to the generic tier for an unrecognized model tag", () => {
    const c = costFromUsage("some-unknown-model-x1", usage);
    expect(c.pricePerMInput).toBe(3);
    expect(c.pricePerMOutput).toBe(15);
    expect(c.basis).toContain("generic tier");
  });

  it("bills cached input at the 10% discount", () => {
    const c = costFromUsage("deepseek-v4-pro", {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
      reasoningTokens: 0,
    });
    expect(c.inputUsd).toBeCloseTo(0.66 * 0.1, 4);
  });

  it("labels the basis as Measured, not Estimate", () => {
    const c = costFromUsage("deepseek-v4-flash", usage);
    expect(c.basis).toContain("Measured");
  });
});
