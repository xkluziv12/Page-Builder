import { describe, expect, it } from "vitest";
import type { EngineResult, RunContext } from "@workspace/mc-core";
import { extractHtmlDocument } from "./extract";
import { GenericLlmEngine } from "./engine";
import type { CompleteFn } from "./providers";

describe("extractHtmlDocument", () => {
  it("extracts a real <!DOCTYPE html>…</html> document", () => {
    const raw =
      "<!DOCTYPE html>\n<html><head><title>Austin</title></head><body><h1>Hi</h1></body></html>";
    expect(extractHtmlDocument(raw)).toBe(raw);
  });

  it("strips leading narration before the document", () => {
    const raw =
      "I'll execute all phases now.\n\n## PHASE 0A — analysis\nHere is the page:\n\n" +
      "<!doctype html><html><body><p>page</p></body></html>\n\nLet me know if you need edits.";
    expect(extractHtmlDocument(raw)).toBe(
      "<!doctype html><html><body><p>page</p></body></html>",
    );
  });

  it("anchors on the real document even when narration echoes the PAGE_BUILDER comment first", () => {
    const raw =
      "<!-- PAGE_BUILDER_V3 -->\n## PHASE 0A — lots of prose narration here\n" +
      "blah blah checklist blah\n\n" +
      "<!DOCTYPE html><html><body><main>real page</main></body></html>";
    expect(extractHtmlDocument(raw)).toBe(
      "<!DOCTYPE html><html><body><main>real page</main></body></html>",
    );
  });

  it("throws on a narration-only response (never returns chatter as a page)", () => {
    const raw =
      "I'll execute all phases. ## EXECUTION CHECKLIST\n- [x] Research\n- [x] Build\n" +
      "Here is a summary of what I did. No document follows.";
    expect(() => extractHtmlDocument(raw, "gemini build")).toThrow(
      /gemini build returned no HTML document/,
    );
  });

  it("throws on a checklist-only response with no document", () => {
    const raw =
      "## PHASE 3 OUTPUT\n| ✅ | Swaps: 8 | Persona: Corporate IT Director |\n" +
      "I will now present the files using present_files.";
    expect(() => extractHtmlDocument(raw)).toThrow(/returned no HTML document/);
  });

  it("unescapes a JSON content create_file wrapper and extracts the document", () => {
    // Gemini's create_file wrapper unicode-escapes `<` as \u003c, so the raw text
    // has no literal document markers — extraction must JSON-unescape the content
    // field before it can find (and return) the real document.
    const inner = '<!DOCTYPE html>\n<html><body><p>wrapped "quoted" page</p></body></html>';
    const escapedContent = JSON.stringify(inner).replace(/</g, "\\u003c");
    expect(escapedContent).not.toContain("<");
    const raw =
      '```xml\n<tool_call>\n{"name": "create_file", "arguments": {"path": "index.html", "content": ' +
      escapedContent +
      "}}\n</tool_call>\n```";
    expect(extractHtmlDocument(raw)).toBe(inner);
  });
});

function makeContext(): RunContext {
  return {
    city: "Austin",
    state: "TX",
    track: "page",
    classification: "NEW_BUILD",
    competition: "MEDIUM",
    pageType: "SPOKE",
    niche: "electronics recycling",
    existingUrls: [],
    handoff: null,
    verifiedCid: null,
    designBibleHash: null,
    blogTopic: null,
    researchBrief: null,
    seoIntel: null,
    registry: {
      baseDomain: "stselectronicrecyclinginc.com",
      sacredLinks: [],
      imageLibrary: [],
      industryLinks: [],
      allowlist: [],
      handoffUrls: [],
      existingUrls: [],
      wordCountFloor: 800,
    },
  };
}

const VALID_DOC = "<!DOCTYPE html><html><body><p>page</p></body></html>";

/** A CompleteFn that records every (system, user) pair it is handed. */
function recordingComplete(): { fn: CompleteFn; calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = [];
  const fn: CompleteFn = async (system, user) => {
    calls.push({ system, user });
    return { content: VALID_DOC, raw: VALID_DOC } satisfies EngineResult;
  };
  return { fn, calls };
}

const CONTRACT_MARKER = "HEADLESS OUTPUT CONTRACT";

/**
 * Return the contract suffix (from the marker to end of message). Fails the test
 * if the marker is absent rather than silently returning a tail slice — a bare
 * `indexOf` returns -1 and `.slice(-1)` would yield the last character, letting a
 * "contract missing" regression pass undetected.
 */
function contractSuffix(user: string): string {
  const idx = user.indexOf(CONTRACT_MARKER);
  expect(idx).toBeGreaterThanOrEqual(0);
  return user.slice(idx);
}

describe("GenericLlmEngine headless output contract", () => {
  it("appends the identical headless contract to every model's build message", async () => {
    const ctx = makeContext();
    const a = recordingComplete();
    const b = recordingComplete();
    const engineA = new GenericLlmEngine("claude", a.fn);
    const engineB = new GenericLlmEngine("gemini", b.fn);

    await engineA.buildPage(ctx);
    await engineB.buildPage(ctx);

    const suffixA = contractSuffix(a.calls[0]!.user);
    const suffixB = contractSuffix(b.calls[0]!.user);
    expect(suffixA).toBe(suffixB);
  });

  it("appends the identical headless contract to every model's audit message", async () => {
    const ctx = makeContext();
    const a = recordingComplete();
    const b = recordingComplete();
    const engineA = new GenericLlmEngine("openai", a.fn);
    const engineB = new GenericLlmEngine("grok", b.fn);

    await engineA.auditPage(ctx, VALID_DOC);
    await engineB.auditPage(ctx, VALID_DOC);

    const suffixA = contractSuffix(a.calls[0]!.user);
    const suffixB = contractSuffix(b.calls[0]!.user);
    expect(suffixA).toBe(suffixB);
  });

  it("appends the same contract regardless of a per-model buildUser mini prompt", async () => {
    const ctx = makeContext();
    const generic = recordingComplete();
    const custom = recordingComplete();
    const genericEngine = new GenericLlmEngine("claude", generic.fn);
    const customEngine = new GenericLlmEngine("gemini", custom.fn, {
      buildUser: (_ctx, context) => `MINI PROMPT WRAPPER\n${context}`,
    });

    await genericEngine.buildPage(ctx);
    await customEngine.buildPage(ctx);

    expect(contractSuffix(generic.calls[0]!.user)).toBe(contractSuffix(custom.calls[0]!.user));
  });

  it("would fail loudly if a message were missing the contract (negative control)", () => {
    // Proves contractSuffix is a real guard: a base message with no marker must
    // make the assertion throw, not silently pass via a `.slice(-1)` tail.
    expect(() => contractSuffix("Build the page for the following job:\n...no contract...")).toThrow();
  });

  it("uses the headless contract to deliver build output without any network call", async () => {
    const ctx = makeContext();
    const { fn } = recordingComplete();
    const engine = new GenericLlmEngine("claude", fn);
    const result = await engine.buildPage(ctx);
    expect(result.content).toBe(VALID_DOC);
  });
});
