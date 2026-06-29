import { parseSchema } from "../schema/generator";
import type { EngineResult } from "./types";

/**
 * Model-orchestration transport helpers shared by the model-backed engines and
 * the {@link RoutedEngine}. These mirror the strengths the multi-LLM bake-off
 * harness proved out (timeouts that abort in-flight requests, refusal/empty/
 * malformed-output detection, an explicit ✅/❌ verification verdict) and bring
 * them to Mission Control's Dashboard path. The logic is RE-IMPLEMENTED here (the
 * bake-off lives in `scripts/` and a lib must not depend on a leaf package); it
 * is a behavioural port, not an import.
 *
 * This is transport/plumbing only — it touches NO prompt text and NO checker
 * quality gate.
 */

/** Per-request wall-clock budget. A timeout ABORTS the in-flight request. */
export function requestTimeoutMs(): number {
  const v = Number(process.env.MC_REQUEST_TIMEOUT_MS ?? 600_000);
  return Number.isFinite(v) && v > 0 ? v : 600_000;
}

/** Attempts per candidate model before falling back / failing loud. */
export function maxAttempts(): number {
  const v = Number(process.env.MC_MAX_ATTEMPTS ?? 2);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 2;
}

/** Corrective re-verify attempts after an initial non-passing verify verdict. */
export function verifyCorrections(): number {
  const v = Number(process.env.MC_VERIFY_CORRECTIONS ?? 1);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 1;
}

/**
 * Run `work` under a wall-clock budget. On timeout the provided AbortSignal is
 * fired so the engine ABORTS the in-flight provider request (and stops any
 * background poll loop) instead of leaking a request that keeps running/billing.
 */
export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await work(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${ms}ms (aborted the in-flight request).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** A sleep that rejects the moment its AbortSignal fires (used between polls). */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort);
  });
}

/**
 * A wrong-model STOP or explicit refusal to proceed/build. Treated as invalid
 * output (→ retry / backup / fail loud) uniformly across every model — never
 * special-cased per provider.
 */
export const REFUSAL_RE =
  /🚫|wrong model|cannot proceed|can'?t proceed|unable to proceed|(will not|won'?t) (proceed|build|continue|create)|cannot continue|can'?t continue|i (cannot|can'?t) build|refuse to (proceed|build|continue)/i;

/** True when the raw model output is empty/whitespace or a STOP/refusal. */
export function isEmptyOrRefusal(raw: string): boolean {
  if (!raw || !raw.trim()) return true;
  return REFUSAL_RE.test(raw);
}

/**
 * True when `content` looks like a real HTML document (the build/audit/chat
 * phases must emit a full page, not a fragment or a prose-only reply). A missing
 * HTML document is treated as invalid output.
 */
export function looksLikeHtmlDocument(content: string): boolean {
  return /<!doctype html|<html[\s>]/i.test(content);
}

/** The artifact a phase is expected to produce. */
export type ArtifactKind = "html" | "json";

/**
 * The routed output validator. Returns false for the cases the bake-off treats
 * as "invalid" so they can never be accepted as success: an empty response, a
 * refusal, a missing required HTML document, or un-parseable JSON-LD.
 */
export function isValidEngineOutput(result: EngineResult, kind: ArtifactKind): boolean {
  if (isEmptyOrRefusal(result.raw)) return false;
  if (!result.content || !result.content.trim()) return false;
  if (kind === "html") return looksLikeHtmlDocument(result.content);
  return parseSchema(result.content) !== null;
}

const VERDICT_PASS = /✅\s*VERIFIED|VERIFIED\s*[—-]\s*Proceed to publish/i;
const VERDICT_FAIL = /❌\s*FAILED|FAILED\s*[—-]/i;

function lastMatchIndex(raw: string, re: RegExp): number {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let idx = -1;
  let m: RegExpExecArray | null;
  while ((m = global.exec(raw)) !== null) {
    idx = m.index;
    if (m.index === global.lastIndex) global.lastIndex++;
  }
  return idx;
}

/**
 * Parse the verify turn's explicit ✅ VERIFIED / ❌ FAILED verdict. The LATER of
 * the two markers wins (so a quoted rubric never overrides the model's final
 * line). Returns null when neither marker is present — a null verdict is NOT a
 * pass; the caller must treat it as unverified.
 */
export function readVerdict(raw: string): "passed" | "failed" | null {
  const passIdx = lastMatchIndex(raw, VERDICT_PASS);
  const failIdx = lastMatchIndex(raw, VERDICT_FAIL);
  if (passIdx === -1 && failIdx === -1) return null;
  return failIdx > passIdx ? "failed" : "passed";
}
