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
    expect(c.pricePerMCachedInput).toBe(0.075);
  });

  it("matches Gemini 3.1 Pro to its standard tier", () => {
    const c = costFromUsage("gemini-3.1-pro-preview", usage);
    expect(c.pricePerMInput).toBe(2);
    expect(c.pricePerMOutput).toBe(12);
    expect(c.pricePerMCachedInput).toBe(0.2);
  });

  it("uses the model-specific GPT-5.6 prices", () => {
    const luna = costFromUsage("gpt-5.6-luna", usage);
    expect(luna.pricePerMInput).toBe(0.2);
    expect(luna.pricePerMCachedInput).toBe(0.02);
    expect(luna.pricePerMOutput).toBe(1.2);

    const terra = costFromUsage("gpt-5.6-terra", usage);
    expect(terra.pricePerMInput).toBe(2);
    expect(terra.pricePerMCachedInput).toBe(0.2);
    expect(terra.pricePerMOutput).toBe(12);
  });

  it("uses model-specific Grok prices", () => {
    const grok46 = costFromUsage("grok-4.6", usage);
    expect(grok46.pricePerMInput).toBe(2);
    expect(grok46.pricePerMCachedInput).toBe(0.5);
    expect(grok46.pricePerMOutput).toBe(6);

    const grok420 = costFromUsage("grok-4.20-0309-reasoning", usage);
    expect(grok420.pricePerMInput).toBe(1.25);
    expect(grok420.pricePerMCachedInput).toBe(0.2);
    expect(grok420.pricePerMOutput).toBe(2.5);
  });

  it("applies long-context rates per request, not to the aggregate", () => {
    const c = costFromUsage("grok-4.6", {
      inputTokens: 300_000,
      cachedInputTokens: 100_000,
      outputTokens: 10_000,
      reasoningTokens: 0,
      turns: [
        { inputTokens: 100_000, cachedInputTokens: 50_000, outputTokens: 5_000 },
        { inputTokens: 200_000, cachedInputTokens: 50_000, outputTokens: 5_000 },
      ],
    });
    expect(c.totalUsd).toBeCloseTo(0.865, 4);
    expect(c.basis).toContain("1 turn(s) crossed 200,000");
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
    expect(costFromUsage("claude-sonnet-5", usage).pricePerMInput).toBe(2);
    expect(costFromUsage("claude-sonnet-5", usage).pricePerMOutput).toBe(10);
    expect(costFromUsage("claude-sonnet-4-6", usage).pricePerMInput).toBe(3);
    expect(costFromUsage("claude-sonnet-4-6", usage).pricePerMOutput).toBe(15);
  });

  it("falls back to the generic tier for an unrecognized model tag", () => {
    const c = costFromUsage("some-unknown-model-x1", usage);
    expect(c.pricePerMInput).toBe(3);
    expect(c.pricePerMOutput).toBe(15);
    expect(c.basis).toContain("generic tier");
  });

  it("bills cached input at the provider-published cache-hit rate", () => {
    const c = costFromUsage("deepseek-v4-pro", {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
      reasoningTokens: 0,
    });
    expect(c.inputUsd).toBeCloseTo(0.022, 4);
    expect(c.pricePerMCachedInput).toBe(0.022);
  });

  it("labels the basis as Measured, not Estimate", () => {
    const c = costFromUsage("deepseek-v4-flash", usage);
    expect(c.basis).toContain("Measured");
  });
});
