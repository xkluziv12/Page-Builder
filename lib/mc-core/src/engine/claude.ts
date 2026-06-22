import type Anthropic from "@anthropic-ai/sdk";
import type { RunContext } from "../types";
import { pageBuilderPrompt, schemaGeneratorPrompt, seoAuditPrompt } from "../prompts";
import { describeContext } from "./context";
import type { AIEngine, ChatTurn, EngineResult } from "./types";

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

/**
 * Extract the usable artifact (HTML or JSON) from a model response. The
 * page-builder and SEO-audit prompts return a long human-readable report (gate
 * checklist, deltas, Joomla META) FOLLOWED by the final artifact, so the whole
 * response is NOT the artifact. Without this, the report text was being stored
 * as the page HTML and rendered on top of the live preview. Preference order:
 *   1. Contents of the first fenced code block (```html / ```json / ```), where
 *      the prompts place the final artifact.
 *   2. A raw HTML document sliced from <!doctype html> (or <html>) through
 *      </html>, for responses that emit the document without a fence.
 *   3. The trimmed raw text (e.g. bare JSON schema with no fence).
 */
export function extractContent(raw: string): string {
  const fence = raw.match(/```[a-z]*[ \t]*\r?\n?([\s\S]*?)```/i);
  if (fence && fence[1] && fence[1].trim()) return fence[1].trim();

  const docStart = raw.search(/<!doctype html|<html[\s>]/i);
  if (docStart !== -1) {
    const closeIdx = raw.toLowerCase().lastIndexOf("</html>");
    const end = closeIdx !== -1 ? closeIdx + "</html>".length : raw.length;
    return raw.slice(docStart, end).trim();
  }

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
    return { content: extractContent(raw), raw };
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

  chatEdit(
    ctx: RunContext,
    currentHtml: string,
    instruction: string,
    history: ChatTurn[] = [],
  ): Promise<EngineResult> {
    const convo = history.length
      ? `\n\nConversation so far (most recent last — use it as memory of prior edits and intent):\n${history
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n")}`
      : "";
    return this.complete(
      pageBuilderPrompt,
      `Apply this edit instruction to the page and return the full updated HTML.\n\nInstruction:\n${instruction}\n\nContext:\n${describeContext(
        ctx,
      )}${convo}\n\nCurrent HTML:\n${currentHtml}`,
    );
  }
}
