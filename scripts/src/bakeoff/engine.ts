import {
  describeContext,
  generateLocalBusinessSchema,
  pageBuilderPrompt,
  seoAuditPrompt,
  type AIEngine,
  type EngineResult,
  type RunContext,
} from "@workspace/mc-core";
import { extractHtmlDocument } from "./extract";
import type { CompleteFn } from "./providers";

/**
 * A provider-agnostic {@link AIEngine}. It reuses the EXACT production prompts
 * and context formatting from `@workspace/mc-core` (the same `describeContext`
 * the shipped ClaudeEngine uses) and only swaps the underlying completion call.
 * This keeps the bake-off an apples-to-apples comparison: the prompt is the
 * controlled variable; the model is the independent variable.
 */
export class GenericLlmEngine implements AIEngine {
  readonly name: string;
  private readonly complete: CompleteFn;

  constructor(name: string, complete: CompleteFn) {
    this.name = name;
    this.complete = complete;
  }

  async buildPage(ctx: RunContext): Promise<EngineResult> {
    const r = await this.complete(
      pageBuilderPrompt,
      `Build the page for the following job:\n\n${describeContext(ctx)}`,
    );
    return { content: extractHtmlDocument(r.raw, `${this.name} build`), raw: r.raw };
  }

  async auditPage(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    const r = await this.complete(
      seoAuditPrompt,
      `Audit and improve the following page. Return the full corrected HTML.\n\nContext:\n${describeContext(
        ctx,
      )}\n\nCurrent HTML:\n${currentHtml}`,
    );
    return { content: extractHtmlDocument(r.raw, `${this.name} audit`), raw: r.raw };
  }

  /**
   * No-GMB schema is generated DETERMINISTICALLY — exactly what the VA's
   * "Auto-Generate Schema (deterministic — no AI needed)" button does in the
   * old No-GMB checklist. City/state targeting only, NO CID, NO street address.
   * It is identical across models by design, so it is not a model differentiator.
   */
  generateSchema(ctx: RunContext, _currentHtml: string): Promise<EngineResult> {
    return Promise.resolve({
      content: generateLocalBusinessSchema(ctx),
      raw: "Deterministic No-GMB schema via generateLocalBusinessSchema — same path as the VA's Auto-Generate Schema button (no AI).",
    });
  }

  chatEdit(ctx: RunContext, currentHtml: string, instruction: string): Promise<EngineResult> {
    return this.complete(
      pageBuilderPrompt,
      `Apply this edit instruction to the page and return the full updated HTML.\n\nInstruction:\n${instruction}\n\nContext:\n${describeContext(
        ctx,
      )}\n\nCurrent HTML:\n${currentHtml}`,
    );
  }
}
