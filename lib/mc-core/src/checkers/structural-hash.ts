import { createHash } from "node:crypto";

/**
 * Compute a structural fingerprint of a page using the 5-signal minimal diff the
 * design bible cares about:
 *   1. the `:root { ... }` CSS block (design tokens),
 *   2. the section-marker sequence (`<section>` / `<!-- SECTION ... -->` order),
 *   3. the `.hero` margin-top value,
 *   4. the equipment-card titles, and
 *   5. the sacred equipment URL list.
 *
 * The actual bible values are NOT committed to this repo (the bible is an
 * uncontrolled .docx the VA uploads), so we cannot hard-code expected values.
 * Instead we hash the page's own structure so a later audit can detect DRIFT:
 * the hash stored at build time vs. the hash recomputed on a later pass. A
 * changed hash means the page skeleton moved.
 */
export function computeStructuralHash(html: string | null | undefined): string {
  const signals = extractStructuralSignals(html ?? "");
  return createHash("sha256").update(JSON.stringify(signals)).digest("hex").slice(0, 32);
}

export interface StructuralSignals {
  rootCss: string;
  sectionSequence: string[];
  heroMarginTop: string;
  equipmentTitles: string[];
  sacredUrls: string[];
}

export function extractStructuralSignals(html: string): StructuralSignals {
  return {
    rootCss: normalizeWhitespace(matchOne(html, /:root\s*\{([^}]*)\}/i)),
    sectionSequence: extractSectionSequence(html),
    heroMarginTop: normalizeWhitespace(
      matchOne(html, /\.hero[^{]*\{[^}]*?margin-top\s*:\s*([^;}\n]+)/i),
    ),
    equipmentTitles: extractEquipmentTitles(html),
    sacredUrls: extractStsPaths(html),
  };
}

function matchOne(html: string, re: RegExp): string {
  const m = html.match(re);
  return m?.[1]?.trim() ?? "";
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractSectionSequence(html: string): string[] {
  const out: string[] = [];
  const re = /<section\b[^>]*\bclass\s*=\s*["']([^"']*)["'][^>]*>|<!--\s*SECTION[:\s]*([^>-]*?)\s*-->/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push((m[1] ?? m[2] ?? "").trim().toLowerCase());
  }
  return out;
}

function extractEquipmentTitles(html: string): string[] {
  const out: string[] = [];
  const re = /class\s*=\s*["'][^"']*equipment[^"']*["'][^>]*>[\s\S]*?<(?:h\d|span|p)[^>]*>([^<]{1,80})</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = m[1]?.trim();
    if (t) out.push(t.toLowerCase());
  }
  return out;
}

function extractStsPaths(html: string): string[] {
  const out = new Set<string>();
  const re = /href\s*=\s*["']([^"']*stselectronicrecyclinginc\.com\/[^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.add(m[1]!.trim().replace(/\/+$/, "").toLowerCase());
  }
  return [...out].sort();
}
