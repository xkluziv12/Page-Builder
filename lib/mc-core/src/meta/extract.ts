/**
 * Pull the SEO-relevant content out of a fetched HTML page so a model can judge
 * what the page is ACTUALLY about. We deliberately read the real body — not just
 * the URL slug or <title> — because STS pages are frequently mislabeled: the slug
 * or title may say "electronics recycling" while the body is overwhelmingly about
 * secure data destruction (or vice-versa). Niche detection must key off the
 * dominant visible content, so we surface headings + a generous body excerpt.
 */
export interface ExtractedPageContent {
  /** Contents of <title>, trimmed. */
  title: string | null;
  /** <meta name="description"> content, trimmed. */
  metaDescription: string | null;
  /** <meta name="keywords"> content, trimmed. */
  metaKeywords: string | null;
  /** Every <h1> on the page (visible text). */
  h1: string[];
  /** Every <h2> on the page (visible text). */
  h2: string[];
  /** Up to ~4000 chars of de-tagged visible body text. */
  bodyText: string;
}

const BODY_TEXT_LIMIT = 4000;

function firstGroup(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  if (!m || typeof m[1] !== "string") return null;
  const v = decodeEntities(stripTags(m[1])).trim();
  return v || null;
}

function allGroups(html: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(html))) {
    if (typeof m[1] !== "string") continue;
    const v = decodeEntities(stripTags(m[1])).replace(/\s+/g, " ").trim();
    if (v) out.push(v);
  }
  return out;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

/** Decode the handful of HTML entities that actually matter for readable text. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z]+;/gi, " ");
}

/** De-tagged, whitespace-collapsed visible body text (script/style removed). */
function visibleText(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

export function extractPageContent(html: string): ExtractedPageContent {
  return {
    title: firstGroup(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    metaDescription: metaContent(html, "description"),
    metaKeywords: metaContent(html, "keywords"),
    h1: allGroups(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi),
    h2: allGroups(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi),
    bodyText: visibleText(html).slice(0, BODY_TEXT_LIMIT),
  };
}

/**
 * Read a <meta name="x" content="y"> value regardless of attribute order
 * (content-before-name and name-before-content both occur in the wild).
 */
function metaContent(html: string, name: string): string | null {
  const tagRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const tag = m[0];
    const nameMatch = /\bname\s*=\s*["']?([^"'\s>]+)/i.exec(tag);
    if (!nameMatch || nameMatch[1]?.toLowerCase() !== name.toLowerCase()) continue;
    const contentMatch = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    const raw = contentMatch?.[1] ?? contentMatch?.[2];
    if (typeof raw !== "string") return null;
    const v = decodeEntities(raw).trim();
    return v || null;
  }
  return null;
}
