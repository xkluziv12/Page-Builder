import type { GoogleGenAI } from "@google/genai";
import { PromptCompletionEngine, extractContent } from "./base";
import type { EngineResult } from "./types";

const DEFAULT_MODEL = "gemini-3.1-pro-preview";

/** Generous output budget — full SEO pages run well past the default limits. */
const MAX_OUTPUT_TOKENS = 32000;

/**
 * The Gemini implementation of the AIEngine seam, via the `@google/genai` SDK.
 * The phase's system prompt maps to `config.systemInstruction`, the user message
 * to a single `contents` turn (Gemini uses a `parts` array). The shared prompt
 * selection lives in {@link PromptCompletionEngine}.
 */
export class GeminiEngine extends PromptCompletionEngine {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(client: GoogleGenAI, model: string = DEFAULT_MODEL) {
    super();
    this.client = client;
    this.model = model;
  }

  protected async complete(system: string, user: string): Promise<EngineResult> {
    const resp = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: user }] }],
      config: {
        systemInstruction: system,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });
    const raw = (resp.text ?? "").trim();
    if (!raw) throw new Error(`${this.model} returned an empty response.`);
    return { content: extractContent(raw), raw };
  }
}
