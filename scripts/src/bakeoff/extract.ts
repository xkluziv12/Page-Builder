/**
 * Pull the real HTML document out of a model's raw reply.
 *
 * Models wrap the page in chatter we must strip to compare apples-to-apples:
 *  - Claude prepends a markdown preamble ("I'll execute all phases… ## PHASE 0A").
 *  - Gemini sometimes wraps it in a hallucinated ```xml <tool_call> create_file
 *    block whose `content` field is a JSON-escaped HTML string.
 *  - Any model may fence the page in ```html / ```xml / ```json.
 *
 * Strategy: locate the actual document by its markers (`<!DOCTYPE`, `<html`, or
 * the page-builder `<!-- PAGE_BUILDER` comment) through the closing `</html>`.
 * If markers aren't found in the raw text, try to unescape a JSON `content`
 * field (the create_file wrapper) and look again. Fail loudly if no document is
 * present rather than storing chatter as if it were a page.
 */

const START_MARKERS = ["<!doctype html", "<html", "<!-- page_builder", "<!-- page builder"];

function sliceDocument(text: string): string | null {
  const lower = text.toLowerCase();
  let start = -1;
  for (const marker of START_MARKERS) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && (start === -1 || idx < start)) start = idx;
  }
  if (start === -1) return null;
  const end = lower.lastIndexOf("</html>");
  if (end === -1 || end <= start) return null;
  return text.slice(start, end + "</html>".length).trim();
}

/** Try to unescape a JSON `"content": "<...>"` field (create_file tool wrappers). */
function unescapeJsonContent(text: string): string | null {
  const match = text.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!match || !match[1]) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return null;
  }
}

export function extractHtmlDocument(raw: string, label = "model"): string {
  const direct = sliceDocument(raw);
  if (direct) return direct;

  const unescaped = unescapeJsonContent(raw);
  if (unescaped) {
    const fromJson = sliceDocument(unescaped);
    if (fromJson) return fromJson;
  }

  throw new Error(
    `${label} returned no HTML document (no <!DOCTYPE>/<html>…</html> found). ` +
      `First 200 chars: ${raw.slice(0, 200).replace(/\s+/g, " ")}`,
  );
}
