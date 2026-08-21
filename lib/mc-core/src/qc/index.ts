import { runGtmetrixSpeedCheck, type GtmetrixOptions } from "./gtmetrix";
import { scanJsonLd } from "./jsonld";
import { isPrivateHostname } from "../seo/url";
import type { GtmetrixCheck, JsonLdScan, QcReport } from "./types";

const MAX_REDIRECTS = 5;

export * from "./types";
export { scanJsonLd } from "./jsonld";
export { runGtmetrixSpeedCheck, GTMETRIX_API_BASE } from "./gtmetrix";
export type { GtmetrixOptions } from "./gtmetrix";

export interface PostPublishQcInput {
  /** The LIVE city URL to QC. */
  url: string;
  /** GTmetrix API key. When absent/blank the speed check is recorded as not run. */
  gtmetrixApiKey?: string | null;
  /** Injectable fetch (for fetching the live HTML and for GTmetrix). */
  fetchImpl?: typeof fetch;
  /** GTmetrix poll/clock overrides for testing. */
  gtmetrixOptions?: Partial<Omit<GtmetrixOptions, "apiKey" | "url" | "fetchImpl">>;
}

/**
 * Run the full post-publish QC suite against a live URL:
 *   1. Fetch the live HTML and scan its JSON-LD for duplicate/conflicting/invalid blocks.
 *   2. Run a GTmetrix speed test and apply the Core Web Vitals thresholds.
 *
 * Overall `passed` requires BOTH checks to have run AND passed — a missing
 * GTmetrix key or an unreachable page yields a failing (not silently passing)
 * QC record. Never throws; sub-check failures are captured on the report.
 */
export async function runPostPublishQc(input: PostPublishQcInput): Promise<QcReport> {
  const doFetch = input.fetchImpl ?? fetch;

  const jsonLd = await scanLiveJsonLd(input.url, doFetch);

  const key = input.gtmetrixApiKey?.trim();
  const gtmetrix: GtmetrixCheck = key
    ? await runGtmetrixSpeedCheck({
        apiKey: key,
        url: input.url,
        fetchImpl: doFetch,
        ...input.gtmetrixOptions,
      })
    : {
        ran: false,
        passed: false,
        metrics: null,
        failReasons: [],
        error: "GTMETRIX_API_KEY is not configured; speed check skipped.",
      };

  return {
    url: input.url,
    ranAt: new Date().toISOString(),
    passed: gtmetrix.ran && gtmetrix.passed && jsonLd.ran && jsonLd.passed,
    gtmetrix,
    jsonLd,
  };
}

/** Fetch the live HTML and run the JSON-LD scan, capturing fetch failures. */
async function scanLiveJsonLd(url: string, doFetch: typeof fetch): Promise<JsonLdScan> {
  try {
    const res = await doFetch(url, { headers: { Accept: "text/html" } });
    const html = await res.text();
    if (!res.ok) {
      return emptyScan(`Could not fetch live page (${res.status} ${res.statusText}).`);
    }
    return scanJsonLd(html);
  } catch (err) {
    return emptyScan(err instanceof Error ? err.message : String(err));
  }
}

function emptyScan(error: string): JsonLdScan {
  return {
    ran: false,
    passed: false,
    blockCount: 0,
    blocks: [],
    duplicateTypes: [],
    conflictingIds: [],
    invalidBlockIndexes: [],
    issues: [error],
    error,
  };
}
