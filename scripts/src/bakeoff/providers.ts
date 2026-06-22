import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { EngineResult } from "@workspace/mc-core";

/**
 * A provider-agnostic completion: takes a system + user prompt and returns the
 * model's text as an {@link EngineResult}. This is the ONLY provider-specific
 * surface in the bake-off — everything above it (prompts, context formatting,
 * the AIEngine seam) is the exact production code path from `@workspace/mc-core`.
 *
 * These adapters live here in the scripts package, NOT in `lib/mc-core`, so the
 * shipped pipeline engine stays Claude-only.
 *
 * Every adapter calls the provider DIRECTLY with STS's own API key — Claude via
 * ANTHROPIC_API_KEY, Gemini via GEMINI_API_KEY, OpenAI via OPENAI_API_KEY, and
 * Grok via XAI_API_KEY against xAI's own endpoint. No Replit AI-Integrations
 * proxy and no OpenRouter are used anywhere in the bake-off.
 */
export type CompleteFn = (system: string, user: string) => Promise<EngineResult>;

/** Generous output budget — full SEO pages run well past the default limits. */
const MAX_OUTPUT_TOKENS = 32000;

/** xAI's OpenAI-compatible endpoint. */
const XAI_BASE_URL = "https://api.x.ai/v1";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`${name} is not set; add STS's own API key before running the bake-off.`);
  }
  return v;
}

/** Strip a leading/trailing ```html / ```json code fence if present. */
function unfence(raw: string): string {
  const fence = raw.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence && fence[1]) return fence[1].trim();
  return raw.trim();
}

/** Claude direct, with STS's own ANTHROPIC_API_KEY. */
export function makeClaudeComplete(model: string): CompleteFn {
  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return async (system, user) => {
    // Stream: the Anthropic SDK refuses non-streaming requests whose token
    // budget could push the call past 10 minutes (full SEO pages are large).
    const stream = client.messages.stream({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    const message = await stream.finalMessage();
    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw };
  };
}

/** Gemini direct, with STS's own GEMINI_API_KEY. */
export function makeGeminiComplete(model: string): CompleteFn {
  const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  return async (system, user) => {
    const resp = await ai.models.generateContent({
      model,
      contents: user,
      config: { systemInstruction: system, maxOutputTokens: MAX_OUTPUT_TOKENS },
    });
    const raw = (resp.text ?? "").trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw };
  };
}

/**
 * OpenAI flagship general model direct, with STS's own OPENAI_API_KEY.
 * The gpt-5 series rejects `temperature` and uses `max_completion_tokens`
 * instead of `max_tokens`. The caller pins the flagship general tag (NOT Codex).
 */
export function makeOpenAIComplete(model: string): CompleteFn {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return async (system, user) => {
    const resp = await client.chat.completions.create({
      model,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const raw = (resp.choices[0]?.message?.content ?? "").trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw };
  };
}

/** Grok direct via xAI's OpenAI-compatible endpoint, with STS's own XAI_API_KEY. */
export function makeGrokComplete(model: string): CompleteFn {
  const client = new OpenAI({ apiKey: requireEnv("XAI_API_KEY"), baseURL: XAI_BASE_URL });
  return async (system, user) => {
    const resp = await client.chat.completions.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const raw = (resp.choices[0]?.message?.content ?? "").trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw };
  };
}

/**
 * Discover the newest general xAI Grok tag from xAI's own /models endpoint at
 * runtime. Picks the most-recently-created `grok-<version>` id, excluding
 * specialized variants (reasoning / non-reasoning / multi-agent / build /
 * imagine / image / video / code). Fails loudly if none exist rather than
 * guessing a tag.
 */
export async function discoverNewestGrok(): Promise<string> {
  const res = await fetch(`${XAI_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${requireEnv("XAI_API_KEY")}` },
  });
  if (!res.ok) {
    throw new Error(`xAI models list failed (${res.status} ${res.statusText}).`);
  }
  const data = (await res.json()) as { data: Array<{ id: string; created: number }> };
  const candidates = data.data
    .filter(
      (m) =>
        /^grok-\d/.test(m.id) &&
        !/(multi-agent|build|imagine|image|video|reasoning|code)/i.test(m.id),
    )
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  if (candidates.length === 0) {
    throw new Error("No general grok model is available from xAI.");
  }
  return candidates[0]!.id;
}
