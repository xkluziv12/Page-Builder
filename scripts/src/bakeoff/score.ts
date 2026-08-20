import { extractStructuralSignals, type CheckerReport } from "@workspace/mc-core";
import type { ModelResult, ModelScores } from "./types";
import type { VisualVerdict } from "./visual.js";

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Checker quality: start at 100, dock per error/warning on the final page. */
function auditScore(report: CheckerReport): number {
  return clamp(100 - report.errorCount * 12 - report.warningCount * 2);
}

/** Design-skeleton completeness: how many of the 4 structural signals are present. */
function structureScore(html: string): number {
  const s = extractStructuralSignals(html);
  let pts = 0;
  if (s.rootCss.trim()) pts += 25; // design tokens present
  pts += Math.min(25, s.sectionSequence.length * 5); // section markers
  if (s.equipmentTitles.length > 0) pts += 25; // equipment cards
  pts += Math.min(25, s.sacredUrls.length * 3); // sacred / internal links
  return clamp(pts);
}

function schemaScore(valid: boolean, report: CheckerReport): number {
  if (!valid) return 0;
  const schemaCheck = report.checks.find((c) => c.id.includes("schema"));
  if (schemaCheck && !schemaCheck.passed) return schemaCheck.severity === "error" ? 55 : 80;
  return 100;
}

function linksScore(report: CheckerReport): number {
  const la = report.linkAudit;
  return la.passed ? 100 : clamp(100 - la.errorCount * 20);
}

/**
 * Word-count fit (0-100). Symmetric band: undershooting the floor scales the
 * score down by the wordCount/floor ratio (writing too little is penalized);
 * overshooting the ceiling scales it down by the ceiling/wordCount ratio
 * (blowing past the mandated max is penalized just as hard). Anything inside
 * [floor, ceiling] scores a full 100.
 */
function wordCountScore(report: CheckerReport, floor: number, ceiling: number): number {
  if (floor <= 0) return 100;
  const wc = report.wordCount;
  if (wc < floor) return clamp((wc / floor) * 100);
  if (ceiling > 0 && wc > ceiling) return clamp((ceiling / wc) * 100);
  return 100;
}

// ---------------------------------------------------------------------------
// Closeness to the REAL published page (ground truth).
// ---------------------------------------------------------------------------

/** Frequency vector of HTML tag names. */
function tagFreq(html: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const m of html.matchAll(/<([a-z][a-z0-9]*)\b/gi)) {
    const tag = m[1]!.toLowerCase();
    freq.set(tag, (freq.get(tag) ?? 0) + 1);
  }
  return freq;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    const va = a.get(k) ?? 0;
    const vb = b.get(k) ?? 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Visible text → set of lowercased word tokens (scripts/styles/tags stripped). */
function textTokens(html: string): Set<string> {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  return new Set(text.match(/[a-z0-9]{3,}/g) ?? []);
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Structure + content closeness vs the real page (0-100). */
function htmlMatchScore(modelHtml: string, refHtml: string): number {
  const structure = cosine(tagFreq(modelHtml), tagFreq(refHtml)); // 0-1
  const content = jaccard(textTokens(modelHtml), textTokens(refHtml)); // 0-1
  return clamp((structure * 0.5 + content * 0.5) * 100);
}

/** Design tokens: colors, CSS custom properties, font families, class vocabulary. */
function designTokens(html: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of html.matchAll(/#[0-9a-f]{3,8}\b/gi)) tokens.add(`color:${m[0]!.toLowerCase()}`);
  for (const m of html.matchAll(/--[a-z0-9-]+/gi)) tokens.add(`var:${m[0]!.toLowerCase()}`);
  for (const m of html.matchAll(/font-family\s*:\s*([^;"}]+)/gi)) {
    tokens.add(`font:${m[1]!.toLowerCase().replace(/\s+/g, " ").trim()}`);
  }
  for (const m of html.matchAll(/class\s*=\s*["']([^"']+)["']/gi)) {
    for (const cls of m[1]!.split(/\s+/)) if (cls) tokens.add(`class:${cls.toLowerCase()}`);
  }
  return tokens;
}

/**
 * Legacy design-token proxy (0-100): colors/CSS vars/fonts/class-name overlap.
 * Kept only as a secondary, transparency signal — the headline visual score now
 * comes from rendered screenshots (see {@link VisualVerdict} / `visual.ts`).
 */
function visualTokensScore(modelHtml: string, refHtml: string): number {
  return clamp(jaccard(designTokens(modelHtml), designTokens(refHtml)) * 100);
}

/**
 * Composite weights (must sum to 1.0). Deliberately tuned for an HONEST score:
 *   - SPEED is excluded from the composite (weight 0). A freakishly fast model
 *     should not be able to mathematically dominate on quality; speed stays a
 *     separately-reported axis (`ModelScores.speed`) for transparency only.
 *   - htmlMatch + visualMatch are capped at a COMBINED 0.25 (was ~0.40) so
 *     closely copying the reference template can't outweigh a model that builds
 *     a genuinely better page.
 *   - The freed weight is moved into the real-quality axes (audit/structure/
 *     schema/wordCount), and wordCount now also penalizes overshoot (see
 *     {@link wordCountScore}), not just the floor.
 */
const WEIGHTS = {
  audit: 0.25,
  structure: 0.15,
  schema: 0.15,
  links: 0.1,
  wordCount: 0.1,
  htmlMatch: 0.125,
  visualMatch: 0.125,
} as const;

/**
 * Score every successful model. Speed is relative to the fastest successful run
 * (fastest = 100) and is REPORTED ONLY — it is no longer blended into the
 * composite (see {@link WEIGHTS}). htmlMatch / visualMatch compare each final
 * page against the real published page. Failed models are left unscored.
 *
 * `visualVerdicts` carries the rendered-screenshot visual judge (perceptual
 * pixel-diff + optional vision-LLM rating), keyed by model id. When a model has
 * a verdict, `visualMatch` is the headline screenshot score; when it doesn't
 * (e.g. the browser wasn't run), `visualMatch` falls back to the design-token
 * proxy so the pipeline never silently loses the metric.
 */
export function scoreModels(
  models: ModelResult[],
  wordCountFloor: number,
  wordCountCeiling: number,
  referenceHtml: string,
  visualVerdicts?: Map<string, VisualVerdict>,
): void {
  const ok = models.filter((m) => m.status === "ok" && m.checkerReport && m.html);
  const fastestMs = Math.min(...ok.map((m) => m.totalMs).filter((n) => n > 0), Infinity);

  for (const m of ok) {
    const report = m.checkerReport!;
    const speed = fastestMs === Infinity || m.totalMs <= 0 ? 0 : clamp((fastestMs / m.totalMs) * 100);
    const visualTokens = visualTokensScore(m.html!, referenceHtml);
    const verdict = visualVerdicts?.get(m.id) ?? null;
    const partial: Omit<ModelScores, "composite"> = {
      audit: auditScore(report),
      structure: structureScore(m.html!),
      schema: schemaScore(m.schemaValid, report),
      links: linksScore(report),
      wordCount: wordCountScore(report, wordCountFloor, wordCountCeiling),
      speed,
      htmlMatch: htmlMatchScore(m.html!, referenceHtml),
      visualMatch: verdict ? verdict.combined : visualTokens,
      visualPixel: verdict ? verdict.pixel : null,
      visualLlm: verdict ? verdict.llm : null,
      visualTokens,
    };
    const composite = clamp(
      partial.audit * WEIGHTS.audit +
        partial.structure * WEIGHTS.structure +
        partial.schema * WEIGHTS.schema +
        partial.links * WEIGHTS.links +
        partial.wordCount * WEIGHTS.wordCount +
        partial.htmlMatch * WEIGHTS.htmlMatch +
        partial.visualMatch * WEIGHTS.visualMatch,
    );
    m.scores = { ...partial, composite };
  }
}
