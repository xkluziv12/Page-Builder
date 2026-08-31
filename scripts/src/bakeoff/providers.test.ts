import { describe, expect, it } from "vitest";
import { enforceLiveFetch } from "./providers";

// Focused, network-free coverage of the mandatory-live-search gate shared by
// every provider adapter (`enforceLiveFetch`): when a turn REQUESTED web
// search but the provider produced no evidence of actually calling its
// native search tool, the turn must fail loud rather than silently pass on
// training-recall content. This is exactly the gate DeepSeek's adapter relies
// on (it has no native search tool at all, so it always calls this with
// searched=false on a flagged turn).

describe("enforceLiveFetch — mandatory live-search gate", () => {
  it("does nothing when the turn did not request search", () => {
    expect(() => enforceLiveFetch("model-x", undefined, false, 0)).not.toThrow();
    expect(() => enforceLiveFetch("model-x", false, false, 0)).not.toThrow();
  });

  it("does nothing when search was requested and evidence was produced", () => {
    expect(() => enforceLiveFetch("model-x", true, true, 3)).not.toThrow();
  });

  it("fails loud when search was requested but no evidence was produced", () => {
    expect(() => enforceLiveFetch("model-x", true, false, 0)).toThrow(
      /mandatory/i,
    );
  });

  it("fails loud for a provider with no native search tool (DeepSeek's case)", () => {
    expect(() => enforceLiveFetch("deepseek-v4-pro", true, false, 0)).toThrow(
      /deepseek-v4-pro/,
    );
  });

  it("names the model in the thrown error", () => {
    expect(() => enforceLiveFetch("some-model-tag", true, false, 0)).toThrow(
      /some-model-tag/,
    );
  });
});
