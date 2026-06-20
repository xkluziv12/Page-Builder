import type { RunContext } from "../types";
import type { AIEngine, EngineResult } from "./types";

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

  private require(value: string | undefined, what: string): EngineResult {
    if (value == null || value.trim() === "") {
      throw new Error(
        `Replit mode requires operator-produced ${what}. The Replit Agent must produce the ${what} (see the operator run-book) before this phase can run.`,
      );
    }
    return { content: value, raw: value };
  }

  buildPage(_ctx: RunContext): Promise<EngineResult> {
    return Promise.resolve(this.require(this.content.build, "page HTML"));
  }

  auditPage(_ctx: RunContext, _currentHtml: string): Promise<EngineResult> {
    return Promise.resolve(this.require(this.content.audit, "audited HTML"));
  }

  generateSchema(_ctx: RunContext, _currentHtml: string): Promise<EngineResult> {
    return Promise.resolve(this.require(this.content.schema, "JSON-LD schema"));
  }

  chatEdit(_ctx: RunContext, _currentHtml: string, _instruction: string): Promise<EngineResult> {
    return Promise.resolve(this.require(this.content.chat, "edited HTML"));
  }
}
