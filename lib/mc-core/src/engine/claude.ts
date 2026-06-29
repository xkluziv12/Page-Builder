import type Anthropic from "@anthropic-ai/sdk";
import { PromptCompletionEngine, extractContent } from "./base";
import { requestTimeoutMs, withTimeout } from "./transport";
import type { EngineResult } from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 16000;

/** Re-exported for callers/tests that imported it from this module. */
export { extractContent };

/** Extract plain text from an Anthropic message response. */
function textFrom(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * The Claude implementation of the AIEngine seam. It owns ALL Anthropic-specific
 * concerns (model name, client call, response parsing); the shared prompt
 * selection and per-phase user wording live in {@link PromptCompletionEngine}.
 * The pipeline talks to it only through the AIEngine interface.
 */
export class ClaudeEngine extends PromptCompletionEngine {
  readonly name = "claude";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(client: Anthropic, model: string = DEFAULT_MODEL) {
    super();
    this.client = client;
    this.model = model;
  }

  protected async complete(system: string, user: string): Promise<EngineResult> {
    const raw = await withTimeout(
      async (signal) => {
        const message = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: MAX_TOKENS,
            system,
            messages: [{ role: "user", content: user }],
          },
          { signal },
        );
        return textFrom(message);
      },
      requestTimeoutMs(),
      `claude (${this.model})`,
    );
    return { content: extractContent(raw), raw };
  }
}
