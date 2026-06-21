import { normalizeStateToAbbr } from "./url";
import type { ExtractedLocation } from "./types";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalize a city name for equivalence comparison (case/punct/"St"↔"Saint"). */
function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\bst\b/g, "saint")
    .replace(/\bmt\b/g, "mount")
    .replace(/\bft\b/g, "fort")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True only when two city names refer to the same locality. Equivalence-only:
 * tolerates case, punctuation and common abbreviations ("St"↔"Saint") but
 * deliberately does NOT substring-match, so "York" never matches "New York".
 */
export function cityNamesEquivalent(a: string, b: string): boolean {
  const x = normalizeCity(a);
  const y = normalizeCity(b);
  return x.length > 0 && x === y;
}

const JSON_LD_RE =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Collect every city/state pair from JSON-LD PostalAddress nodes. */
function fromJsonLd(html: string): ExtractedLocation[] {
  const out: ExtractedLocation[] = [];
  let match: RegExpExecArray | null;
  JSON_LD_RE.lastIndex = 0;
  while ((match = JSON_LD_RE.exec(html))) {
    const raw = match[1]!.trim();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    walk(data, out);
  }
  return out;
}

function walk(node: unknown, acc: ExtractedLocation[]): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, acc);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const locality = obj.addressLocality;
    const region = obj.addressRegion;
    if (typeof locality === "string" || typeof region === "string") {
      const city = typeof locality === "string" && locality.trim() ? titleCase(locality.trim()) : null;
      const state = typeof region === "string" ? normalizeStateToAbbr(region) : null;
      if (city || state) acc.push({ city, state });
    }
    for (const key of Object.keys(obj)) walk(obj[key], acc);
  }
}

// "City, ST 12345" / "City Name, ST 12345-6789" — anchored on a 2-letter state
// followed by a ZIP so we don't match arbitrary "Word, Word" prose. Up to three
// words of city are captured before the comma.
const CITY_STATE_RE =
  /([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2}),\s*([A-Za-z]{2})\.?\s+\d{5}(?:-\d{4})?/g;

/** Strip tags then scan visible text for "City, ST ZIP" patterns. */
function fromText(html: string): ExtractedLocation[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");
  const out: ExtractedLocation[] = [];
  let match: RegExpExecArray | null;
  CITY_STATE_RE.lastIndex = 0;
  while ((match = CITY_STATE_RE.exec(text))) {
    const state = normalizeStateToAbbr(match[2]!);
    if (!state) continue;
    out.push({ city: titleCase(match[1]!.trim()), state });
  }
  return out;
}

/**
 * Extract de-duplicated city/state location signals from a fetched page,
 * preferring structured JSON-LD over free text. Used to verify (and, when a
 * same-named city is clearly in a different state, correct) the URL-parsed
 * location.
 */
export function extractLocations(html: string): ExtractedLocation[] {
  const candidates = [...fromJsonLd(html), ...fromText(html)];
  const seen = new Set<string>();
  const deduped: ExtractedLocation[] = [];
  for (const c of candidates) {
    if (!c.city && !c.state) continue;
    const key = `${(c.city ?? "").toLowerCase()}|${(c.state ?? "").toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}
