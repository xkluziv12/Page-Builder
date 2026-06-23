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
 * Optional, harness-only tweaks for a scenario. `contextSuffix` is appended to
 * the production `describeContext` output (the prod path itself is never
 * touched) so an experimental enriched context — e.g. an explicit page_url +
 * GMB block — can be handed identically to every model. `schemaFn` overrides
 * the deterministic No-GMB schema for scenarios that carry GMB data.
 */
export interface EngineScenarioOptions {
  contextSuffix?: string;
  schemaFn?: (ctx: RunContext) => string;
  /**
   * Per-phase "mini prompt" the VA pastes alongside the master prompt in the
   * real checklist tool (forced-execution wrapper + "output only the HTML"
   * rule). When set, it replaces the generic phase instruction as the engine's
   * `user` message. Applied identically to every model in the scenario, so the
   * comparison stays apples-to-apples. Falls back to the generic instruction
   * when unset.
   */
  buildUser?: (ctx: RunContext, context: string) => string;
  auditUser?: (ctx: RunContext, context: string, currentHtml: string) => string;
}

/**
 * A provider-agnostic {@link AIEngine}. It reuses the EXACT production prompts
 * and context formatting from `@workspace/mc-core` (the same `describeContext`
 * the shipped ClaudeEngine uses) and only swaps the underlying completion call.
 * This keeps the bake-off an apples-to-apples comparison: the prompt is the
 * controlled variable; the model is the independent variable.
 *
 * A scenario may layer an extra `contextSuffix` on top of `describeContext`
 * (and an alternate `schemaFn`). The suffix is applied identically to every
 * model in that scenario, so it stays a fair comparison — it just changes which
 * inputs all models receive, not which prompt any single model sees.
 */
export class GenericLlmEngine implements AIEngine {
  readonly name: string;
  private readonly complete: CompleteFn;
  private readonly contextSuffix: string;
  private readonly schemaFn: (ctx: RunContext) => string;
  private readonly buildUser?: (ctx: RunContext, context: string) => string;
  private readonly auditUser?: (
    ctx: RunContext,
    context: string,
    currentHtml: string,
  ) => string;

  constructor(name: string, complete: CompleteFn, opts: EngineScenarioOptions = {}) {
    this.name = name;
    this.complete = complete;
    this.contextSuffix = opts.contextSuffix ?? "";
    this.schemaFn = opts.schemaFn ?? generateLocalBusinessSchema;
    this.buildUser = opts.buildUser;
    this.auditUser = opts.auditUser;
  }

  /** Production context plus any scenario-specific enrichment suffix. */
  private describe(ctx: RunContext): string {
    return `${describeContext(ctx)}${this.contextSuffix}`;
  }

  async buildPage(ctx: RunContext): Promise<EngineResult> {
    const context = this.describe(ctx);
    const user = this.buildUser
      ? this.buildUser(ctx, context)
      : `Build the page for the following job:\n\n${context}`;
    const r = await this.complete(pageBuilderPrompt, user);
    return { content: extractHtmlDocument(r.raw, `${this.name} build`), raw: r.raw };
  }

  async auditPage(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    const context = this.describe(ctx);
    const user = this.auditUser
      ? this.auditUser(ctx, context, currentHtml)
      : `Audit and improve the following page. Return the full corrected HTML.\n\nContext:\n${context}\n\nCurrent HTML:\n${currentHtml}`;
    const r = await this.complete(seoAuditPrompt, user);
    return { content: extractHtmlDocument(r.raw, `${this.name} audit`), raw: r.raw };
  }

  /**
   * No-GMB schema is generated DETERMINISTICALLY — exactly what the VA's
   * "Auto-Generate Schema (deterministic — no AI needed)" button does in the
   * old No-GMB checklist. City/state targeting only, NO CID, NO street address.
   * The GMB scenario swaps in a GMB-aware deterministic schema via `schemaFn`.
   * Either way it is identical across models by design, so it is not a model
   * differentiator.
   */
  generateSchema(ctx: RunContext, _currentHtml: string): Promise<EngineResult> {
    return Promise.resolve({
      content: this.schemaFn(ctx),
      raw: "Deterministic schema (same path as the VA's Auto-Generate Schema button — no AI).",
    });
  }

  chatEdit(ctx: RunContext, currentHtml: string, instruction: string): Promise<EngineResult> {
    return this.complete(
      pageBuilderPrompt,
      `Apply this edit instruction to the page and return the full updated HTML.\n\nInstruction:\n${instruction}\n\nContext:\n${this.describe(
        ctx,
      )}\n\nCurrent HTML:\n${currentHtml}`,
    );
  }
}
