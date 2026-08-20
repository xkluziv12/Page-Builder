import { QC_THRESHOLDS, type GtmetrixCheck, type GtmetrixMetrics } from "./types";

export const GTMETRIX_API_BASE = "https://gtmetrix.com/api/2.0";

export interface GtmetrixOptions {
  apiKey: string;
  url: string;
  /** Injectable fetch for testing (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Poll interval between status checks, ms. Default 3000. */
  pollIntervalMs?: number;
  /** Maximum total time to wait for a result, ms. Default 90000. */
  maxPollMs?: number;
  /** Injectable clock for testing. */
  now?: () => number;
  /** Injectable sleep for testing. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GTmetrix authenticates with the API key as the Basic-auth username, no password. */
function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Map a GTmetrix v2 report's `attributes` block into our metric shape. */
function toMetrics(attrs: Record<string, unknown>, reportUrl: string | null): GtmetrixMetrics {
  return {
    performanceScore: num(attrs.performance_score),
    structureScore: num(attrs.structure_score),
    lcp: num(attrs.largest_contentful_paint),
    tbt: num(attrs.total_blocking_time),
    cls: num(attrs.cumulative_layout_shift),
    ttfb: num(attrs.time_to_first_byte),
    fullyLoadedTime: num(attrs.fully_loaded_time),
    reportUrl,
  };
}

/** Apply the speed thresholds (perf < 85 or LCP > 2.5s = fail). */
function evaluate(metrics: GtmetrixMetrics): string[] {
  const reasons: string[] = [];
  if (metrics.performanceScore !== null && metrics.performanceScore < QC_THRESHOLDS.performanceScoreMin) {
    reasons.push(
      `Performance score ${metrics.performanceScore} is below the ${QC_THRESHOLDS.performanceScoreMin} threshold.`,
    );
  }
  if (metrics.lcp !== null && metrics.lcp > QC_THRESHOLDS.lcpMaxMs) {
    reasons.push(
      `LCP ${(metrics.lcp / 1000).toFixed(2)}s exceeds the ${(QC_THRESHOLDS.lcpMaxMs / 1000).toFixed(1)}s threshold.`,
    );
  }
  return reasons;
}

interface JsonApiResource {
  data?: {
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
    links?: Record<string, unknown>;
  };
  links?: Record<string, unknown>;
}

/**
 * Run a GTmetrix speed test against a live URL and evaluate Core Web Vitals.
 *
 * Flow (GTmetrix API v2.0, JSON:API):
 *   1. POST /tests        → start a test, get its id.
 *   2. GET  /tests/{id}   → poll until state === "completed" (or "error").
 *   3. GET  report link   → fetch the report attributes (the metrics).
 *
 * Never throws: any transport error, API error, or timeout is captured on the
 * returned check (`ran: false`, `passed: false`, `error` set) so the dashboard
 * can record a durable QC result instead of crashing the request.
 */
export async function runGtmetrixSpeedCheck(opts: GtmetrixOptions): Promise<GtmetrixCheck> {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const pollIntervalMs = opts.pollIntervalMs ?? 3000;
  const maxPollMs = opts.maxPollMs ?? 90000;
  const headers = {
    Authorization: authHeader(opts.apiKey),
    "Content-Type": "application/vnd.api+json",
  };

  try {
    const startRes = await doFetch(`${GTMETRIX_API_BASE}/tests`, {
      method: "POST",
      headers,
      body: JSON.stringify({ data: { type: "test", attributes: { url: opts.url } } }),
    });
    const startText = await startRes.text();
    if (!startRes.ok) {
      return failed(`GTmetrix test start failed (${startRes.status} ${startRes.statusText}): ${startText.slice(0, 300)}`);
    }
    const startBody = parseJson(startText);
    const testId = startBody?.data?.id;
    if (!testId) {
      return failed(`GTmetrix did not return a test id: ${startText.slice(0, 300)}`);
    }

    const deadline = now() + maxPollMs;
    let reportLink: string | null = null;
    while (now() < deadline) {
      await sleep(pollIntervalMs);
      const pollRes = await doFetch(`${GTMETRIX_API_BASE}/tests/${testId}`, { headers });
      const pollText = await pollRes.text();
      if (!pollRes.ok) {
        return failed(`GTmetrix poll failed (${pollRes.status} ${pollRes.statusText}): ${pollText.slice(0, 300)}`);
      }
      const pollBody = parseJson(pollText);
      const state = pollBody?.data?.attributes?.state;
      if (state === "error") {
        const reason = pollBody?.data?.attributes?.error;
        return failed(`GTmetrix test errored: ${typeof reason === "string" ? reason : "unknown error"}`);
      }
      if (state === "completed") {
        reportLink = linkOf(pollBody?.data?.links?.report) ?? `${GTMETRIX_API_BASE}/reports/${testId}`;
        break;
      }
    }

    if (!reportLink) {
      return failed(`GTmetrix test did not complete within ${Math.round(maxPollMs / 1000)}s.`);
    }

    const reportRes = await doFetch(reportLink, { headers });
    const reportText = await reportRes.text();
    if (!reportRes.ok) {
      return failed(`GTmetrix report fetch failed (${reportRes.status} ${reportRes.statusText}): ${reportText.slice(0, 300)}`);
    }
    const reportBody = parseJson(reportText);
    const attrs = reportBody?.data?.attributes;
    if (!attrs) {
      return failed(`GTmetrix report had no attributes: ${reportText.slice(0, 300)}`);
    }
    const metrics = toMetrics(attrs, linkOf(reportBody?.data?.links?.report_url));
    const failReasons = evaluate(metrics);
    return { ran: true, passed: failReasons.length === 0, metrics, failReasons, error: null };
  } catch (err) {
    return failed(err instanceof Error ? err.message : String(err));
  }
}

function failed(error: string): GtmetrixCheck {
  return { ran: false, passed: false, metrics: null, failReasons: [], error };
}

function parseJson(text: string): JsonApiResource | null {
  try {
    return text ? (JSON.parse(text) as JsonApiResource) : null;
  } catch {
    return null;
  }
}

function linkOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
