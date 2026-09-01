import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROUNDING_AUTHOR,
  GROUNDING_AUTHORS,
  assertGroundingCredential,
  resolveGroundingAuthor,
} from "./groundingAuthor";
import { groundingSourceLabel } from "./grounding";

// Network-free coverage of shared-grounding author SELECTION. The harness used
// to hard-wire the author to Claude, so a first run against a new target died
// before any model cell whenever ANTHROPIC_API_KEY was absent. These tests pin
// the three properties that replacement has to keep: the historical default is
// unchanged, a bad selection fails loud, and no credential is touched until the
// grounding is actually authored.

const CLAUDE_TAG = "claude-sonnet-5";

describe("resolveGroundingAuthor — default", () => {
  it("reproduces the historical Claude author when nothing is set", () => {
    const a = resolveGroundingAuthor({}, CLAUDE_TAG);
    expect(a.key).toBe(DEFAULT_GROUNDING_AUTHOR);
    expect(a.provider).toBe("Anthropic");
    expect(a.model).toBe(CLAUDE_TAG);
    expect(a.credentialEnv).toBe("ANTHROPIC_API_KEY");
    expect(a.isDefault).toBe(true);
  });

  it("uses the caller's model tag for the default author, not a second copy of it", () => {
    expect(resolveGroundingAuthor({}, "claude-sonnet-5-future").model).toBe("claude-sonnet-5-future");
  });

  it("treats an empty/whitespace provider as unset rather than as an error", () => {
    expect(resolveGroundingAuthor({ BAKEOFF_GROUNDING_PROVIDER: "   " }, CLAUDE_TAG).key).toBe(
      DEFAULT_GROUNDING_AUTHOR,
    );
  });
});

describe("resolveGroundingAuthor — explicit selection", () => {
  it("selects Gemini on the direct GEMINI_API_KEY", () => {
    const a = resolveGroundingAuthor({
      BAKEOFF_GROUNDING_PROVIDER: "google",
      BAKEOFF_GROUNDING_MODEL: "gemini-3.7-flash",
    });
    expect(a.key).toBe("google");
    expect(a.provider).toBe("Google");
    expect(a.model).toBe("gemini-3.7-flash");
    expect(a.credentialEnv).toBe("GEMINI_API_KEY");
    expect(a.isDefault).toBe(false);
  });

  it("accepts a provider token in any case", () => {
    expect(resolveGroundingAuthor({ BAKEOFF_GROUNDING_PROVIDER: "Google" }).key).toBe("google");
  });

  it("falls back to the provider's own default tag when no model is named", () => {
    expect(resolveGroundingAuthor({ BAKEOFF_GROUNDING_PROVIDER: "google" }).model).toBe(
      GROUNDING_AUTHORS.google.defaultModel,
    );
  });

  it("ignores the caller's Claude tag once another provider is named", () => {
    expect(resolveGroundingAuthor({ BAKEOFF_GROUNDING_PROVIDER: "xai" }, CLAUDE_TAG).model).not.toBe(
      CLAUDE_TAG,
    );
  });

  it("exposes every author as a direct-key provider", () => {
    for (const [key, option] of Object.entries(GROUNDING_AUTHORS)) {
      expect(option.credentialEnv, key).toMatch(/\S/);
      expect(option.defaultModel, key).toMatch(/\S/);
    }
  });
});

describe("resolveGroundingAuthor — invalid selection fails loud", () => {
  it("rejects an unknown provider instead of falling back to the default", () => {
    expect(() => resolveGroundingAuthor({ BAKEOFF_GROUNDING_PROVIDER: "openrouter" })).toThrow(
      /not a known shared-grounding author/i,
    );
  });

  it("lists the known providers in the error", () => {
    expect(() => resolveGroundingAuthor({ BAKEOFF_GROUNDING_PROVIDER: "nope" })).toThrow(/google/);
  });

  it("rejects a model tag with no provider, which would dispatch it to the wrong adapter", () => {
    expect(() => resolveGroundingAuthor({ BAKEOFF_GROUNDING_MODEL: "gemini-3.7-flash" })).toThrow(
      /BAKEOFF_GROUNDING_PROVIDER/,
    );
  });
});

describe("credential isolation", () => {
  it("does not read any credential while resolving the selection", () => {
    // No provider key of any kind in this env, yet resolution succeeds: startup
    // must never abort on a credential the run may not even need.
    expect(() =>
      resolveGroundingAuthor({ BAKEOFF_GROUNDING_PROVIDER: "google" }),
    ).not.toThrow();
  });

  it("does not care about an UNRELATED provider's missing credential", () => {
    const a = resolveGroundingAuthor(
      { BAKEOFF_GROUNDING_PROVIDER: "google", GEMINI_API_KEY: "present" },
      CLAUDE_TAG,
    );
    // ANTHROPIC_API_KEY / OPENAI_API_KEY / XAI_API_KEY are all absent here.
    expect(() => assertGroundingCredential({ GEMINI_API_KEY: "present" }, GROUNDING_AUTHORS.google, a.model))
      .not.toThrow();
  });

  it("fails loud, naming the variable, when the SELECTED author's key is missing", () => {
    expect(() => assertGroundingCredential({}, GROUNDING_AUTHORS.google, "gemini-3.7-flash")).toThrow(
      /GEMINI_API_KEY is not set/,
    );
  });

  it("treats a blank credential as missing", () => {
    expect(() =>
      assertGroundingCredential({ ANTHROPIC_API_KEY: "  " }, GROUNDING_AUTHORS.anthropic, CLAUDE_TAG),
    ).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it("says it will not silently substitute another provider", () => {
    expect(() => assertGroundingCredential({}, GROUNDING_AUTHORS.google, "gemini-3.7-flash")).toThrow(
      /will not fall back/i,
    );
  });

  it("surfaces the missing credential through make(), not at resolve time", () => {
    const a = resolveGroundingAuthor({ BAKEOFF_GROUNDING_PROVIDER: "google" });
    expect(() => a.make()).toThrow(/GEMINI_API_KEY is not set/);
  });
});

describe("provenance labelling", () => {
  it("keeps the bare historical source string when no author is supplied", () => {
    expect(groundingSourceLabel()).toBe("model-knowledge (shared)");
    expect(groundingSourceLabel(null)).toBe("model-knowledge (shared)");
  });

  it("records the chosen provider and model", () => {
    const a = resolveGroundingAuthor({
      BAKEOFF_GROUNDING_PROVIDER: "google",
      BAKEOFF_GROUNDING_MODEL: "gemini-3.7-flash",
    });
    expect(groundingSourceLabel(a)).toBe(
      "model-knowledge (shared; authored by Google gemini-3.7-flash)",
    );
  });

  it("still marks the brief as shared, so the transparency record reads the same way", () => {
    const a = resolveGroundingAuthor({}, CLAUDE_TAG);
    expect(groundingSourceLabel(a)).toContain("model-knowledge (shared");
    expect(groundingSourceLabel(a)).toContain("Anthropic claude-sonnet-5");
  });
});
