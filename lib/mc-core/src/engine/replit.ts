import type { RunContext } from "../types";
import type { AIEngine, EngineResult } from "./types";
import { makeProvenance, type Provenance } from "./provenance";

/**
 * Optional operator-confirmed detail about how the Replit Agent actually
 * produced the content (e.g. "Gemini Flash via direct API", "DeepSeek via
 * Claude CLI"). The VA/operator supplies this at submission time; if omitted,
 * the phase is recorded as replit-agent/operator-input with provider/model
 * left unrecorded rather than guessed.
 */
export interface ReplitExecutionSource {
  sourceKind?: Provenance["sourceKind"];
  transport?: Provenance["transport"];
  provider?: string | null;
  model?: string | null;
}

/**
 * Operator-produced artifacts for a Replit-mode run. Each field is the output
 * the Replit Agent built for the corresponding phase. Only the field for the
 * phase being executed needs to be present.
 */
export interface ReplitEngineContent {
  /** HTML produced by the Agent for the Build phase. */
  build?: string;
  /** HTML produced by the Agent for the Audit phase. */
  audit?: string;
  /** JSON-LD produced by the Agent for the Schema phase. */
  schema?: string;
  /** HTML produced by the Agent for a surgical chat edit. */
  chat?: string;
  /**
   * Operator-confirmed execution source for this submission. Applies to
   * whichever phase method actually runs (a Replit submission is one phase at
   * a time). Defaults to replit-agent/operator-input when omitted.
   */
  source?: ReplitExecutionSource;
}

/**
 * The "Replit mode" engine. It implements the same AIEngine seam as
 * {@link ClaudeEngine}, but it does NOT call an external model API: a human
 * operator drives Replit's own Agent, which produces the artifact. The operator
 * submits that artifact and this engine simply returns it into the SAME pipeline
 * — same checkers, same persistence, same parity gates — as Dashboard mode.
 *
 * Each method requires its content to have been supplied; calling a method
 * without operator-produced content throws, so a blank/empty page can never slip
 * through the pipeline.
 */
export class ReplitEngine implements AIEngine {
  readonly name = "replit";
  private readonly content: ReplitEngineContent;

  constructor(content: ReplitEngineContent = {}) {
    this.content = content;
  }

  private require(value: string | undefined, what: string, phase: string): EngineResult {
    if (value == null || value.trim() === "") {
      throw new Error(
        `Replit mode requires operator-produced ${what}. The Replit Agent must produce the ${what} (see the operator run-book) before this phase can run.`,
      );
    }
    const src = this.content.source;
    const now = new Date().toISOString();
    return {
      content: value,
      raw: value,
      // Never inferred as direct-api: this is always operator-submitted
      // content, even when the operator confirms a specific provider/model
      // was used behind the scenes (e.g. Gemini via Claude CLI).
      provenance: makeProvenance({
        sourceKind: src?.sourceKind ?? "replit-agent",
        provider: src?.provider ?? null,
        model: src?.model ?? null,
        transport: src?.transport ?? "operator-paste",
        requestedEngine: "replit",
        engineMode: "replit",
        phase,
        candidate: "none",
        status: "success",
        startedAt: now,
        completedAt: now,
      }),
    };
  }

  buildPage(_ctx: RunContext): Promise<EngineResult> {
    return Promise.resolve(this.require(this.content.build, "page HTML", "build"));
  }

  auditPage(_ctx: RunContext, _currentHtml: string): Promise<EngineResult> {
    return Promise.resolve(this.require(this.content.audit, "audited HTML", "audit"));
  }

  generateSchema(_ctx: RunContext, _currentHtml: string): Promise<EngineResult> {
    return Promise.resolve(this.require(this.content.schema, "JSON-LD schema", "schema"));
  }

  chatEdit(_ctx: RunContext, _currentHtml: string, _instruction: string): Promise<EngineResult> {
    return Promise.resolve(this.require(this.content.chat, "edited HTML", "chat"));
  }
}
