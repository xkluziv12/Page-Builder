import type OpenAI from "openai";
import { PromptCompletionEngine, extractContent } from "./base";
import type { EngineResult } from "./types";

const DEFAULT_MODEL = "gpt-5.4";

/**
 * Generous output budget. OpenAI bills hidden reasoning tokens against the same
 * output budget as the visible answer, so a full ~46K-char page PLUS its
 * reasoning trace needs a much larger cap than the visible-only models — too low
 * and the page truncates mid-build. The cap only sets headroom; unused tokens
 * are never billed.
 */
const MAX_OUTPUT_TOKENS = 64000;

/** Poll interval while a background response is still running. */
const POLL_INTERVAL_MS = 5000;

/**
 * The OpenAI implementation of the AIEngine seam (gpt-5.x), via the Responses
 * API. The gpt-5.x tier is served by `responses` (the `chat/completions`
 * endpoint 404s for the "pro" reasoning tier), so the engine uses it uniformly:
 * the phase's system prompt maps to `instructions`, the user message to an
 * `input` item, and the budget to `max_output_tokens` (which also covers hidden
 * reasoning tokens). The shared prompt selection lives in
 * {@link PromptCompletionEngine}.
 *
 * Builds are submitted as BACKGROUND jobs and polled to completion: the
 * synchronous Responses endpoint enforces a server-side processing window that a
 * heavy full page-build turn routinely exceeds ("Request timed out" regardless
 * of the client timeout). Background mode lifts that server-side cap.
 */
export class OpenAIEngine extends PromptCompletionEngine {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(client: OpenAI, model: string = DEFAULT_MODEL) {
    super();
    this.client = client;
    this.model = model;
  }

  protected async complete(system: string, user: string): Promise<EngineResult> {
    let resp = await this.client.responses.create({
      model: this.model,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      background: true,
      instructions: system,
      input: [{ role: "user", content: user }],
    });
    while (resp.status === "queued" || resp.status === "in_progress") {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      resp = await this.client.responses.retrieve(resp.id);
    }
    if (resp.status !== "completed") {
      throw new Error(
        `${this.model} background run ended as ${resp.status ?? "unknown"}: ${
          resp.error?.message ?? resp.incomplete_details?.reason ?? "no detail"
        }`,
      );
    }
    const raw = (resp.output_text ?? "").trim();
    if (!raw) throw new Error(`${this.model} returned an empty response.`);
    return { content: extractContent(raw), raw };
  }
}
