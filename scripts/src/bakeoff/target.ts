import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Classification, Competition, PageType } from "@workspace/mc-core";

/**
 * The build target the bake-off / produce pipeline points at. Every model and
 * scenario shares ONE target so the comparison stays apples-to-apples; the
 * target only selects WHICH page is being reproduced, never how a given model is
 * driven.
 */
export interface BakeoffTarget {
  url: string;
  city: string;
  state: string;
  niche: string;
  pageType: PageType;
  classification: Classification;
  competition: Competition;
}

/** The original Billings, MT smoke target — the default when nothing is set. */
const DEFAULT_TARGET: BakeoffTarget = {
  url: "https://www.stselectronicrecyclinginc.com/billings-mt",
  city: "Billings",
  state: "MT",
  niche: "electronics recycling",
  pageType: "SPOKE",
  classification: "NEW_BUILD",
  competition: "MEDIUM",
};

const PAGE_TYPES: PageType[] = ["HUB", "SPOKE", "NATIONAL"];
const CLASSIFICATIONS: Classification[] = ["NEW_BUILD", "REVAMP", "LIGHT_TOUCH"];
const COMPETITIONS: Competition[] = ["LOW", "MEDIUM", "HIGH"];

function pickEnum<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: T[],
  fallback: T,
): T {
  if (raw == null || raw.trim() === "") return fallback;
  const value = raw.trim().toUpperCase();
  if (!allowed.includes(value as T)) {
    throw new Error(`${name}="${raw}" is invalid — expected one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

/**
 * Resolve the build target from the environment, defaulting to the Billings, MT
 * page so existing flows are unchanged. Override any field via env to point the
 * run at ANY city/url:
 *   - URL:            `BAKEOFF_TARGET_URL` (or legacy `BAKEOFF_PAGE_URL`)
 *   - City / State:   `BAKEOFF_CITY` / `BAKEOFF_STATE`
 *   - Niche:          `BAKEOFF_NICHE`
 *   - Page metadata:  `BAKEOFF_PAGE_TYPE` / `BAKEOFF_CLASSIFICATION` / `BAKEOFF_COMPETITION`
 * The enum-typed fields fail loud on an unrecognized value rather than silently
 * falling back, matching the repo's fail-loud convention.
 */
export function resolveTarget(): BakeoffTarget {
  const url =
    process.env.BAKEOFF_TARGET_URL?.trim() ||
    process.env.BAKEOFF_PAGE_URL?.trim() ||
    DEFAULT_TARGET.url;
  const city = process.env.BAKEOFF_CITY?.trim() || DEFAULT_TARGET.city;
  const state = process.env.BAKEOFF_STATE?.trim() || DEFAULT_TARGET.state;
  const niche = process.env.BAKEOFF_NICHE?.trim() || DEFAULT_TARGET.niche;
  return {
    url,
    city,
    state,
    niche,
    pageType: pickEnum("BAKEOFF_PAGE_TYPE", process.env.BAKEOFF_PAGE_TYPE, PAGE_TYPES, DEFAULT_TARGET.pageType),
    classification: pickEnum(
      "BAKEOFF_CLASSIFICATION",
      process.env.BAKEOFF_CLASSIFICATION,
      CLASSIFICATIONS,
      DEFAULT_TARGET.classification,
    ),
    competition: pickEnum(
      "BAKEOFF_COMPETITION",
      process.env.BAKEOFF_COMPETITION,
      COMPETITIONS,
      DEFAULT_TARGET.competition,
    ),
  };
}

/** Slug used to locate a per-target reference fixture, e.g. `billings-mt`. */
export function targetSlug(target: Pick<BakeoffTarget, "city" | "state">): string {
  return `${target.city}-${target.state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The subset of a recorded `BakeoffResults.target` we can compare against. Every
 * field is optional/unknown-typed because a historical file may predate a field
 * or carry a hand-edited shape — an unreadable target is treated as UNKNOWN (and
 * therefore NOT a match), never as an optimistic match. */
export type RecordedTarget = Partial<Record<keyof BakeoffTarget, unknown>> | null | undefined;

const TARGET_FIELDS: Array<keyof BakeoffTarget> = [
  "url",
  "city",
  "state",
  "niche",
  "pageType",
  "classification",
  "competition",
];

function normalizeField(field: keyof BakeoffTarget, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // URLs compare case-insensitively without a trailing slash; every other field
  // is a case-insensitive token (the enums are already upper-cased on resolve).
  if (field === "url") return trimmed.replace(/\/+$/, "").toLowerCase();
  return trimmed.toLowerCase();
}

/**
 * Stable identity for a build target: the seven fields that decide WHICH page is
 * being reproduced. Two runs share grounding and resumable model results only
 * when this key matches exactly — that is what stops a Bakersfield run from
 * inheriting a Billings run's grounding or "already recorded" model rows.
 */
export function targetKey(target: BakeoffTarget): string {
  return TARGET_FIELDS.map((f) => `${f}=${normalizeField(f, target[f]) ?? ""}`).join("|");
}

export interface TargetMatch {
  match: boolean;
  /** Fields that differ (or are unreadable in the recorded target). Empty on a match. */
  differing: string[];
  /** One-line, operator-facing explanation. */
  reason: string;
}

/**
 * Compare a recorded target from a prior results file against the target this
 * run resolved. Missing / non-string fields count as a MISMATCH, never as a
 * match: a file that does not state its target cannot prove it is the same page.
 */
export function compareTarget(recorded: RecordedTarget, current: BakeoffTarget): TargetMatch {
  if (!recorded || typeof recorded !== "object") {
    return {
      match: false,
      differing: [...TARGET_FIELDS],
      reason: "the prior dataset records no target block, so it cannot be proven to be the same page",
    };
  }
  const differing: string[] = [];
  for (const field of TARGET_FIELDS) {
    const was = normalizeField(field, (recorded as Record<string, unknown>)[field]);
    const now = normalizeField(field, current[field]);
    if (was === null || was !== now) differing.push(field);
  }
  if (differing.length === 0) {
    return { match: true, differing: [], reason: "same target" };
  }
  const detail = differing
    .map((f) => {
      const was = (recorded as Record<string, unknown>)[f];
      return `${f}: ${typeof was === "string" && was.trim() ? was.trim() : "<not recorded>"} -> ${
        current[f as keyof BakeoffTarget]
      }`;
    })
    .join("; ");
  return { match: false, differing, reason: `target changed (${detail})` };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = resolve(HERE, "reference");

export interface ReferenceHtml {
  /** The reference page HTML used for closeness scoring ("" when unavailable). */
  html: string;
  /** Where it came from: a per-target fixture, a live fetch, or none. */
  source: "fixture" | "live-fetch" | "none";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the reference page used to score how CLOSE a model's build is to the real
 * published page. Selection is per-target and degrades gracefully (closeness
 * scoring is a comparison aid, not a build input, so it must never block a run):
 *   1. a checked-in fixture `reference/<city>-<state>.html` (the Billings default), then
 *   2. a live fetch of the supplied target URL, then
 *   3. an empty reference (closeness scores degrade to 0 rather than crashing).
 */
export async function loadReferenceHtml(target: BakeoffTarget): Promise<ReferenceHtml> {
  const fixturePath = resolve(REFERENCE_DIR, `${targetSlug(target)}.html`);
  if (await fileExists(fixturePath)) {
    const html = await readFile(fixturePath, "utf8");
    console.log(`Reference page: fixture ${fixturePath} (${html.length} chars).`);
    return { html, source: "fixture" };
  }

  try {
    const res = await fetch(target.url, { headers: { "user-agent": "STS-Bakeoff/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.trim()) throw new Error("empty body");
    console.log(`Reference page: live fetch ${target.url} (${html.length} chars).`);
    return { html, source: "live-fetch" };
  } catch (err) {
    console.log(
      `Reference page: none — no fixture for "${targetSlug(target)}" and live fetch of ${target.url} failed ` +
        `(${err instanceof Error ? err.message : String(err)}). Closeness scoring will degrade for this run.`,
    );
    return { html: "", source: "none" };
  }
}
