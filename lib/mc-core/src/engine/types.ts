import type { RunContext } from "../types";

export interface EngineResult {
  /** The primary artifact (HTML, JSON-LD, or edited HTML). */
  content: string;
  /** The raw, unprocessed model output (for debugging / audit trail). */
  raw: string;
}

/** A single prior turn of the AI-edit conversation, fed back for memory. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The AI-engine seam. The pipeline depends ONLY on this interface — it never
 * imports Claude (or any provider) directly. A future "Replit mode" engine
 * implements the same interface and slots in with zero pipeline changes.
 */
export interface AIEngine {
  readonly name: string;
  buildPage(ctx: RunContext): Promise<EngineResult>;
  auditPage(ctx: RunContext, currentHtml: string): Promise<EngineResult>;
  generateSchema(ctx: RunContext, currentHtml: string): Promise<EngineResult>;
  chatEdit(
    ctx: RunContext,
    currentHtml: string,
    instruction: string,
    history?: ChatTurn[],
  ): Promise<EngineResult>;
}
