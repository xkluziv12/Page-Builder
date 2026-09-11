import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cityDataSchema } from "./cityDataSchema.js";

/**
 * Deterministic validation of one candidate `CityData` record. NO model calls.
 *
 * Three layers, in order, all driven by `prompt-pack/gate.config.json` so the
 * rules stay machine-checkable data rather than prose buried in code:
 *   1. shape      — Zod parse against `cityDataSchema`
 *   2. contracts  — the hard counts and length windows from section 2
 *   3. editorial  — dashes/emoji/prices/thresholds, credential phrasing tiers,
 *                   and planning-market banned phrasing from section 3
 *
 * Returns `{ ok: false, errors }` for ANY normal validation failure — it never
 * throws for bad content. It throws only when the input is not a candidate
 * record at all (null, a scalar, an array), or when the gate config itself is
 * unreadable, because those are caller bugs rather than model output to repair.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE_CONFIG_PATH = join(HERE, "prompt-pack", "gate.config.json");

/** One regex-backed rule as stored in gate.config.json. */
export interface PatternRule {
  id?: string;
  label?: string;
  phrase?: string;
  pattern: string;
  flags?: string;
}

export interface GateConfig {
  source: string;
  hardCounts: Record<string, number>;
  lengthContracts: {
    visibleWordsMin: number;
    seoTitleMaxChars: number;
    seoDescriptionMinChars: number;
    seoDescriptionMaxChars: number;
  };
  maxSentenceWords: number;
  visibleWordExclusions: {
    note: string;
    topLevelFields: string[];
    nestedFields: string[];
  };
  editorialRules: PatternRule[];
  credentialTiers: {
    credential: string;
    tier: string;
    allowed: string[];
    never: PatternRule[];
  }[];
  planningMarket: {
    note: string;
    approvedFraming: string[];
    bannedPatterns: PatternRule[];
  };
  sentenceAbbreviations: string[];
}

function loadGateConfig(): GateConfig {
  // readFileSync throwing here is intentional: a missing gate config is a
  // broken install, not a validation failure.
  const raw = readFileSync(GATE_CONFIG_PATH, "utf8");
  try {
    return JSON.parse(raw) as GateConfig;
  } catch (err) {
    console.error(`[validate] gate.config.json at ${GATE_CONFIG_PATH} is not valid JSON.`);
    throw err;
  }
}

export const gateConfig: GateConfig = loadGateConfig();

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

/** Cap on offenders reported per rule, so one systemic slip cannot produce an
 * error list too long to hand back to the model as a repair instruction. */
const MAX_REPORTED_PER_RULE = 5;

interface StringHit {
  path: string;
  text: string;
}

/** Collect every string in the record, depth-first, with a dotted path.
 * `skipKey` drops whole subtrees (used to exclude non-visible fields). */
function walkStrings(
  value: unknown,
  path: string,
  out: StringHit[],
  skipKey: (key: string, topLevel: boolean) => boolean,
): void {
  if (typeof value === "string") {
    out.push({ path: path || "(root)", text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkStrings(item, `${path}[${i}]`, out, skipKey));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (skipKey(key, path === "")) continue;
      walkStrings(child, path === "" ? key : `${path}.${key}`, out, skipKey);
    }
  }
}

const KEEP_EVERYTHING = (): boolean => false;

function visibleSkipKey(config: GateConfig): (key: string, topLevel: boolean) => boolean {
  const top = new Set(config.visibleWordExclusions.topLevelFields);
  const nested = new Set(config.visibleWordExclusions.nestedFields);
  return (key, topLevel) => (topLevel && top.has(key)) || nested.has(key);
}

/** Words = whitespace-delimited tokens containing at least one letter or digit,
 * so bare punctuation never inflates the visible-word floor. */
function countWords(text: string): number {
  const tokens = text.match(/\S+/g) ?? [];
  return tokens.filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/**
 * Split prose into sentences. Deliberately conservative: it only breaks on a
 * terminator that is followed by whitespace and then a capital/quote/digit, and
 * it refuses to break after a known abbreviation ("St. Louis", "RSMo Sec.") or a
 * single-letter initial. Over-splitting would hide a genuinely long sentence.
 */
export function splitSentences(text: string, abbreviations: string[]): string[] {
  const abbrevs = new Set(abbreviations.map((a) => a.toLowerCase()));
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    let end = i;
    while (end + 1 < text.length && ".!?".includes(text[end + 1] as string)) end++;
    const after = text.slice(end + 1);
    // "3.5" / "800-88." mid-token: no whitespace after the dot, not a boundary.
    if (after.length > 0 && !/^\s/.test(after)) continue;
    const nextChar = after.replace(/^\s+/, "")[0];
    if (nextChar !== undefined && !/["'(“‘A-Z0-9]/.test(nextChar)) continue;
    if (ch === ".") {
      const lastWord = text.slice(start, i).match(/([A-Za-z.]+)$/)?.[1] ?? "";
      if (abbrevs.has(lastWord.toLowerCase())) continue;
      if (/^[A-Z]$/.test(lastWord)) continue;
    }
    const sentence = text.slice(start, end + 1).trim();
    if (sentence) out.push(sentence);
    start = end + 1;
    i = end;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function compileRule(rule: PatternRule, context: string): RegExp {
  try {
    return new RegExp(rule.pattern, rule.flags ?? "");
  } catch (err) {
    console.error(
      `[validate] ${context} rule "${rule.id ?? rule.phrase ?? rule.pattern}" has an ` +
        `uncompilable pattern in gate.config.json.`,
    );
    throw err;
  }
}

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  const body = text.slice(start, end).replace(/\s+/g, " ");
  return `${start > 0 ? "..." : ""}${body}${end < text.length ? "..." : ""}`;
}

/** Report every string that matches `rule`, capped, as one error line each. */
function scanRule(
  hits: StringHit[],
  rule: PatternRule,
  context: string,
  label: string,
  errors: string[],
): void {
  const re = compileRule(rule, context);
  let reported = 0;
  for (const hit of hits) {
    const m = re.exec(hit.text);
    if (!m) continue;
    if (reported >= MAX_REPORTED_PER_RULE) {
      errors.push(`${label}: additional occurrences beyond the first ${MAX_REPORTED_PER_RULE} were not listed.`);
      return;
    }
    reported++;
    errors.push(
      `${label}: found "${m[0]}" in ${hit.path} -> "${snippet(hit.text, m.index, m[0].length)}"`,
    );
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function describeValue(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}

/**
 * Validate one candidate record.
 *
 * @throws if `candidate` is not a plain object — that is a malformed input, not
 *         a content failure the model can be asked to repair.
 */
export function validate(candidate: unknown): ValidationResult {
  if (candidate === null || candidate === undefined) {
    throw new Error("validate() received no candidate record (null/undefined).");
  }
  if (typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(
      `validate() expects a single CityData object, received ${describeValue(candidate)}.`,
    );
  }

  const record = candidate as Record<string, unknown>;
  const errors: string[] = [];

  // ── 1. Shape ────────────────────────────────────────────────────────────
  const parsed = cityDataSchema.safeParse(record);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      errors.push(`schema: ${path}: ${issue.message}`);
    }
  }

  // ── 2. Hard counts and length windows ───────────────────────────────────
  for (const [field, expected] of Object.entries(gateConfig.hardCounts)) {
    const value = record[field];
    if (!Array.isArray(value)) {
      errors.push(
        `count: ${field} must be an array of exactly ${expected} items (got ${describeValue(value)}).`,
      );
      continue;
    }
    if (value.length !== expected) {
      errors.push(`count: ${field} must have exactly ${expected} items, got ${value.length}.`);
    }
  }

  const { lengthContracts } = gateConfig;
  const seoTitle = record.seoTitle;
  if (typeof seoTitle !== "string") {
    errors.push(`length: seoTitle must be a string (got ${describeValue(seoTitle)}).`);
  } else if (seoTitle.length > lengthContracts.seoTitleMaxChars) {
    errors.push(
      `length: seoTitle is ${seoTitle.length} chars, maximum is ${lengthContracts.seoTitleMaxChars}.`,
    );
  }

  const seoDescription = record.seoDescription;
  if (typeof seoDescription !== "string") {
    errors.push(`length: seoDescription must be a string (got ${describeValue(seoDescription)}).`);
  } else if (
    seoDescription.length < lengthContracts.seoDescriptionMinChars ||
    seoDescription.length > lengthContracts.seoDescriptionMaxChars
  ) {
    errors.push(
      `length: seoDescription is ${seoDescription.length} chars, must be ` +
        `${lengthContracts.seoDescriptionMinChars} to ${lengthContracts.seoDescriptionMaxChars}.`,
    );
  }

  const visibleHits: StringHit[] = [];
  walkStrings(record, "", visibleHits, visibleSkipKey(gateConfig));
  const visibleWords = visibleHits.reduce((sum, hit) => sum + countWords(hit.text), 0);
  if (visibleWords < lengthContracts.visibleWordsMin) {
    errors.push(
      `length: visible word count is ${visibleWords}, floor is ${lengthContracts.visibleWordsMin}. ` +
        `Add roughly ${lengthContracts.visibleWordsMin - visibleWords} more words of substantive prose.`,
    );
  }

  // ── 3. Editorial rules ──────────────────────────────────────────────────
  const allHits: StringHit[] = [];
  walkStrings(record, "", allHits, KEEP_EVERYTHING);

  for (const rule of gateConfig.editorialRules) {
    scanRule(allHits, rule, "editorial", `editorial[${rule.id ?? "rule"}] ${rule.label ?? ""}`.trim(), errors);
  }

  // Sentence length runs over visible prose only: alt text, slugs and image
  // paths are not sentences and would only produce noise.
  let longSentences = 0;
  for (const hit of visibleHits) {
    for (const sentence of splitSentences(hit.text, gateConfig.sentenceAbbreviations)) {
      const words = countWords(sentence);
      if (words <= gateConfig.maxSentenceWords) continue;
      longSentences++;
      if (longSentences > MAX_REPORTED_PER_RULE) continue;
      errors.push(
        `editorial[sentence-length]: ${hit.path} has a ${words}-word sentence ` +
          `(max ${gateConfig.maxSentenceWords}): "${sentence.replace(/\s+/g, " ").slice(0, 160)}"`,
      );
    }
  }
  if (longSentences > MAX_REPORTED_PER_RULE) {
    errors.push(
      `editorial[sentence-length]: ${longSentences} over-length sentences total; ` +
        `only the first ${MAX_REPORTED_PER_RULE} are listed.`,
    );
  }

  // ── 4. Credential phrasing tiers ────────────────────────────────────────
  for (const tier of gateConfig.credentialTiers) {
    for (const banned of tier.never) {
      scanRule(
        allHits,
        banned,
        "credential",
        `credential[${tier.credential} / ${tier.tier}] banned phrasing "${banned.phrase ?? banned.pattern}"`,
        errors,
      );
    }
  }

  // ── 5. Planning-market phrasing ─────────────────────────────────────────
  if (record.availabilityConfirmationRequired === true) {
    const city = typeof record.city === "string" ? record.city : null;
    if (city === null) {
      errors.push(
        "planning: availabilityConfirmationRequired is true but city is not a string, so " +
          "city-specific banned phrasing could not be checked.",
      );
    }
    for (const banned of gateConfig.planningMarket.bannedPatterns) {
      const needsCity = banned.pattern.includes("CITY");
      if (needsCity && city === null) continue;
      const resolved: PatternRule = {
        ...banned,
        pattern: needsCity ? banned.pattern.replace(/CITY/g, escapeRegex(city as string)) : banned.pattern,
      };
      scanRule(
        allHits,
        resolved,
        "planning",
        `planning[banned] "${banned.phrase ?? banned.pattern}" (approved framing: ` +
          `${gateConfig.planningMarket.approvedFraming.join(", ")})`,
        errors,
      );
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Visible word count for one record, exposed so a caller can report it
 * alongside a pass without re-walking the record itself. */
export function visibleWordCount(candidate: unknown): number {
  if (candidate === null || typeof candidate !== "object") {
    throw new Error(`visibleWordCount() expects an object, received ${describeValue(candidate)}.`);
  }
  const hits: StringHit[] = [];
  walkStrings(candidate, "", hits, visibleSkipKey(gateConfig));
  return hits.reduce((sum, hit) => sum + countWords(hit.text), 0);
}
