import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

/**
 * Judge completions WITH live web search/fetch enabled per provider — the user
 * explicitly wants each judge to research Reddit/forums before auditing. Every
 * provider's native server-side search tool is wired:
 *   - Anthropic  → web_search_20250305 tool (Sonnet 4.6, Opus 4.8)
 *   - OpenAI     → Responses API `web_search` tool, background+poll (GPT-5.5, -pro)
 *   - Gemini     → googleSearch grounding tool (Gemini 3.1 Pro)
 *   - Grok/xAI   → Responses API `web_search` tool (Grok 4.3)
 * All confirmed live by probe. A judge whose search genuinely doesn't fire is
 * still recorded (searchUsed=false) rather than dropped, and reported honestly.
 */

export type JudgeProvider = "anthropic" | "openai" | "gemini" | "grok";

export interface JudgeOutput {
  text: string;
  searchUsed: boolean;
}

const XAI_BASE_URL = "https://api.x.ai/v1";
const REQUEST_TIMEOUT_MS = Number(process.env.JUDGE_REQUEST_TIMEOUT_MS ?? 900_000);
const WALL_CLOCK_MS = REQUEST_TIMEOUT_MS + 60_000;
const MAX_OUTPUT_TOKENS = 20_000;
const OPENAI_MAX_OUTPUT_TOKENS = 40_000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is not set; cannot run the judge.`);
  return v;
}

async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function claudeJudge(model: string, prompt: string): Promise<JudgeOutput> {
  const client = new Anthropic({
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  const stream = client.messages.stream({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 } as any],
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const searchUsed = JSON.stringify(message.content).includes("web_search");
  if (!text) throw new Error(`${model} returned no text.`);
  return { text, searchUsed };
}

async function openAiJudge(model: string, prompt: string): Promise<JudgeOutput> {
  const client = new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  const isPro = model.toLowerCase().includes("pro");
  let resp = await client.responses.create({
    model,
    max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
    background: true,
    tools: [{ type: "web_search" } as any],
    ...(isPro ? { reasoning: { effort: "medium" as const } } : {}),
    input: [{ role: "user", content: prompt }],
  });
  while (resp.status === "queued" || resp.status === "in_progress") {
    await new Promise((r) => setTimeout(r, 5_000));
    resp = await client.responses.retrieve(resp.id);
  }
  if (resp.status !== "completed") {
    throw new Error(
      `${model} background run ended as ${resp.status ?? "unknown"}: ${
        resp.error?.message ?? resp.incomplete_details?.reason ?? "no detail"
      }`,
    );
  }
  const text = (resp.output_text ?? "").trim();
  const searchUsed = JSON.stringify(resp.output ?? []).toLowerCase().includes("web_search");
  if (!text) throw new Error(`${model} returned no text.`);
  return { text, searchUsed };
}

async function geminiJudge(model: string, prompt: string): Promise<JudgeOutput> {
  const ai = new GoogleGenAI({
    apiKey: requireEnv("GEMINI_API_KEY"),
    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
  });
  const resp = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { tools: [{ googleSearch: {} }], maxOutputTokens: MAX_OUTPUT_TOKENS },
  });
  const gm = (resp as any).candidates?.[0]?.groundingMetadata;
  const text = (resp.text ?? "").trim();
  if (!text) throw new Error(`${model} returned no text.`);
  return { text, searchUsed: !!gm };
}

async function grokJudge(model: string, prompt: string): Promise<JudgeOutput> {
  const client = new OpenAI({
    apiKey: requireEnv("XAI_API_KEY"),
    baseURL: XAI_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  let resp = await client.responses.create({
    model,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    tools: [{ type: "web_search" } as any],
    input: [{ role: "user", content: prompt }],
  });
  // xAI's Responses surface may return a pending status; poll if so.
  let guard = 0;
  while ((resp.status === "queued" || resp.status === "in_progress") && guard++ < 240) {
    await new Promise((r) => setTimeout(r, 5_000));
    resp = await client.responses.retrieve(resp.id);
  }
  const text = (resp.output_text ?? "").trim();
  const searchUsed = JSON.stringify(resp.output ?? []).toLowerCase().includes("web_search");
  if (!text) throw new Error(`${model} returned no text (status ${resp.status ?? "unknown"}).`);
  return { text, searchUsed };
}

export async function runJudge(
  provider: JudgeProvider,
  model: string,
  prompt: string,
): Promise<JudgeOutput> {
  const fn =
    provider === "anthropic"
      ? claudeJudge
      : provider === "openai"
        ? openAiJudge
        : provider === "gemini"
          ? geminiJudge
          : grokJudge;
  return withTimeout(fn(model, prompt), WALL_CLOCK_MS, `${model} judge`);
}
