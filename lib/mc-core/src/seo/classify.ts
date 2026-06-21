import { isPrivateHostname } from "./url";
import { extractLocations } from "./location";
import type { Classification, TargetPageProbe } from "./types";

const MAX_REDIRECTS = 5;

/**
 * Below this visible word count an existing page is treated as thin enough to
 * warrant a full REVAMP rather than a LIGHT_TOUCH.
 */
export const LIGHT_TOUCH_WORD_FLOOR = 600;

/**
 * Derive the build classification from a probe of the target URL — replacing the
 * field the VA used to pick by hand:
 *   - no live page (404 / empty)        -> NEW_BUILD
 *   - live but thin (< floor words)     -> REVAMP
 *   - live and substantial (>= floor)   -> LIGHT_TOUCH
 */
export function deriveClassification(probe: TargetPageProbe): Classification {
  if (!probe.exists) return "NEW_BUILD";
  if (probe.wordCount < LIGHT_TOUCH_WORD_FLOOR) return "REVAMP";
  return "LIGHT_TOUCH";
}

/**
 * Probe a target URL to estimate whether a real page exists there and roughly
 * how much content it has. Network errors and non-OK statuses are treated as
 * "does not exist yet" (the normal case for a NEW_BUILD), so this never throws.
 */
export async function probeTargetPage(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TargetPageProbe> {
  try {
    let current = url;
    let res: Response | null = null;
    // Follow redirects manually so every hop's host is re-checked against the
    // SSRF guard — a public URL must not be able to redirect into internal space.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let host: string;
      try {
        host = new URL(current).hostname;
      } catch {
        return { exists: false, status: null, wordCount: 0 };
      }
      if (isPrivateHostname(host)) {
        return { exists: false, status: null, wordCount: 0 };
      }
      res = await fetchImpl(current, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MissionControl/1.0)" },
        redirect: "manual",
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current).href;
        continue;
      }
      break;
    }
    if (!res || !res.ok) {
      return { exists: false, status: res?.status ?? null, wordCount: 0 };
    }
    const html = await res.text();
    return {
      exists: true,
      status: res.status,
      wordCount: estimateWordCount(html),
      locations: extractLocations(html),
    };
  } catch {
    return { exists: false, status: null, wordCount: 0 };
  }
}

/** Rough visible-text word count: strip script/style/tags, count words. */
export function estimateWordCount(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 0;
  return text.split(" ").filter(Boolean).length;
}
