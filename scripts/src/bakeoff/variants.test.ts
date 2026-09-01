import { describe, expect, it } from "vitest";
import {
  baseIdOf,
  effortCapability,
  parseVariantEnv,
  resolveVariants,
  variantId,
  type BaseModelSpec,
} from "./variants";

/**
 * Variant identity + effort-capability rules. These decide whether a run can
 * record a low and a medium cell for the same model without one silently
 * overwriting the other, and whether a provider with NO effort knob can ever be
 * reported as a low/medium tier. Pure logic — no network, no credentials.
 */

const BASES: BaseModelSpec[] = [
  { id: "claude", label: "Claude Sonnet 5", provider: "Anthropic", model: "claude-sonnet-5" },
  { id: "gemini", label: "Gemini 3.1 Pro", provider: "Google", model: "gemini-3.1-pro-preview" },
  { id: "gemini-flash", label: "Gemini 3.7 Flash", provider: "Google", model: "gemini-3.7-flash" },
  { id: "openai", label: "GPT-5.6 Luna", provider: "OpenAI", model: "gpt-5.6-luna" },
  { id: "openai-terra", label: "GPT-5.6 Terra", provider: "OpenAI", model: "gpt-5.6-terra" },
  { id: "grok", label: "Grok 4.6", provider: "xAI", model: "grok-4.6" },
  { id: "deepseek", label: "DeepSeek v4 Pro", provider: "DeepSeek", model: "deepseek-v4-pro" },
];

describe("variant ids", () => {
  it("leaves a control cell on the bare base id so legacy results keep resuming", () => {
    expect(variantId("gemini-flash")).toBe("gemini-flash");
    expect(variantId("gemini-flash", null)).toBe("gemini-flash");
    expect(baseIdOf("gemini-flash")).toBe("gemini-flash");
  });

  it("suffixes an effort cell and round-trips back to the base id", () => {
    expect(variantId("gemini-flash", "low")).toBe("gemini-flash.low");
    expect(baseIdOf("gemini-flash.low")).toBe("gemini-flash");
    expect(baseIdOf("gemini.medium")).toBe("gemini");
  });
});

describe("effortCapability", () => {
  it("reports a real low/medium/high knob for Anthropic and Google", () => {
    for (const [provider, tag] of [
      ["Anthropic", "claude-sonnet-5"],
      ["Google", "gemini-3.7-flash"],
    ] as const) {
      const cap = effortCapability(provider, tag);
      expect(cap.supported).toBe(true);
      expect(cap.levels).toContain("low");
      expect(cap.levels).toContain("medium");
      expect(cap.defaultEffort).toBe("provider-default");
    }
  });

  it("excludes 'low' on the OpenAI reasoning tier (the API rejects it)", () => {
    const cap = effortCapability("OpenAI", "gpt-5.6-luna");
    expect(cap.supported).toBe(true);
    expect(cap.levels).toEqual(["medium", "high", "xhigh"]);
    expect(cap.levels).not.toContain("low");
  });

  it("reports a non-reasoning OpenAI tag as not-applicable, not as an effort tier", () => {
    const cap = effortCapability("OpenAI", "gpt-5.6-terra");
    expect(cap.supported).toBe(false);
    expect(cap.defaultEffort).toBe("not-applicable");
  });

  it("reports xAI and DeepSeek as having no effort control at all", () => {
    for (const provider of ["xAI", "DeepSeek"]) {
      const cap = effortCapability(provider, "any-tag");
      expect(cap.supported).toBe(false);
      expect(cap.levels).toEqual([]);
      expect(cap.defaultEffort).toBe("not-supported");
    }
  });
});

describe("resolveVariants — low and medium coexist", () => {
  it("keeps a low and a medium cell as two independent, differently-keyed results", () => {
    const resolved = resolveVariants(BASES, [
      { baseId: "gemini-flash", effort: "low" },
      { baseId: "gemini-flash", effort: "medium" },
    ]);
    expect(resolved.map((v) => v.id)).toEqual(["gemini-flash.low", "gemini-flash.medium"]);
    // Same slot and same provider tag — only the effort differs.
    expect(new Set(resolved.map((v) => v.baseId))).toEqual(new Set(["gemini-flash"]));
    expect(new Set(resolved.map((v) => v.model))).toEqual(new Set(["gemini-3.7-flash"]));
    expect(resolved.map((v) => v.effort)).toEqual(["low", "medium"]);
    expect(resolved.map((v) => v.effortArg)).toEqual(["low", "medium"]);
    expect(resolved.every((v) => v.effortSupported)).toBe(true);
  });

  it("records a control cell's effort provenance so it cannot read as a tier", () => {
    const [grok, deepseek] = resolveVariants(BASES, [
      { baseId: "grok" },
      { baseId: "deepseek" },
    ]);
    for (const v of [grok!, deepseek!]) {
      expect(v.id).toBe(v.baseId); // no effort suffix invented
      expect(v.effort).toBe("not-supported");
      expect(v.effortRequested).toBeNull();
      expect(v.effortSupported).toBe(false);
      expect(v.effortArg).toBeUndefined(); // no knob is sent to the provider
    }
  });
});

describe("resolveVariants — fails loud instead of faking an effort", () => {
  it("rejects an effort on a provider with no effort control", () => {
    expect(() => resolveVariants(BASES, [{ baseId: "grok", effort: "low" }])).toThrow(
      /no effort\/reasoning-budget knob/i,
    );
    expect(() => resolveVariants(BASES, [{ baseId: "deepseek", effort: "medium" }])).toThrow(
      /no effort\/reasoning-budget knob/i,
    );
  });

  it("rejects 'low' on the OpenAI reasoning tier before any API call is made", () => {
    expect(() => resolveVariants(BASES, [{ baseId: "openai", effort: "low" }])).toThrow(
      /does not accept/i,
    );
  });

  it("rejects an effort on a non-reasoning OpenAI tag", () => {
    expect(() => resolveVariants(BASES, [{ baseId: "openai-terra", effort: "medium" }])).toThrow(
      /not on the reasoning-effort-gated tier/i,
    );
  });

  it("rejects two cells that would collide on one result id", () => {
    expect(() =>
      resolveVariants(BASES, [{ baseId: "grok" }, { baseId: "grok" }]),
    ).toThrow(/same result id/i);
  });

  it("rejects two cells that send the provider an identical request", () => {
    // openai (unasked) already resolves to an explicit medium on the reasoning
    // tier, so an extra explicit "medium" cell would be the SAME request twice.
    expect(() =>
      resolveVariants(BASES, [
        { baseId: "openai", id: "openai" },
        { baseId: "openai", effort: effortCapability("OpenAI", "gpt-5.6-luna").defaultEffort },
      ]),
    ).toThrow(/IDENTICAL request/i);
  });

  it("rejects an unknown model slot rather than silently dropping the cell", () => {
    expect(() => resolveVariants(BASES, [{ baseId: "nope" }])).toThrow(/unknown model id/i);
  });
});

describe("resolveVariants — legacy single-cell behaviour is unchanged", () => {
  it("pins ids to the base id when the caller supplies them (the pre-variant path)", () => {
    const resolved = resolveVariants(
      BASES,
      BASES.map((b) => ({ baseId: b.id, id: b.id })),
    );
    expect(resolved.map((v) => v.id)).toEqual(BASES.map((b) => b.id));
    expect(resolved.every((v) => v.effortRequested === null)).toBe(true);
  });

  it("still honours a model-tag override without changing the recorded id", () => {
    const [v] = resolveVariants(BASES, [
      { baseId: "grok", id: "grok", model: "grok-4.20-0309-reasoning", label: "Grok 4.20 Reasoning" },
    ]);
    expect(v!.id).toBe("grok");
    expect(v!.model).toBe("grok-4.20-0309-reasoning");
    expect(v!.label).toBe("Grok 4.20 Reasoning");
  });
});

describe("parseVariantEnv", () => {
  it("returns an empty matrix when unset", () => {
    expect(parseVariantEnv(undefined)).toEqual([]);
    expect(parseVariantEnv("  ")).toEqual([]);
  });

  it("parses a matrix", () => {
    expect(
      parseVariantEnv('[{"baseId":"gemini","effort":"low"},{"baseId":"gemini","effort":"medium"}]'),
    ).toEqual([
      { baseId: "gemini", effort: "low", model: undefined, label: undefined, id: undefined },
      { baseId: "gemini", effort: "medium", model: undefined, label: undefined, id: undefined },
    ]);
  });

  it("fails loud rather than running a smaller matrix than requested", () => {
    expect(() => parseVariantEnv("{oops")).toThrow(/not valid JSON/i);
    expect(() => parseVariantEnv('{"baseId":"gemini"}')).toThrow(/must be a JSON ARRAY/i);
    expect(() => parseVariantEnv('[{"effort":"low"}]')).toThrow(/baseId must be a non-empty string/i);
    expect(() => parseVariantEnv('[{"baseId":"gemini","effort":3}]')).toThrow(/must be a string/i);
  });
});
