/**
 * Pull the real HTML document out of a model's raw reply.
 *
 * Models wrap the page in chatter we must strip to compare apples-to-apples:
 *  - Claude prepends a markdown preamble ("I'll execute all phases… ## PHASE 0A").
 *  - Gemini sometimes wraps it in a hallucinated ```xml <tool_call> create_file
 *    block whose `content` field is a JSON-escaped HTML string.
 *  - Any model may fence the page in ```html / ```xml / ```json.
 *
 * Strategy: locate the actual document by its real markers (`<!DOCTYPE`/`<html`)
 * through the closing `</html>`. ONLY when neither real marker is present do we
 * fall back to the page-builder `<!-- PAGE_BUILDER` comment — otherwise a model
 * that echoes that directive at the TOP of its phase narration (Claude does this:
 * `<!-- PAGE_BUILDER_V3` followed by ~39KB of "## PHASE 0A…" prose before the real
 * `<!DOCTYPE html>`) would anchor the slice on the comment and capture all the
 * chatter as if it were the page. If markers aren't found in the raw text, try to
 * unescape a JSON `content` field (the create_file wrapper) and look again. Fail
 * loudly if no document is present rather than storing chatter as if it were a page.
 */

const PRIMARY_MARKERS = ["<!doctype html", "<html"];
const FALLBACK_MARKERS = ["<!-- page_builder", "<!-- page builder"];

function earliestMarker(lower: string, markers: string[]): number {
  let start = -1;
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && (start === -1 || idx < start)) start = idx;
  }
  return start;
}

function sliceDocument(text: string): string | null {
  const lower = text.toLowerCase();
  // Prefer the real document markers; only fall back to the page-builder comment
  // when no real `<!DOCTYPE>`/`<html>` exists, so leading narration is never kept.
  let start = earliestMarker(lower, PRIMARY_MARKERS);
  if (start === -1) start = earliestMarker(lower, FALLBACK_MARKERS);
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

/**
 * Non-throwing variant: return the HTML document if one is present, else null.
 * Used for turns where HTML output is OPTIONAL (seo-verify, verify-links) — the
 * model may only return a report, in which case we keep the prior page rather
 * than failing the run.
 */
export function tryExtractHtmlDocument(raw: string): string | null {
  const direct = sliceDocument(raw);
  if (direct) return direct;
  const unescaped = unescapeJsonContent(raw);
  if (unescaped) {
    const fromJson = sliceDocument(unescaped);
    if (fromJson) return fromJson;
  }
  return null;
}

export function extractHtmlDocument(raw: string, label = "model"): string {
  const doc = tryExtractHtmlDocument(raw);
  if (doc) return doc;

  throw new Error(
    `${label} returned no HTML document (no <!DOCTYPE>/<html>…</html> found). ` +
      `First 200 chars: ${raw.slice(0, 200).replace(/\s+/g, " ")}`,
  );
}
