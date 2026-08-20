import { describe, expect, it } from "vitest";
import type { RunContext } from "../types";
import { RoutedEngine, runCorrectiveVerify } from "./routed";
import type { PromptCompletionEngine, RoutedRouting } from "./routed";
import { isValidEngineOutput, readVerdict } from "./transport";
import type { EngineResult } from "./types";

const html = (body: string): EngineResult => ({
  content: `<!doctype html><html><head></head><body>${body}</body></html>`,
  raw: `<!doctype html><html><head></head><body>${body}</body></html>`,
});

describe("isValidEngineOutput (routed validator)", () => {
  it("rejects an empty response", () => {
    expect(isValidEngineOutput({ content: "", raw: "" }, "html")).toBe(false);
    expect(isValidEngineOutput({ content: "   ", raw: "   " }, "html")).toBe(false);
  });

  it("rejects a refusal / wrong-model STOP", () => {
    const refusal = "🚫 WRONG MODEL — I cannot proceed with this build.";
    expect(isValidEngineOutput({ content: refusal, raw: refusal }, "html")).toBe(false);
  });

  it("rejects HTML output that is missing an actual document", () => {
    const prose = "Here is a summary of what I would build, but no document.";
    expect(isValidEngineOutput({ content: prose, raw: prose }, "html")).toBe(false);
  });

  it("accepts a real HTML document", () => {
    expect(isValidEngineOutput(html("<h1>Austin</h1>"), "html")).toBe(true);
  });

  it("rejects invalid JSON-LD and accepts valid JSON-LD", () => {
    const bad = "not json at all";
    expect(isValidEngineOutput({ content: bad, raw: bad }, "json")).toBe(false);
    const good = '{"@context":"https://schema.org","@type":"LocalBusiness","name":"STS"}';
    expect(isValidEngineOutput({ content: good, raw: good }, "json")).toBe(true);
  });
});

describe("readVerdict", () => {
  it("returns null when no verdict marker is present", () => {
    expect(readVerdict("Looks fine to me.")).toBeNull();
  });

  it("reads a ✅ VERIFIED pass and a ❌ FAILED fail, last match wins", () => {
    expect(readVerdict("✅ VERIFIED — Proceed to publish")).toBe("passed");
    expect(readVerdict("❌ FAILED — broken link")).toBe("failed");
    // A quoted rubric line followed by the real verdict: the later marker wins.
    expect(
      readVerdict("Rubric: emit ❌ FAILED if broken.\nFinal: ✅ VERIFIED — Proceed to publish"),
    ).toBe("passed");
  });
});

describe("runCorrectiveVerify", () => {
  it("returns the verified HTML once an explicit ✅ verdict is reached", async () => {
    let calls = 0;
    const verify = async (): Promise<EngineResult> => {
      calls++;
      return { content: "", raw: "✅ VERIFIED — Proceed to publish" };
    };
    const out = await runCorrectiveVerify(verify, html("<h1>ok</h1>").content, 1);
    expect(out.content).toContain("<h1>ok</h1>");
    expect(calls).toBe(1);
  });

  it("fails loud when the verdict is always ❌ FAILED after the corrective cap", async () => {
    let calls = 0;
    const verify = async (): Promise<EngineResult> => {
      calls++;
      return { content: "", raw: "❌ FAILED — still broken" };
    };
    await expect(runCorrectiveVerify(verify, html("<h1>x</h1>").content, 1)).rejects.toThrow(
      /did not reach an explicit ✅ VERIFIED verdict/,
    );
    // total turns = corrections + 1
    expect(calls).toBe(2);
  });

  it("fails loud when no clear verdict (null) is ever emitted", async () => {
    const verify = async (): Promise<EngineResult> => ({
      content: "",
      raw: "I looked it over and it seems generally okay.",
    });
    await expect(runCorrectiveVerify(verify, html("<h1>x</h1>").content, 1)).rejects.toThrow(
      /no ✅\/❌ line emitted/,
    );
  });

  it("adopts re-emitted fixed HTML from the verify turn before passing", async () => {
    let calls = 0;
    const verify = async (current: string): Promise<EngineResult> => {
      calls++;
      if (calls === 1) {
        // First turn fails but returns a corrected document.
        return { content: html("<h1>fixed</h1>").content, raw: "❌ FAILED — fixing now" };
      }
      // Second turn verifies the corrected document.
      expect(current).toContain("<h1>fixed</h1>");
      return { content: "", raw: "✅ VERIFIED — Proceed to publish" };
    };
    const out = await runCorrectiveVerify(verify, html("<h1>orig</h1>").content, 1);
    expect(out.content).toContain("<h1>fixed</h1>");
    expect(calls).toBe(2);
  });
});

/** A minimal stub engine; only the methods a phase touches need to be present. */
function stubEngine(name: string, overrides: Partial<PromptCompletionEngine>): PromptCompletionEngine {
  const okHtml = html("<h1>page</h1>");
  return {
    name,
    buildPage: async () => okHtml,
    auditPage: async () => okHtml,
    generateSchema: async () => okHtml,
    chatEdit: async () => okHtml,
    verifyPage: async () => ({ content: "", raw: "✅ VERIFIED — Proceed to publish" }),
    ...overrides,
  } as unknown as PromptCompletionEngine;
}

describe("RoutedEngine verify routing", () => {
  it("treats a null verify verdict as invalid and falls back main→backup", async () => {
    const counts = { main: 0, backup: 0 };
    const audit = stubEngine("audit", {});
    const verifyMain = stubEngine("v-main", {
      verifyPage: async () => {
        counts.main++;
        return { content: "", raw: "I looked it over, seems fine." }; // null verdict
      },
    });
    const verifyBackup = stubEngine("v-backup", {
      verifyPage: async () => {
        counts.backup++;
        return { content: "", raw: "✅ VERIFIED — Proceed to publish" };
      },
    });
    const routing: RoutedRouting = {
      build: { main: audit },
      audit: { main: audit },
      schema: { main: audit },
      verify: { main: verifyMain, backup: verifyBackup },
      chat: { main: audit },
    };
    const engine = new RoutedEngine({ routing, maxAttempts: 1, verifyCorrections: 0 });
    const out = await engine.auditPage({} as RunContext, html("<h1>page</h1>").content);
    expect(out.content).toContain("<h1>page</h1>");
    // Null verdict on main → invalid → immediate fallback to the passing backup.
    expect(counts.main).toBe(1);
    expect(counts.backup).toBe(1);
  });
});
