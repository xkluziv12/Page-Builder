import type { RunContext } from "../types";
import type { PromptCompletionEngine } from "./base";
import type { AIEngine, ChatTurn, EngineResult } from "./types";
import {
  isEmptyOrRefusal,
  isValidEngineOutput,
  looksLikeHtmlDocument,
  maxAttempts as defaultMaxAttempts,
  readVerdict,
  verifyCorrections as defaultVerifyCorrections,
} from "./transport";

/** The phases the routed engine can target with its own main/backup pair. */
export type RoutedPhase = "build" | "audit" | "schema" | "verify" | "chat";

/** A single phase's model routing: a required main and an optional backup. */
export interface PhaseRoute {
  main: PromptCompletionEngine;
  /** Falls back here when the main model exhausts its attempts. Optional. */
  backup?: PromptCompletionEngine;
}

/** The full per-phase routing table consumed by {@link RoutedEngine}. */
export type RoutedRouting = Record<RoutedPhase, PhaseRoute>;

/** A single routed-engine event, surfaced to the run log via the `log` callback. */
export interface RoutedEngineEvent {
  phase: RoutedPhase;
  model: string;
  candidate: "main" | "backup";
  attempt: number;
  status: "ok" | "invalid" | "error" | "fallback";
  message?: string;
}

export interface RoutedEngineOptions {
  routing: RoutedRouting;
  /** Attempts per candidate before falling back. Defaults to MC_MAX_ATTEMPTS. */
  maxAttempts?: number;
  /** Corrective re-verify attempts. Defaults to MC_VERIFY_CORRECTIONS. */
  verifyCorrections?: number;
  /** Surfaces retries / fallbacks / fail-loud to the run log (no console in lib). */
  log?: (event: RoutedEngineEvent) => void;
  /** Provenance name. Defaults to the build-phase main engine's name. */
  name?: string;
}

/**
 * Run the verify turn (+ at most `maxCorrections` corrective re-verifies) until
 * the model emits an explicit ✅ VERIFIED verdict. A FAILED or a missing (null)
 * verdict triggers a corrective re-verify; if no clear ✅ verdict is reached
 * after the cap, this FAILS LOUD rather than letting an unverified page through.
 * A null verdict NEVER counts as a pass.
 *
 * Pulled out as a pure function (the verify turn is injected) so the no-verdict
 * fail-loud path is cheaply unit-testable without any provider call.
 */
export async function runCorrectiveVerify(
  verifyTurn: (html: string) => Promise<EngineResult>,
  html: string,
  maxCorrections: number,
): Promise<EngineResult> {
  let current = html;
  let lastVerdict: "passed" | "failed" | null = null;
  let lastRaw = "";
  const turns = Math.max(1, maxCorrections + 1);
  for (let turn = 0; turn < turns; turn++) {
    const res = await verifyTurn(current);
    lastRaw = res.raw;
    // The verify turn may re-emit fixed HTML; adopt it for the next pass / output.
    if (looksLikeHtmlDocument(res.content)) current = res.content;
    lastVerdict = readVerdict(res.raw);
    if (lastVerdict === "passed") return { content: current, raw: lastRaw };
    // failed or null → corrective re-verify on the next turn (if any remain)
  }
  throw new Error(
    `Verification did not reach an explicit ✅ VERIFIED verdict after ${maxCorrections} ` +
      `corrective re-verify attempt(s) (final verdict: ` +
      `${lastVerdict === "failed" ? "❌ FAILED" : "none — no ✅/❌ line emitted"}). ` +
      `Halting rather than publishing an unverified page.`,
  );
}

/**
 * An {@link AIEngine} that adds the bake-off's model-orchestration strengths to
 * Mission Control's Dashboard path WITHOUT touching the orchestrator, the prompt
 * text, or the deterministic checker quality gates:
 *
 *   - per-phase model routing (each phase has its own main + optional backup),
 *   - per-call timeouts that abort in-flight requests (owned by the engines),
 *   - retry-under-cap then main→backup fallback,
 *   - output validation (empty / refusal / missing-HTML / invalid-JSON-LD are
 *     "invalid" and never accepted as success),
 *   - a verify + corrective-re-verify loop after audit that fails loud on no
 *     clear ✅ verdict.
 *
 * It wraps the SAME model-backed engines (Claude/OpenAI/Gemini) the pipeline
 * already used, so prompts stay byte-identical. Replit mode is operator-driven
 * and does not route through this engine.
 */
export class RoutedEngine implements AIEngine {
  readonly name: string;
  private readonly routing: RoutedRouting;
  private readonly attempts: number;
  private readonly corrections: number;
  private readonly log: (event: RoutedEngineEvent) => void;

  constructor(opts: RoutedEngineOptions) {
    this.routing = opts.routing;
    this.attempts = Math.max(1, opts.maxAttempts ?? defaultMaxAttempts());
    this.corrections = Math.max(0, opts.verifyCorrections ?? defaultVerifyCorrections());
    this.log = opts.log ?? (() => {});
    this.name = opts.name ?? opts.routing.build.main.name;
  }

  buildPage(ctx: RunContext): Promise<EngineResult> {
    return this.runWithFallback("build", (e) => e.buildPage(ctx), (r) =>
      isValidEngineOutput(r, "html"),
    );
  }

  async auditPage(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    const audited = await this.runWithFallback(
      "audit",
      (e) => e.auditPage(ctx, currentHtml),
      (r) => isValidEngineOutput(r, "html"),
    );
    // Corrective re-verify loop: a page that audits clean must still end on an
    // explicit ✅ verdict before it is handed back to the pipeline's checkers.
    return runCorrectiveVerify(
      (html) =>
        this.runWithFallback(
          "verify",
          (e) => e.verifyPage(ctx, html),
          // A verify turn is only valid output when it is a real, non-refusal
          // response AND it lands an explicit ✅/❌ verdict. A null verdict (no
          // ✅/❌ line) is treated as INVALID here so it triggers retry → main→
          // backup fallback immediately, exactly like empty/refusal output. A
          // clear ❌ FAILED is valid output (the model did verify) and is handed
          // to runCorrectiveVerify, which drives the corrective re-verify loop.
          (r) => !isEmptyOrRefusal(r.raw) && readVerdict(r.raw) !== null,
        ),
      audited.content,
      this.corrections,
    );
  }

  generateSchema(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    return this.runWithFallback("schema", (e) => e.generateSchema(ctx, currentHtml), (r) =>
      isValidEngineOutput(r, "json"),
    );
  }

  chatEdit(
    ctx: RunContext,
    currentHtml: string,
    instruction: string,
    history?: ChatTurn[],
  ): Promise<EngineResult> {
    return this.runWithFallback(
      "chat",
      (e) => e.chatEdit(ctx, currentHtml, instruction, history),
      (r) => isValidEngineOutput(r, "html"),
    );
  }

  /**
   * Run a phase against its main model with retry-under-cap, then fall back to
   * the backup model (if configured/distinct), validating each output. Invalid
   * output (empty/refusal/missing-HTML/invalid-JSON) is treated exactly like a
   * thrown error: it retries, then falls back, then fails loud. Never returns an
   * unvalidated result.
   */
  private async runWithFallback(
    phase: RoutedPhase,
    call: (engine: PromptCompletionEngine) => Promise<EngineResult>,
    validate: (result: EngineResult) => boolean,
  ): Promise<EngineResult> {
    const route = this.routing[phase];
    const candidates: Array<{ kind: "main" | "backup"; engine: PromptCompletionEngine }> = [
      { kind: "main", engine: route.main },
    ];
    if (route.backup && route.backup !== route.main) {
      candidates.push({ kind: "backup", engine: route.backup });
    }

    let lastError: unknown;
    for (const { kind, engine } of candidates) {
      if (kind === "backup") {
        this.log({
          phase,
          model: engine.name,
          candidate: "backup",
          attempt: 0,
          status: "fallback",
          message: `main (${route.main.name}) exhausted; falling back to ${engine.name}`,
        });
      }
      for (let attempt = 1; attempt <= this.attempts; attempt++) {
        try {
          const result = await call(engine);
          if (!validate(result)) {
            lastError = new Error(
              `${engine.name} ${phase} output is invalid (empty, refusal, missing HTML, or invalid JSON-LD).`,
            );
            this.log({
              phase,
              model: engine.name,
              candidate: kind,
              attempt,
              status: "invalid",
              message: (lastError as Error).message,
            });
            continue;
          }
          this.log({ phase, model: engine.name, candidate: kind, attempt, status: "ok" });
          return result;
        } catch (err) {
          lastError = err;
          this.log({
            phase,
            model: engine.name,
            candidate: kind,
            attempt,
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    const backupNote =
      route.backup && route.backup !== route.main ? ` and backup (${route.backup.name})` : "";
    throw new Error(
      `Routed ${phase} failed loud: main (${route.main.name})${backupNote} could not produce ` +
        `valid output after ${this.attempts} attempt(s) each. Last error: ${detail}`,
    );
  }
}
