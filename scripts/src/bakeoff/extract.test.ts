import { describe, expect, it } from "vitest";
import { extractHtmlDocument } from "./extract";
import { ARTIFACT_TO_INLINE } from "./miniPrompts";

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

describe("ARTIFACT_TO_INLINE headless output contract", () => {
  // The verbatim copyPrompt() prompts tell the model to "create an artifact" and
  // "never paste code in chat". Over the API there is no artifact/canvas surface,
  // so a model that obeys literally emits no HTML. ARTIFACT_TO_INLINE is the ONE
  // uniform medium-translation the harness appends to every HTML-yielding turn,
  // applied identically to every model so the comparison stays apples-to-apples.

  it("neutralizes the artifact directive and demands the complete HTML inline", () => {
    expect(ARTIFACT_TO_INLINE).toContain("artifact");
    expect(ARTIFACT_TO_INLINE).toMatch(/COMPLETE, FINAL HTML document INLINE/);
    expect(ARTIFACT_TO_INLINE).toMatch(/<!DOCTYPE html> … <\/html>/);
  });

  it("forbids claiming an artifact is being created instead of emitting HTML", () => {
    expect(ARTIFACT_TO_INLINE).toMatch(/Do NOT\s+\n?\s*say an artifact is being created/);
  });

  it("states it applies to every model identically (no per-model special-casing)", () => {
    expect(ARTIFACT_TO_INLINE).toContain("applies to every model identically");
  });
});
