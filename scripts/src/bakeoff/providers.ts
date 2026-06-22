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
 */
export type CompleteFn = (system: string, user: string) => Promise<EngineResult>;

/** Generous output budget — full SEO pages run well past the default limits. */
const MAX_OUTPUT_TOKENS = 32000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`${name} is not set; provision the AI integration before running the bake-off.`);
  }
  return v;
}

/** Strip a leading/trailing ```html / ```json code fence if present. */
function unfence(raw: string): string {
  const fence = raw.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence && fence[1]) return fence[1].trim();
  return raw.trim();
}

/** Claude through the Replit AI Integrations Anthropic proxy. */
export function makeClaudeComplete(model: string): CompleteFn {
  const client = new Anthropic({
    apiKey: requireEnv("AI_INTEGRATIONS_ANTHROPIC_API_KEY"),
    baseURL: requireEnv("AI_INTEGRATIONS_ANTHROPIC_BASE_URL"),
  });
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

/** Gemini through the Replit AI Integrations Gemini proxy. */
export function makeGeminiComplete(model: string): CompleteFn {
  const ai = new GoogleGenAI({
    apiKey: requireEnv("AI_INTEGRATIONS_GEMINI_API_KEY"),
    httpOptions: {
      apiVersion: "",
      baseUrl: requireEnv("AI_INTEGRATIONS_GEMINI_BASE_URL"),
    },
  });
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
 * OpenAI flagship general model through the Replit AI Integrations OpenAI proxy.
 * The gpt-5 series rejects `temperature` and uses `max_completion_tokens`
 * instead of `max_tokens`. The proxy does not expose `/models`, so the flagship
 * tag is pinned by the caller (general model, NOT Codex).
 */
export function makeOpenAIComplete(model: string): CompleteFn {
  const client = new OpenAI({
    apiKey: requireEnv("AI_INTEGRATIONS_OPENAI_API_KEY"),
    baseURL: requireEnv("AI_INTEGRATIONS_OPENAI_BASE_URL"),
  });
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

/** Any OpenRouter chat model (here: xAI Grok) through the OpenRouter proxy. */
export function makeOpenRouterComplete(model: string): CompleteFn {
  const client = new OpenAI({
    apiKey: requireEnv("AI_INTEGRATIONS_OPENROUTER_API_KEY"),
    baseURL: requireEnv("AI_INTEGRATIONS_OPENROUTER_BASE_URL"),
  });
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
 * Discover the newest general xAI Grok tag on OpenRouter at runtime. Picks the
 * most-recently-created `x-ai/grok-<version>` id, excluding specialized variants
 * (multi-agent / build). Fails loudly if none exist rather than guessing a tag.
 */
export async function discoverNewestGrok(): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) {
    throw new Error(`OpenRouter models list failed (${res.status} ${res.statusText}).`);
  }
  const data = (await res.json()) as { data: Array<{ id: string; created: number }> };
  const candidates = data.data
    .filter((m) => /^x-ai\/grok-\d/.test(m.id) && !/(multi-agent|build)/i.test(m.id))
    .sort((a, b) => b.created - a.created);
  if (candidates.length === 0) {
    throw new Error("No x-ai/grok model is available on OpenRouter.");
  }
  return candidates[0]!.id;
}
