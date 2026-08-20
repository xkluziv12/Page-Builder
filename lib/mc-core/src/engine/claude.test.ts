import { describe, expect, it } from "vitest";
import { extractContent } from "./claude";

describe("extractContent", () => {
  it("pulls the HTML out of a fenced block buried after a report", () => {
    const raw = [
      "| ✅ | Swaps: 8 | Persona: Corporate IT Director |",
      "## JOOMLA META (copy to Article → Publishing)",
      "**Browser Page Title:** Anaheim Electronics Recycling",
      "--- ## OPTIMIZED HTML",
      "```html",
      "<!doctype html><html><head><title>Anaheim</title></head><body><h1>Hi</h1></body></html>",
      "```",
    ].join("\n");
    expect(extractContent(raw)).toBe(
      "<!doctype html><html><head><title>Anaheim</title></head><body><h1>Hi</h1></body></html>",
    );
  });

  it("slices a raw DOCTYPE document that follows prose with no fence", () => {
    const raw =
      "Here is the optimized page, complete from DOCTYPE to closing html.\n" +
      "<!DOCTYPE html>\n<html><body><p>page</p></body></html>\nLet me know if you need edits.";
    expect(extractContent(raw)).toBe(
      "<!DOCTYPE html>\n<html><body><p>page</p></body></html>",
    );
  });

  it("returns bare JSON unchanged when there is no fence or document", () => {
    const raw = '{\n  "@context": "https://schema.org"\n}';
    expect(extractContent(raw)).toBe('{\n  "@context": "https://schema.org"\n}');
  });

  it("extracts the contents of a fully-wrapped json fence", () => {
    const raw = '```json\n{"@type":"LocalBusiness"}\n```';
    expect(extractContent(raw)).toBe('{"@type":"LocalBusiness"}');
  });
});
