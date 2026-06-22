import type Anthropic from "@anthropic-ai/sdk";
import type { RunContext } from "../types";
import { pageBuilderPrompt, schemaGeneratorPrompt, seoAuditPrompt } from "../prompts";
import { describeContext } from "./context";
import type { AIEngine, EngineResult } from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 16000;

/** Extract plain text from an Anthropic message response. */
function textFrom(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Strip a leading/trailing ```html / ```json code fence if present. */
function unfence(raw: string): string {
  const fence = raw.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence && fence[1]) return fence[1].trim();
  return raw.trim();
}

/**
 * The Claude implementation of the AIEngine seam. It owns ALL Anthropic-specific
 * concerns (model name, prompt selection, response parsing). The pipeline talks
 * to it only through the AIEngine interface.
 */
export class ClaudeEngine implements AIEngine {
  readonly name = "claude";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(client: Anthropic, model: string = DEFAULT_MODEL) {
    this.client = client;
    this.model = model;
  }

  private async complete(system: string, user: string): Promise<EngineResult> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    const raw = textFrom(message);
    return { content: unfence(raw), raw };
  }

  buildPage(ctx: RunContext): Promise<EngineResult> {
    return this.complete(
      pageBuilderPrompt,
      `Build the page for the following job:\n\n${describeContext(ctx)}`,
    );
  }

  auditPage(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    return this.complete(
      seoAuditPrompt,
      `Audit and improve the following page. Return the full corrected HTML.\n\nContext:\n${describeContext(
        ctx,
      )}\n\nCurrent HTML:\n${currentHtml}`,
    );
  }

  generateSchema(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    return this.complete(
      schemaGeneratorPrompt,
      `Generate JSON-LD schema for the following page.\n\nContext:\n${describeContext(
        ctx,
      )}\n\nPage HTML:\n${currentHtml}`,
    );
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
