import type { RunContext } from "../types";
import {
  auditPagePrompt,
  buildPagePrompt,
  pageBuilderPrompt,
  schemaPrompt,
  verifyPrompt,
} from "../prompts";
import { describeContext } from "./context";
import type { AIEngine, ChatTurn, EngineResult } from "./types";

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
 *
 * This is provider-agnostic on purpose: every engine emits the same prompt
 * format, so every engine parses its response the same way.
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
 * Shared base for every model-backed {@link AIEngine}. It owns the prompt
 * selection and the exact user-message wording for each phase, so that ALL
 * engines (Claude, OpenAI, Gemini) drive the pipeline with byte-identical
 * prompts — the only difference between engines is the provider call itself.
 *
 * A concrete engine implements just {@link complete}: take a system + user
 * message, call its provider, and return the parsed {@link EngineResult}. This
 * keeps the per-provider surface tiny and guarantees parity across engines,
 * which is what the checker suite / parity gates downstream assume.
 *
 * The operator-driven {@link ReplitEngine} does NOT extend this — it never calls
 * a model and has no prompts to share.
 */
export abstract class PromptCompletionEngine implements AIEngine {
  abstract readonly name: string;

  /** Provider-specific completion: send system + user, return parsed result. */
  protected abstract complete(system: string, user: string): Promise<EngineResult>;

  buildPage(ctx: RunContext): Promise<EngineResult> {
    const { system, user } = buildPagePrompt(ctx);
    return this.complete(system, user);
  }

  auditPage(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    const { system, user } = auditPagePrompt(ctx, currentHtml);
    return this.complete(system, user);
  }

  generateSchema(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    const { system, user } = schemaPrompt(ctx, currentHtml);
    return this.complete(system, user);
  }

  /**
   * VERIFY — a closing link/compliance self-check that ends on an explicit
   * ✅ VERIFIED / ❌ FAILED verdict (see {@link verifyPrompt}). Additive: the
   * legacy pipeline had no verify turn, so there is no byte-for-byte baseline to
   * preserve. The {@link RoutedEngine} drives the verdict + corrective re-verify
   * loop on top of this; a bare engine simply returns one verify turn.
   */
  verifyPage(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    const { system, user } = verifyPrompt(ctx, currentHtml);
    return this.complete(system, user);
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
