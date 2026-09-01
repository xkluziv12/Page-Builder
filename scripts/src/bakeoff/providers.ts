import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { makeProvenance, type EngineResult } from "@workspace/mc-core";
import type { TokenUsage } from "./types.js";

/**
 * One turn in the running conversation. The bake-off drives every model through
 * the SAME continuous No-GMB checklist chat, so the completion surface is
 * message-history-based (not a fresh system/user pair per phase): the caller
 * accumulates `user` + `assistant` turns and passes the whole history every
 * time, exactly as a Claude.ai chat carries its scrollback.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A provider-agnostic, STATEFUL completion: takes the full message history (plus
 * an optional system instruction) and returns the model's next turn as an
 * {@link EngineResult}. This is the ONLY provider-specific surface in the
 * bake-off — the prompts, the file fixtures, and the turn sequence above it are
 * identical for every model, so the comparison stays apples-to-apples.
 *
 * The page-build conversation passes NO system prompt (in the real workflow the
 * design files are *uploaded into the chat* and the rules live in the intro
 * user turn, not a system prompt). `system` exists only for the one-shot shared
 * grounding author, which is not part of any model's build conversation.
 *
 * These adapters live here in the scripts package, NOT in `lib/mc-core`, so the
 * shipped pipeline engine stays Claude-only. Every adapter calls the provider
 * DIRECTLY with STS's own API key — Claude via ANTHROPIC_API_KEY, Gemini via
 * GEMINI_API_KEY, OpenAI via OPENAI_API_KEY, Grok via XAI_API_KEY against xAI's
 * own endpoint. No Replit AI-Integrations proxy and no OpenRouter are used.
 */
/**
 * Per-turn knobs applied to a SINGLE completion call. Today the only knob is
 * `webSearch`: when set, the adapter attaches the provider's NATIVE web-search
 * tool for THAT call only. It is the capability analogue of `ARTIFACT_TO_INLINE`
 * — switched on uniformly for one specific turn (the SEO-verify turn, whose
 * prompt explicitly says "search the web for current 2025-2026 SEO best
 * practices") and off everywhere else, so the prompts/history/turn order stay
 * byte-identical and the comparison stays apples-to-apples. Off by default, so
 * every existing call site is unchanged.
 */
export interface CompleteOptions {
  webSearch?: boolean;
  /**
   * Override the per-call output-token budget for THIS completion only. Defaults
   * to the module cap (`MAX_OUTPUT_TOKENS`, or `OPENAI_MAX_OUTPUT_TOKENS` for the
   * OpenAI adapter) when unset, so every existing call site is unchanged. Used by
   * out-of-band tooling (e.g. the dossier review) that wants a smaller reservation
   * so a very large prompt still fits a provider's context window. Like
   * `webSearch`, this is a transport knob — it never touches prompts/history/turn
   * order, so the model comparison stays apples-to-apples.
   */
  maxOutputTokens?: number;
}

/**
 * A completion result: the model's next turn plus the real token usage the
 * provider reported for THIS call (null when a provider omits it). Extends
 * mc-core's {@link EngineResult} locally so the shipped pipeline's engine type
 * stays usage-free — usage capture is a bake-off-only concern.
 */
export interface CompleteResult extends EngineResult {
  usage: TokenUsage | null;
}

export type CompleteFn = (
  messages: ChatMessage[],
  system?: string,
  opts?: CompleteOptions,
) => Promise<CompleteResult>;

/** Generous output budget — full SEO pages run well past the default limits. */
const MAX_OUTPUT_TOKENS = 32000;

/**
 * OpenAI's "pro" reasoning models bill reasoning tokens against the same output
 * budget as the visible answer, so a full ~46K-char page PLUS its hidden
 * reasoning trace needs a much larger cap than the visible-only models — too low
 * and the page truncates mid-build. The cap only sets headroom; unused tokens
 * are never billed.
 */
const OPENAI_MAX_OUTPUT_TOKENS = 64000;

/**
 * Reasoning effort for the OpenAI "pro" tier. Pro defaults to "high", which on a
 * long generative HTML build turn produces a very large hidden reasoning trace —
 * slow enough to blow the per-turn timeout and costly enough to balloon the run.
 * "medium" is a balanced working level that keeps the build faithful while
 * fitting the time/cost budget; override via env if a run wants full effort.
 * This tunes only HOW HARD the model thinks, never the prompts or turn order.
 */
/** Exported so `run.ts` can record the ACTUAL effective effort (not just "some
 * provider default") when no per-model override supplies one. */
export const OPENAI_REASONING_EFFORT = (process.env.BAKEOFF_OPENAI_REASONING ?? "medium") as
  | "low"
  | "medium"
  | "high";

/** Whether an OpenAI model tag is on the "pro"/reasoning-effort-gated tier
 * (mandates an explicit `reasoning.effort`). Exported so `run.ts` can decide
 * what to record ("not-applicable" for plain chat tags that ignore effort). */
export function isOpenAiReasoningTag(model: string): boolean {
  return (
    /\bpro\b/i.test(model) ||
    model.toLowerCase().includes("-pro") ||
    model.toLowerCase().includes("-luna")
  );
}

/** xAI's OpenAI-compatible endpoint. */
const XAI_BASE_URL = "https://api.x.ai/v1";

/**
 * Per-request network timeout (ms) applied to EVERY provider completion call,
 * plus a small bounded retry. Without this a stalled provider call can hang the
 * whole resumable run forever. The guard wraps ONLY the network completion call
 * — it never touches prompts, history, or the turn sequence, so the bake-off
 * stays apples-to-apples. A model that exhausts its retries (or genuinely
 * refuses) surfaces a clear, labelled error the per-model try/catch records.
 *
 * Full SEO pages legitimately take minutes (Claude streaming runs the longest),
 * so the default is generous; override via env if needed.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.BAKEOFF_REQUEST_TIMEOUT_MS ?? 600_000);
const MAX_ATTEMPTS = Math.max(1, Number(process.env.BAKEOFF_MAX_ATTEMPTS ?? 2));
/** Wall-clock backstop sits above the SDK timeout so the SDK aborts cleanly first. */
const WALL_CLOCK_MS = REQUEST_TIMEOUT_MS + 30_000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`${name} is not set; add STS's own API key before running the bake-off.`);
  }
  return v;
}

/**
 * Reject if the work hasn't settled within `ms` — a hard wall-clock backstop.
 * The work is built from a factory given an {@link AbortSignal} that fires the
 * instant the timeout trips, so an adapter wired to it (the OpenAI/Grok
 * background-poll loops) can ABORT its in-flight poll/fetch instead of leaking a
 * request that keeps polling and billing long after this race has rejected.
 */
async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s with no response.`));
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Sleep that rejects PROMPTLY when `signal` aborts, so a background-poll loop
 * stops waiting (and the surrounding completion stops billing) the moment the
 * wall-clock backstop fires, instead of leaking one more full poll interval.
 */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("poll aborted: surrounding timeout fired."));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("poll aborted: surrounding timeout fired."));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Raw, single-attempt completion an adapter implements. `signal` aborts the
 * in-flight call (and any poll loop) when the wall-clock backstop trips. */
type RawComplete = (
  messages: ChatMessage[],
  system: string | undefined,
  opts: CompleteOptions | undefined,
  signal: AbortSignal,
) => Promise<CompleteResult>;

/**
 * Wrap a raw completion with a per-request timeout + small bounded retry. This
 * is the ONLY behavioural change vs. a plain provider call: it is transport
 * resilience, not a prompt/history change, so the comparison stays faithful. A
 * refusal returns content normally (no throw) and is therefore NOT retried —
 * only thrown transport/empty-response failures are.
 */
function guarded(model: string, fn: RawComplete, provider?: string): CompleteFn {
  return async (messages, system, opts) => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const startedAt = new Date().toISOString();
      try {
        const result = await withTimeout(
          (signal) => fn(messages, system, opts, signal),
          WALL_CLOCK_MS,
          `${model} completion`,
        );
        // Every bake-off adapter calls its provider DIRECTLY with STS's own key
        // (no proxy) — attach that attribution generically here rather than at
        // each of the ~7 per-provider return sites, so it can never drift.
        return {
          ...result,
          provenance:
            result.provenance ??
            makeProvenance({
              sourceKind: "direct-api",
              provider: provider ?? null,
              model,
              transport: "sdk",
              requestedEngine: model,
              engineMode: "bakeoff",
              attempt,
              candidate: "none",
              status: "success",
              startedAt,
              completedAt: new Date().toISOString(),
            }),
        };
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ! ${model} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
        if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 2_000 * attempt));
      }
    }
    throw new Error(
      `${model} failed after ${MAX_ATTEMPTS} attempt(s): ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`,
    );
  };
}

/** Strip a leading/trailing ```html / ```json code fence if present. */
function unfence(raw: string): string {
  const fence = raw.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence && fence[1]) return fence[1].trim();
  return raw.trim();
}

/**
 * Enforce the live-fetch contract: when a turn REQUESTED web search, the provider
 * response MUST carry evidence that the model actually called its native search
 * tool. Attaching the tool only makes search *available* — a model is free to
 * ignore it and answer from training recall, which would silently defeat the
 * whole point of the search-grounded seo-verify turn. So if search was requested
 * but no fetch happened, we FAIL LOUD (consistent with the repo's fail-loud
 * convention). The throw flows through `guarded` (one bounded retry) and, if the
 * model still won't fetch, is recorded as an honest per-model ERROR — never a
 * silent pass. This rule is uniform across every provider, so it stays
 * apples-to-apples. `count` is the best-available request/citation count for the
 * run log; `searched` is the authoritative gate.
 *
 * Exported (alongside the provider adapters) so its fail-loud behaviour can be
 * covered by a local, network-free unit test — the logic itself takes no
 * network dependency, only the four already-computed evidence signals.
 */
export function enforceLiveFetch(
  model: string,
  requested: boolean | undefined,
  searched: boolean,
  count: number,
): void {
  if (!requested) return;
  if (!searched) {
    throw new Error(
      `${model} was told to perform a live web search on this turn but produced NO evidence of ` +
        `calling its web-search tool. Live fetching is MANDATORY on this turn — failing loud ` +
        `rather than accepting training-recall content.`,
    );
  }
  console.log(`    🔎 ${model} live web search: ${count > 0 ? `${count} request(s)` : "performed"}`);
}

/**
 * Maps an "effort" level to an Anthropic extended-thinking token budget. This is
 * the real effort knob for Claude: a bigger budget lets the model reason longer
 * before answering. Off (no `thinking` block) when no effort is requested, which
 * matches the historical behaviour exactly.
 */
const CLAUDE_THINKING_BUDGETS: Record<string, number> = {
  low: 2000,
  medium: 8000,
  high: 24000,
};

/** Claude direct, with STS's own ANTHROPIC_API_KEY. `effort` (low/medium/high)
 * is optional — when set it enables extended thinking with a matching token
 * budget; when unset the call is byte-identical to the pre-effort behaviour. */
export function makeClaudeComplete(model: string, effort?: string): CompleteFn {
  const client = new Anthropic({
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  const thinkingBudget = effort ? CLAUDE_THINKING_BUDGETS[effort] : undefined;
  if (effort && thinkingBudget === undefined) {
    throw new Error(`Claude effort override "${effort}" is not one of low/medium/high.`);
  }
  return guarded(model, async (messages, system, opts) => {
    const maxTokens = opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
    // Stream: the Anthropic SDK refuses non-streaming requests whose token
    // budget could push the call past 10 minutes (full SEO pages are large).
    const stream = client.messages.stream({
      model,
      // Extended thinking's budget counts against max_tokens, so the ceiling
      // must exceed it; thinking also requires temperature to stay unset/1.
      max_tokens: thinkingBudget ? Math.max(maxTokens, thinkingBudget + 4000) : maxTokens,
      ...(thinkingBudget ? { thinking: { type: "enabled" as const, budget_tokens: thinkingBudget } } : {}),
      ...(system ? { system } : {}),
      // Native web_search server tool, attached ONLY on the flagged turn. Claude
      // runs the search itself and folds the results into its answer; we still
      // read only the text blocks below, so search/tool-result blocks are ignored.
      ...(opts?.webSearch
        ? { tools: [{ type: "web_search_20250305" as const, name: "web_search" as const }] }
        : {}),
      // Prompt caching: mark cache breakpoints so the large, verbatim-repeated
      // prefix (the ~180K-char design fixtures inlined in the intro + the growing
      // conversation) is READ from Anthropic's cache on every turn after the first
      // instead of being re-billed at full input price. cache_control is a
      // billing/transport hint only — the text the model reads is byte-identical,
      // so the comparison stays apples-to-apples. Two breakpoints: the first
      // message pins the massive fixtures block; the last message incrementally
      // caches the whole conversation for the next turn (Anthropic reads the
      // longest matching cached prefix automatically).
      messages: messages.map((m, i) => {
        const pin = i === 0 || i === messages.length - 1;
        return pin
          ? {
              role: m.role,
              content: [
                {
                  type: "text" as const,
                  text: m.content,
                  cache_control: { type: "ephemeral" as const },
                },
              ],
            }
          : { role: m.role, content: m.content };
      }),
    });
    const message = await stream.finalMessage();
    // Live-fetch evidence: Claude's server-side web_search emits server_tool_use /
    // web_search_tool_result blocks and a usage.server_tool_use.web_search_requests
    // count. Any of these proves it actually searched.
    const searchReqs =
      (message.usage as { server_tool_use?: { web_search_requests?: number } } | undefined)
        ?.server_tool_use?.web_search_requests ?? 0;
    const searchBlocks = message.content.filter(
      (b) => b.type === "server_tool_use" || b.type === "web_search_tool_result",
    ).length;
    enforceLiveFetch(model, opts?.webSearch, searchReqs > 0 || searchBlocks > 0, searchReqs || searchBlocks);
    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    // Anthropic reports cache reads/writes SEPARATELY from `input_tokens`, so the
    // full prompt total is the sum of all three; the cached-read subset is billed
    // at a discount (extended-thinking output is folded into `output_tokens`).
    // Null (not a zero-filled object) when no usage block came back, so cost can
    // fall back to the estimate rather than reporting a false "Measured $0".
    const au = message.usage;
    const usage: TokenUsage | null = au
      ? {
          inputTokens:
            (au.input_tokens ?? 0) +
            (au.cache_read_input_tokens ?? 0) +
            (au.cache_creation_input_tokens ?? 0),
          cachedInputTokens: au.cache_read_input_tokens ?? 0,
          outputTokens: au.output_tokens ?? 0,
          reasoningTokens: 0,
        }
      : null;
    return { content: unfence(raw), raw, usage };
  }, "anthropic");
}

/** Maps an "effort" level to a Gemini thinking-budget token count — the real
 * effort knob for Gemini's 2.5+/3.x "thinking" models. Off (no thinkingConfig)
 * when no effort is requested, matching the historical behaviour exactly. */
const GEMINI_THINKING_BUDGETS: Record<string, number> = {
  low: 1024,
  medium: 8000,
  high: 24000,
};

/** Gemini direct, with STS's own GEMINI_API_KEY. `effort` (low/medium/high) is
 * optional — when set it sets an explicit thinking budget; when unset the call
 * is byte-identical to the pre-effort behaviour (implicit provider default). */
export function makeGeminiComplete(model: string, effort?: string): CompleteFn {
  const ai = new GoogleGenAI({
    apiKey: requireEnv("GEMINI_API_KEY"),
    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
  });
  const thinkingBudget = effort ? GEMINI_THINKING_BUDGETS[effort] : undefined;
  if (effort && thinkingBudget === undefined) {
    throw new Error(`Gemini effort override "${effort}" is not one of low/medium/high.`);
  }
  return guarded(model, async (messages, system, opts) => {
    // Prompt caching: Gemini 2.5+/3.x enable IMPLICIT context caching by default —
    // when a request shares a long prefix with a recent one (here the ~180K-char
    // fixtures + growing history, re-sent verbatim each turn), Google serves the
    // matching prefix from cache at a discount with no request-side flag. So no
    // explicit cachedContent handle is needed; caching is on for every turn.
    const resp = await ai.models.generateContent({
      model,
      // Gemini uses "model" for the assistant role and a `parts` array.
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        ...(system ? { systemInstruction: system } : {}),
        maxOutputTokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
        ...(thinkingBudget ? { thinkingConfig: { thinkingBudget } } : {}),
        // Google Search grounding, attached ONLY on the flagged turn. Gemini
        // grounds its answer in live results; `resp.text` still aggregates the
        // model's text, so extraction is unchanged.
        ...(opts?.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });
    // Live-fetch evidence: Google Search grounding populates groundingMetadata
    // (search queries it issued + the grounding chunks/supports it pulled back).
    const gm = (
      resp.candidates?.[0] as
        | {
            groundingMetadata?: {
              webSearchQueries?: unknown[];
              groundingChunks?: unknown[];
              groundingSupports?: unknown[];
              searchEntryPoint?: unknown;
            };
          }
        | undefined
    )?.groundingMetadata;
    const queries = gm?.webSearchQueries?.length ?? 0;
    const chunks = gm?.groundingChunks?.length ?? 0;
    const supports = gm?.groundingSupports?.length ?? 0;
    enforceLiveFetch(
      model,
      opts?.webSearch,
      queries > 0 || chunks > 0 || supports > 0 || gm?.searchEntryPoint != null,
      queries || chunks,
    );
    const raw = (resp.text ?? "").trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    // Gemini's promptTokenCount INCLUDES the cached subset; visible output is
    // candidatesTokenCount and hidden reasoning ("thoughts") is billed on top.
    // Null when no usageMetadata came back (so cost falls back to the estimate).
    const gu = resp.usageMetadata;
    const usage: TokenUsage | null = gu
      ? {
          inputTokens: gu.promptTokenCount ?? 0,
          cachedInputTokens: gu.cachedContentTokenCount ?? 0,
          outputTokens: (gu.candidatesTokenCount ?? 0) + (gu.thoughtsTokenCount ?? 0),
          reasoningTokens: gu.thoughtsTokenCount ?? 0,
        }
      : null;
    return { content: unfence(raw), raw, usage };
  }, "google");
}

/** Prepend an optional system message to an OpenAI-style chat history. */
function openAiMessages(
  messages: ChatMessage[],
  system?: string,
): { role: "system" | "user" | "assistant"; content: string }[] {
  const out = messages.map((m) => ({ role: m.role, content: m.content }));
  return system ? [{ role: "system" as const, content: system }, ...out] : out;
}

/**
 * OpenAI top-tier model direct, with STS's own OPENAI_API_KEY, via the Responses
 * API. The gpt-5.x "pro" reasoning tier is served ONLY by `responses` — the
 * `chat/completions` endpoint 404s for it ("not a chat model") — and Responses is
 * also the forward-looking surface for the plain gpt-5.x chat tags, so the
 * adapter uses it uniformly: the chat history maps to `input` items, an optional
 * system maps to `instructions`, and the budget uses `max_output_tokens` (which
 * also covers the model's hidden reasoning tokens, hence the larger cap). This is
 * a transport change only — prompts, history, and turn order are untouched, so
 * the comparison stays apples-to-apples.
 */
export function makeOpenAIComplete(model: string, effort?: string): CompleteFn {
  const client = new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  // The "pro"/"luna" reasoning tier mandates an explicit reasoning effort and
  // REJECTS "low" outright (valid: medium | high | xhigh), defaulting to the
  // slow "high" when unset — so we pin it to a configurable floor (medium),
  // overridable per-model via `effort`. The plain chat tags (e.g. gpt-5.5) run
  // at the API default with no reasoning override. This only tunes HOW HARD a
  // reasoning model thinks; prompts, history, and turn order are identical
  // everywhere. Validated here (not just documented) so a bad
  // BAKEOFF_MODEL_OVERRIDES effort fails loud at call time instead of shipping
  // an API-rejected request that reads as a mysterious run error.
  const resolvedEffort = effort ?? OPENAI_REASONING_EFFORT;
  if (isOpenAiReasoningTag(model) && !["medium", "high", "xhigh"].includes(resolvedEffort)) {
    throw new Error(
      `OpenAI reasoning-tier model "${model}" does not support effort "${resolvedEffort}" ` +
        `(only medium/high/xhigh are valid; "low" is rejected by the API).`,
    );
  }
  return guarded(model, async (messages, system, opts, signal) => {
    // Submit as a BACKGROUND job and poll to completion. The synchronous Responses
    // endpoint enforces a server-side processing window (~minutes) that the
    // ultra-heavy "pro" tier routinely exceeds on the full page-build turn — it
    // returns "Request timed out" no matter how high our own client timeout is.
    // Background mode lifts that server-side cap; our WALL_CLOCK still bounds the
    // poll loop. This is a transport change only (identical prompt/input/turn
    // order) applied uniformly to every OpenAI tag, so no model is special-cased.
    // The wall-clock `signal` is threaded into every create/retrieve and the
    // inter-poll sleep, so a timeout ABORTS the in-flight request and stops the
    // loop polling/billing instead of leaking it.
    let resp = await client.responses.create(
      {
        model,
        // Prompt caching: OpenAI auto-caches prompt prefixes >1024 tokens and
        // discounts the cached input; a stable per-model prompt_cache_key routes
        // this conversation's turns to the same cache so the big repeated prefix
        // (fixtures + history) lands cache hits. Routing hint only — prompts,
        // input, and turn order are unchanged, so the comparison stays faithful.
        prompt_cache_key: `bakeoff-${model}`,
        max_output_tokens: opts?.maxOutputTokens ?? OPENAI_MAX_OUTPUT_TOKENS,
        background: true,
        ...(isOpenAiReasoningTag(model)
          ? { reasoning: { effort: resolvedEffort as "medium" | "high" | "xhigh" } }
          : {}),
        ...(system ? { instructions: system } : {}),
        // Responses web_search tool, attached ONLY on the flagged turn. It coexists
        // with background poll mode; `resp.output_text` still aggregates the final
        // text once the run completes, so extraction below is unchanged.
        ...(opts?.webSearch ? { tools: [{ type: "web_search" as const }] } : {}),
        input: messages.map((m) => ({ role: m.role, content: m.content })),
      },
      { signal },
    );
    while (resp.status === "queued" || resp.status === "in_progress") {
      await abortableSleep(5_000, signal);
      resp = await client.responses.retrieve(resp.id, undefined, { signal });
    }
    if (resp.status !== "completed") {
      throw new Error(
        `${model} background run ended as ${resp.status ?? "unknown"}: ${
          resp.error?.message ?? resp.incomplete_details?.reason ?? "no detail"
        }`,
      );
    }
    // Live-fetch evidence: the Responses API records each search as a
    // `web_search_call` item in resp.output (alongside the message items).
    const searchCalls = ((resp.output ?? []) as Array<{ type?: string }>).filter(
      (it) => typeof it.type === "string" && it.type.includes("web_search"),
    ).length;
    enforceLiveFetch(model, opts?.webSearch, searchCalls > 0, searchCalls);
    const raw = (resp.output_text ?? "").trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw, usage: responsesUsage(resp.usage) };
  }, "openai");
}

/** Normalize an OpenAI-style Responses `usage` block into {@link TokenUsage}.
 * `input_tokens` already includes the cached subset; `output_tokens` already
 * includes the hidden reasoning subset. Shared by the OpenAI and xAI Responses
 * paths. Returns null when no usage block was reported (so cost can fall back to
 * the estimate rather than reporting a false "Measured $0"). */
function responsesUsage(
  u:
    | {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: { cached_tokens?: number } | null;
        output_tokens_details?: { reasoning_tokens?: number } | null;
      }
    | null
    | undefined,
): TokenUsage | null {
  if (!u) return null;
  return {
    inputTokens: u.input_tokens ?? 0,
    cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? 0,
  };
}

/** Count provider web-search evidence in an OpenAI-style Responses output array. */
function responsesSearchCount(output: unknown): number {
  const items = (Array.isArray(output) ? output : []) as Array<{
    type?: string;
    content?: Array<{ annotations?: Array<{ type?: string }> }>;
  }>;
  let count = 0;
  for (const it of items) {
    if (typeof it.type === "string" && it.type.includes("web_search")) count++;
    if (it.type === "message" && Array.isArray(it.content)) {
      for (const c of it.content) {
        if (Array.isArray(c.annotations)) {
          count += c.annotations.filter((a) => a?.type === "url_citation").length;
        }
      }
    }
  }
  return count;
}

/** Read a positive-millisecond override, failing loud on a malformed value
 * rather than letting `Number("2 min")` -> NaN silently switch a watchdog off. */
function positiveMsEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number of milliseconds (got "${raw}").`);
  }
  return n;
}

/**
 * Stream watchdog windows for the Grok chat/completions stream, in ms.
 *
 * These exist because the OpenAI SDK's `timeout` option does NOT bound a
 * streamed body. In `openai@6`, `fetchWithTimeout` arms its abort timer around
 * the `fetch` call only and clears it in a `finally` the moment the RESPONSE
 * HEADERS arrive — so for `stream: true` the client timeout covers time-to-
 * headers and nothing else. Once the SSE connection is open the body can idle
 * indefinitely, and the only remaining bound is the generic `WALL_CLOCK_MS`
 * backstop, which reports a bare "timed out ... with no response" after ~10.5
 * minutes and cannot say whether anything was ever received.
 *
 * Two distinct windows, because the two stall shapes have different causes:
 *  - FIRST EVENT: stream opened, but not one parsed SSE event arrived. Either
 *    the provider sent nothing at all (rawBytes 0) or only keepalive/comment
 *    frames (rawBytes > 0), which the SSE decoder drops before the SDK yields.
 *  - IDLE: events were flowing and then stopped mid-generation.
 *
 * Both are generous (well above the ~155-230s a large-prompt Grok turn has
 * historically taken end to end) and both are env-overridable, so a genuinely
 * slower turn can be given more room without a code change. They only ever make
 * a hang fail EARLIER and with a diagnosis; they never accept a partial answer.
 */
const GROK_FIRST_EVENT_TIMEOUT_MS = positiveMsEnv(
  "BAKEOFF_GROK_FIRST_EVENT_TIMEOUT_MS",
  300_000,
);
const GROK_STREAM_IDLE_TIMEOUT_MS = positiveMsEnv(
  "BAKEOFF_GROK_STREAM_IDLE_TIMEOUT_MS",
  120_000,
);

/**
 * Stall windows for the SEPARATE Grok Responses-API stream used by the
 * web-search turn. Kept distinct from the chat/completions windows above
 * because the shapes differ: a Responses turn spends real time inside the
 * server-side `web_search` tool before it emits a single output-text delta, and
 * xAI is not obliged to surface reasoning deltas while it does. So the idle
 * window here is deliberately wider than the chat one — it exists to convert a
 * silent hang into a DIAGNOSIS, not to police a slow-but-working search.
 */
const GROK_SEARCH_FIRST_EVENT_TIMEOUT_MS = positiveMsEnv(
  "BAKEOFF_GROK_SEARCH_FIRST_EVENT_TIMEOUT_MS",
  300_000,
);
const GROK_SEARCH_IDLE_TIMEOUT_MS = positiveMsEnv(
  "BAKEOFF_GROK_SEARCH_IDLE_TIMEOUT_MS",
  300_000,
);

/**
 * Transport for the Grok web-search turn: STREAMED by default.
 *
 * `openai@6`'s client `timeout` clears its abort timer the instant `fetch`
 * resolves (i.e. when response HEADERS arrive — see `fetchWithTimeout` and the
 * note on GROK_FIRST_EVENT_TIMEOUT_MS). On a NON-streaming call the headers do
 * not arrive until the whole answer is generated, so `timeout` silently bounds
 * the ENTIRE generation; on a streamed call it bounds only time-to-headers and
 * the watchdogs bound the body. That is exactly the difference between the
 * chat/completions turns (streamed, succeeded) and this one (blocking, died
 * with the SDK's verbatim `Request timed out.`).
 *
 * Set `BAKEOFF_GROK_SEARCH_STREAM=0` to fall back to the original blocking
 * create+poll transport if xAI ever rejects `stream: true` for this endpoint.
 * This is a TRANSPORT switch only: the prompt, history, tool set, output budget
 * and the mandatory {@link enforceLiveFetch} gate are identical on both paths.
 */
const GROK_SEARCH_STREAM = !/^(0|false|no)$/i.test(
  process.env.BAKEOFF_GROK_SEARCH_STREAM?.trim() ?? "1",
);

/**
 * Byte-level transport telemetry for ONE streamed provider call. Records only
 * METADATA — HTTP status, time to headers, time to the first raw body byte,
 * total raw bytes, and when the last byte landed. No body content, no request
 * payload, no headers, and no credential is ever captured or logged.
 *
 * This is the only layer that can see SSE keepalive/comment frames: the SDK's
 * decoder swallows lines starting with ":" and never yields them, so
 * "connection alive but silent" and "connection dead" look identical above it.
 */
interface TransportProbe {
  startedAt: number;
  status: number | null;
  msToHeaders: number | null;
  msToFirstRawByte: number | null;
  lastRawByteAt: number | null;
  rawBytes: number;
}

function newTransportProbe(): TransportProbe {
  return {
    startedAt: Date.now(),
    status: null,
    msToHeaders: null,
    msToFirstRawByte: null,
    lastRawByteAt: null,
    rawBytes: 0,
  };
}

function describeTransport(p: TransportProbe): string {
  const quietMs = p.lastRawByteAt === null ? null : Date.now() - p.lastRawByteAt;
  return (
    `http=${p.status ?? "none"} connectMs=${p.msToHeaders ?? "n/a"} ` +
    `firstByteMs=${p.msToFirstRawByte ?? "none"} rawBytes=${p.rawBytes} ` +
    `quietMs=${quietMs ?? "n/a"}`
  );
}

/**
 * A `fetch` wrapper that fills a {@link TransportProbe} as the response streams.
 * Passed to the OpenAI client as its `fetch` implementation, so the request
 * itself is completely unchanged — this only observes the response. Non-OK
 * responses are returned untouched so the SDK's own error parsing (and its
 * provider error body) still works normally.
 */
function probingFetch(
  probe: TransportProbe,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    probe.startedAt = Date.now();
    const res = await fetch(input, init);
    probe.status = res.status;
    probe.msToHeaders = Date.now() - probe.startedAt;
    if (!res.ok || !res.body) return res;
    const counted = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          const now = Date.now();
          probe.rawBytes += chunk.byteLength;
          if (probe.msToFirstRawByte === null) probe.msToFirstRawByte = now - probe.startedAt;
          probe.lastRawByteAt = now;
          controller.enqueue(chunk);
        },
      }),
    );
    // `Response`'s BodyInit names AsyncIterable<Uint8Array> rather than
    // ReadableStream, which a web ReadableStream satisfies structurally; the
    // cast just states that directly instead of relying on the alias.
    return new Response(counted as unknown as AsyncIterable<Uint8Array>, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };
}

/**
 * Render a provider failure as STATUS plus the provider's OWN reported
 * type/code/message, truncated. The message comes from the provider's error
 * body, never from the request payload, so no prompt content and no credential
 * can leak into a log.
 */
export function describeProviderError(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    return (
      `HTTP ${err.status ?? "n/a"} ${err.type ?? "?"}/${err.code ?? "?"}: ` +
      `${String(err.message ?? "").slice(0, 400)}`
    );
  }
  if (err instanceof Error) return `${err.name}: ${err.message.slice(0, 400)}`;
  return String(err).slice(0, 400);
}

/** Everything ONE streamed Grok turn actually produced, as observable facts —
 * including the parts the old accumulator silently discarded (hidden reasoning
 * deltas, tool-call deltas, unknown delta fields, and the finish reason). */
export interface GrokStreamOutcome {
  /** Concatenated `delta.content` only — hidden reasoning is NEVER folded in. */
  content: string;
  usage: OpenAI.CompletionUsage | undefined;
  /** Parsed SSE events yielded by the SDK (keepalive comments are invisible here). */
  chunks: number;
  contentChars: number;
  reasoningChars: number;
  toolCallChunks: number;
  /** Delta fields the accumulator does not read, so a new provider field can
   * never again cause a silent "empty response" with no explanation. */
  ignoredDeltaKeys: string[];
  finishReason: string | null;
  msToFirstChunk: number | null;
  msToFirstContent: number | null;
  msTotal: number;
}

export interface GrokStreamWatchdog {
  /** Model tag, used verbatim in stall errors. */
  label: string;
  /** Max ms from stream open to the FIRST parsed event. */
  firstEventTimeoutMs: number;
  /** Max ms between parsed events once the first has arrived. */
  idleTimeoutMs: number;
  /** Abort the underlying request so a stalled call stops billing. */
  abort: () => void;
  /** Transport facts folded into a stall error (see {@link describeTransport}). */
  describeTransport?: () => string;
}

const STALLED = Symbol("grok-stream-stalled");

/** Race one iterator step against a stall window. A step that settles after the
 * window still has a handler attached (via `Promise.race`), so a late rejection
 * can never surface as an unhandled rejection. */
function raceStep<T>(step: Promise<T>, ms: number): Promise<T | typeof STALLED> {
  if (!Number.isFinite(ms) || ms <= 0) return step;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stall = new Promise<typeof STALLED>((resolve) => {
    timer = setTimeout(() => resolve(STALLED), ms);
  });
  return Promise.race([step, stall]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Drain a Grok chat/completions stream under a first-event + idle watchdog,
 * counting everything that arrives.
 *
 * Deliberately network-free and provider-object-free (it takes a plain async
 * iterable of chunks) so the stall and parsing behaviour is unit-testable
 * without touching xAI. A stall ABORTS the request and throws a diagnostic that
 * names which window tripped, how much had arrived, and the transport state —
 * it never returns a truncated answer as if it were complete.
 */
export async function consumeGrokStream(
  stream: AsyncIterable<OpenAI.ChatCompletionChunk>,
  wd: GrokStreamWatchdog,
): Promise<GrokStreamOutcome> {
  const t0 = Date.now();
  const iterator = stream[Symbol.asyncIterator]();
  let content = "";
  let usage: OpenAI.CompletionUsage | undefined;
  let chunks = 0;
  let contentChars = 0;
  let reasoningChars = 0;
  let toolCallChunks = 0;
  const ignored = new Set<string>();
  let finishReason: string | null = null;
  let msToFirstChunk: number | null = null;
  let msToFirstContent: number | null = null;

  for (;;) {
    const windowMs = chunks === 0 ? wd.firstEventTimeoutMs : wd.idleTimeoutMs;
    const step = await raceStep(iterator.next(), windowMs);
    if (step === STALLED) {
      wd.abort();
      const transport = wd.describeTransport?.() ?? "no transport telemetry";
      const secs = Math.round(windowMs / 1000);
      throw new Error(
        chunks === 0
          ? `${wd.label} opened a stream but produced NO parsed event within ${secs}s ` +
            `[${transport}]. rawBytes=0 means the provider sent nothing at all; rawBytes>0 with ` +
            `no parsed event means it sent only keepalive/comment frames. Raise ` +
            `BAKEOFF_GROK_FIRST_EVENT_TIMEOUT_MS if this turn is legitimately slower than that.`
          : `${wd.label} stream went silent for ${secs}s after ${chunks} event(s) ` +
            `[${transport}; content=${contentChars}ch reasoning=${reasoningChars}ch ` +
            `finish=${finishReason ?? "none"}]. Raise BAKEOFF_GROK_STREAM_IDLE_TIMEOUT_MS if this ` +
            `turn is legitimately slower than that.`,
      );
    }
    if (step.done) break;
    const chunk = step.value;
    chunks++;
    if (msToFirstChunk === null) msToFirstChunk = Date.now() - t0;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const delta = (choice?.delta ?? {}) as Record<string, unknown>;
    const text = typeof delta.content === "string" ? delta.content : "";
    if (text) {
      if (msToFirstContent === null) msToFirstContent = Date.now() - t0;
      content += text;
      contentChars += text.length;
    }
    if (typeof delta.reasoning_content === "string") reasoningChars += delta.reasoning_content.length;
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) toolCallChunks++;
    for (const key of Object.keys(delta)) {
      if (key !== "content" && key !== "role" && key !== "reasoning_content" && key !== "tool_calls") {
        ignored.add(key);
      }
    }
  }

  return {
    content,
    usage,
    chunks,
    contentChars,
    reasoningChars,
    toolCallChunks,
    ignoredDeltaKeys: [...ignored],
    finishReason,
    msToFirstChunk,
    msToFirstContent,
    msTotal: Date.now() - t0,
  };
}

/**
 * Everything ONE streamed Grok RESPONSES turn produced, as observable facts.
 *
 * Deliberately a superset of what the adapter needs, because the whole point of
 * this struct is to tell the four failure shapes apart after the fact:
 *  - never connected / no event at all  -> `events === 0` (+ the transport probe)
 *  - connected, searched, never wrote   -> `searchCalls > 0`, `textChars === 0`
 *  - connected, wrote, never searched   -> `textChars > 0`, `searchCalls === 0`
 *    (this one is a GATE failure, not a transport failure)
 *  - provider gave up                   -> `terminalStatus` / `providerError`
 *
 * METADATA ONLY. Character COUNTS are recorded, never the characters; the only
 * free text retained is the provider's own error message, which is bounded.
 */
export interface GrokResponsesOutcome {
  /** Concatenated `response.output_text.delta` text — the answer, nothing else. */
  text: string;
  textChars: number;
  /** Hidden reasoning deltas are COUNTED and never folded into the answer. */
  reasoningChars: number;
  /** Parsed stream events yielded by the SDK. */
  events: number;
  /** Distinct server-side web_search calls observed (deduped by output item id). */
  searchCalls: number;
  /** Every `response.web_search_call.*` progress event, including repeats. */
  searchEvents: number;
  /** `url_citation` annotations streamed onto the answer. */
  citations: number;
  /** `completed` | `incomplete` | `failed`, or null if the stream just ended. */
  terminalStatus: string | null;
  /** `incomplete_details.reason` when the run ended incomplete. */
  incompleteReason: string | null;
  /** Provider-authored error text (bounded), from an `error` event or the
   * terminal response's own `error` block. Never request content. */
  providerError: string | null;
  /** Terminal `Response` snapshot, used for authoritative usage + output items. */
  finalResponse: OpenAI.Responses.Response | null;
  /** Event types this consumer does not read, so a new xAI event can never
   * again make a turn fail with no explanation. Bounded. */
  unknownEventTypes: string[];
  msToFirstEvent: number | null;
  msToFirstSearchEvent: number | null;
  msToFirstText: number | null;
  msTotal: number;
}

/** Cap on distinct unknown event types retained, so a chatty new provider
 * event can never turn a diagnostic into an unbounded log line. */
const UNKNOWN_EVENT_TYPE_CAP = 12;

/** Event types this consumer deliberately ignores (lifecycle noise), listed so
 * they are not reported as "unknown" and do not mask a genuinely new one. */
const KNOWN_INERT_RESPONSE_EVENTS = new Set([
  "response.created",
  "response.in_progress",
  "response.queued",
  "response.output_item.done",
  "response.content_part.added",
  "response.content_part.done",
  "response.output_text.done",
  "response.reasoning_text.done",
  "response.reasoning_summary_part.added",
  "response.reasoning_summary_part.done",
  "response.reasoning_summary_text.done",
]);

/**
 * Drain an xAI Responses-API stream under the same first-event + idle watchdog
 * discipline as {@link consumeGrokStream}, counting live-search activity as it
 * happens.
 *
 * Network-free and provider-object-free (it takes a plain async iterable), so
 * the stall behaviour, the search accounting and the terminal-status handling
 * are unit-testable without touching xAI. A stall ABORTS the request and throws
 * a diagnostic naming which window tripped and what had arrived; it never
 * returns a partial answer as if it were complete, and it never invents search
 * evidence — `searchCalls`/`citations` are counted strictly from provider
 * events and feed the unchanged {@link enforceLiveFetch} gate.
 */
export async function consumeGrokResponsesStream(
  stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
  wd: GrokStreamWatchdog,
): Promise<GrokResponsesOutcome> {
  const t0 = Date.now();
  const iterator = stream[Symbol.asyncIterator]();
  let text = "";
  let reasoningChars = 0;
  let events = 0;
  let searchEvents = 0;
  let citations = 0;
  let terminalStatus: string | null = null;
  let incompleteReason: string | null = null;
  let providerError: string | null = null;
  let finalResponse: OpenAI.Responses.Response | null = null;
  let msToFirstEvent: number | null = null;
  let msToFirstSearchEvent: number | null = null;
  let msToFirstText: number | null = null;
  const searchCallIds = new Set<string>();
  const unknown = new Set<string>();

  const noteSearch = (id: string | undefined): void => {
    searchEvents++;
    if (msToFirstSearchEvent === null) msToFirstSearchEvent = Date.now() - t0;
    // Dedupe by output-item id so the in_progress/searching/completed trio for
    // ONE search is not counted as three searches. Events with no id still
    // count as one call each (an unidentified call is still a real call).
    searchCallIds.add(id ?? `anon-${searchCallIds.size}`);
  };

  for (;;) {
    const windowMs = events === 0 ? wd.firstEventTimeoutMs : wd.idleTimeoutMs;
    const step = await raceStep(iterator.next(), windowMs);
    if (step === STALLED) {
      wd.abort();
      const transport = wd.describeTransport?.() ?? "no transport telemetry";
      const secs = Math.round(windowMs / 1000);
      throw new Error(
        events === 0
          ? `${wd.label} opened a web-search response stream but produced NO parsed event ` +
            `within ${secs}s [${transport}]. rawBytes=0 means the provider sent nothing at all; ` +
            `rawBytes>0 with no parsed event means it sent only keepalive/comment frames. Raise ` +
            `BAKEOFF_GROK_SEARCH_FIRST_EVENT_TIMEOUT_MS if this turn is legitimately slower.`
          : `${wd.label} web-search response stream went silent for ${secs}s after ${events} ` +
            `event(s) [${transport}; searchCalls=${searchCallIds.size} searchEvents=${searchEvents} ` +
            `answer=${text.length}ch reasoning=${reasoningChars}ch citations=${citations} ` +
            `terminal=${terminalStatus ?? "none"}]. Raise BAKEOFF_GROK_SEARCH_IDLE_TIMEOUT_MS if ` +
            `this turn is legitimately slower.`,
      );
    }
    if (step.done) break;
    events++;
    if (msToFirstEvent === null) msToFirstEvent = Date.now() - t0;

    // Read events structurally rather than by exhaustive union narrowing: xAI
    // may emit event types this SDK build's union does not know, and an
    // unrecognised event must be RECORDED, never a crash and never silence.
    const ev = step.value as unknown as {
      type?: string;
      delta?: unknown;
      item_id?: string;
      item?: { id?: string; type?: string };
      annotation?: { type?: string };
      response?: OpenAI.Responses.Response;
      code?: string | null;
      message?: string;
    };
    const type = typeof ev.type === "string" ? ev.type : "(untyped)";

    if (type === "response.output_text.delta") {
      const d = typeof ev.delta === "string" ? ev.delta : "";
      if (d) {
        if (msToFirstText === null) msToFirstText = Date.now() - t0;
        text += d;
      }
    } else if (
      type === "response.reasoning_text.delta" ||
      type === "response.reasoning_summary_text.delta"
    ) {
      if (typeof ev.delta === "string") reasoningChars += ev.delta.length;
    } else if (type.startsWith("response.web_search_call.")) {
      noteSearch(ev.item_id);
    } else if (type === "response.output_item.added") {
      if (typeof ev.item?.type === "string" && ev.item.type.includes("web_search")) {
        noteSearch(ev.item.id);
      }
    } else if (type === "response.output_text.annotation.added") {
      if (ev.annotation?.type === "url_citation") citations++;
    } else if (
      type === "response.completed" ||
      type === "response.incomplete" ||
      type === "response.failed"
    ) {
      finalResponse = ev.response ?? null;
      terminalStatus = finalResponse?.status ?? type.replace("response.", "");
      incompleteReason = finalResponse?.incomplete_details?.reason ?? null;
      if (finalResponse?.error?.message) {
        providerError = String(finalResponse.error.message).slice(0, 400);
      }
    } else if (type === "error") {
      providerError = `${ev.code ?? "?"}: ${String(ev.message ?? "").slice(0, 400)}`;
    } else if (!KNOWN_INERT_RESPONSE_EVENTS.has(type) && unknown.size < UNKNOWN_EVENT_TYPE_CAP) {
      unknown.add(type);
    }
  }

  return {
    text,
    textChars: text.length,
    reasoningChars,
    events,
    searchCalls: searchCallIds.size,
    searchEvents,
    citations,
    terminalStatus,
    incompleteReason,
    providerError,
    finalResponse,
    unknownEventTypes: [...unknown],
    msToFirstEvent,
    msToFirstSearchEvent,
    msToFirstText,
    msTotal: Date.now() - t0,
  };
}

/** Grok direct via xAI's OpenAI-compatible endpoint, with STS's own XAI_API_KEY.
 * The current Grok family exposes NO effort/reasoning knob — an explicit
 * `effort` override is a config mistake, not something to fake, so it fails
 * loud at construction rather than silently ignoring the request. */
export function makeGrokComplete(model: string, effort?: string): CompleteFn {
  if (effort) {
    throw new Error(
      `Grok effort override "${effort}" requested for ${model}, but xAI's Grok API has no ` +
        `effort/reasoning-budget knob to apply it to.`,
    );
  }
  // The key is read (and validated) once at construction; each call builds its
  // own client so it can attach a per-call `probingFetch` transport probe.
  const apiKey = requireEnv("XAI_API_KEY");
  return guarded(model, async (messages, system, opts, signal) => {
    // Native web search, attached ONLY on the flagged turn. xAI's old Live Search
    // (`search_parameters`) is deprecated (410 → "switch to the Agent Tools API"),
    // so the current native path is the `web_search` Agent Tool, which xAI serves
    // on its OpenAI-compatible RESPONSES endpoint (chat/completions rejects the
    // tool). We therefore route the flagged turn through `responses` with the
    // web_search tool; every other turn stays on plain chat/completions. The full
    // history is re-sent as `input` items, identical to the OpenAI adapter, so the
    // turn/prompt sequence is unchanged. The wall-clock `signal` is threaded into
    // every create/retrieve and the inter-poll sleep so a timeout ABORTS the
    // in-flight request instead of leaking a loop that keeps polling/billing.
    //
    // STREAMED, for the same reason the chat/completions turns are: this call
    // was previously a single BLOCKING `responses.create`, and on a blocking
    // call `openai@6`'s client `timeout` bounds the whole generation rather than
    // just the connect (its abort timer is cleared when `fetch` resolves, which
    // for a non-streamed JSON body is only once the answer is finished). A turn
    // whose siblings needed 280-446s just to reach their FIRST visible token
    // therefore died against the client timeout as a bare
    // `APIConnectionTimeoutError: Request timed out.` — no status, no evidence,
    // no way to tell a hang from a slow success. Streaming moves the bound onto
    // the watchdogs and, as a bonus, exposes xAI's own `web_search_call`
    // progress events, so tool activity is observable while it happens instead
    // of being inferred from the terminal payload. Prompt, history, tool set,
    // output budget and the mandatory live-search gate are all unchanged.
    if (opts?.webSearch) {
      const maxOut = opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
      const searchPromptChars =
        messages.reduce((n, m) => n + m.content.length, 0) + (system?.length ?? 0);
      // Same request body on BOTH transports, so switching transport can never
      // change what the model was asked or what it was allowed to spend.
      const searchBody = {
        model,
        max_output_tokens: maxOut,
        tools: [{ type: "web_search" as const }],
        ...(system ? { instructions: system } : {}),
        input: messages.map((m) => ({ role: m.role, content: m.content })),
      };
      // Byte-level probe on BOTH transports: `probe.status === null` means no
      // HTTP response headers ever arrived (a CONNECT/response-header timeout),
      // while a populated status means xAI answered and the failure is
      // downstream of the connection. That is the distinction the bare
      // `Request timed out.` could not make.
      const searchProbe = newTransportProbe();
      const searchClient = new OpenAI({
        apiKey,
        baseURL: XAI_BASE_URL,
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: 0,
        fetch: probingFetch(searchProbe),
      });
      const searchOpenedAt = Date.now();
      const searchShape =
        `(${messages.length} msg(s), ${searchPromptChars} prompt chars, ` +
        `max_output_tokens=${maxOut})`;

      if (GROK_SEARCH_STREAM) {
        const stream = await searchClient.responses
          .create({ ...searchBody, stream: true as const }, { signal })
          .catch((err: unknown) => {
            throw new Error(
              `${model} web-search response stream OPEN failed after ` +
                `${Date.now() - searchOpenedAt}ms [${describeTransport(searchProbe)}] ` +
                `${searchShape}: ${describeProviderError(err)}. If xAI is rejecting ` +
                `stream:true on /responses, set BAKEOFF_GROK_SEARCH_STREAM=0 to use the ` +
                `blocking transport (the mandatory live-search gate is unchanged either way).`,
            );
          });
        console.log(
          `    ⏱ ${model} web-search stream open: ${Date.now() - searchOpenedAt}ms ` +
            `[${describeTransport(searchProbe)}] ${searchShape}`,
        );
        const out = await consumeGrokResponsesStream(stream, {
          label: model,
          firstEventTimeoutMs: GROK_SEARCH_FIRST_EVENT_TIMEOUT_MS,
          idleTimeoutMs: GROK_SEARCH_IDLE_TIMEOUT_MS,
          abort: () => stream.controller.abort(),
          describeTransport: () => describeTransport(searchProbe),
        });
        console.log(
          `    ⏱ ${model} web-search stream done: firstEvent=${out.msToFirstEvent ?? "never"}ms ` +
            `firstSearch=${out.msToFirstSearchEvent ?? "never"}ms ` +
            `firstToken=${out.msToFirstText ?? "never"}ms ` +
            `total=${(out.msTotal / 1000).toFixed(1)}s events=${out.events} ` +
            `searchCalls=${out.searchCalls} searchEvents=${out.searchEvents} ` +
            `citations=${out.citations} answer=${out.textChars}ch ` +
            `reasoning=${out.reasoningChars}ch terminal=${out.terminalStatus ?? "none"} ` +
            `rawBytes=${searchProbe.rawBytes}` +
            (out.unknownEventTypes.length
              ? ` unreadEventTypes=[${out.unknownEventTypes.join(",")}]`
              : ""),
        );
        const searchState =
          `searchCalls=${out.searchCalls} citations=${out.citations} ` +
          `answer=${out.textChars}ch reasoning=${out.reasoningChars}ch ` +
          `events=${out.events} [${describeTransport(searchProbe)}]`;
        if (out.terminalStatus && out.terminalStatus !== "completed") {
          throw new Error(
            `${model} web-search run ended as ${out.terminalStatus}: ` +
              `${out.providerError ?? out.incompleteReason ?? "no detail"} — ${searchState}` +
              (out.incompleteReason === "max_output_tokens"
                ? ` — the ${maxOut}-token output budget was exhausted (hidden reasoning is ` +
                  `billed against it). Raise the turn's output budget or shorten its input.`
                : ""),
          );
        }
        if (out.terminalStatus === null) {
          // No terminal event means we cannot know the answer is whole, and a
          // truncated page accepted as complete is worse than a loud failure.
          throw new Error(
            `${model} web-search response stream ended with NO terminal ` +
              `response.completed/incomplete/failed event — ${searchState}` +
              (out.providerError ? ` provider error: ${out.providerError}.` : ".") +
              ` If xAI does not emit a terminal event on this endpoint, set ` +
              `BAKEOFF_GROK_SEARCH_STREAM=0 to use the blocking transport.`,
          );
        }
        // Live-fetch evidence, UNCHANGED in strictness: count provider-emitted
        // search calls / citations from the stream, cross-check against the
        // terminal response's own output items, and take whichever saw more. A
        // run with zero evidence still fails loud through `enforceLiveFetch`.
        const streamEvidence = out.searchCalls + out.citations;
        const finalEvidence = responsesSearchCount(out.finalResponse?.output);
        const searchCount = Math.max(streamEvidence, finalEvidence);
        enforceLiveFetch(model, opts.webSearch, searchCount > 0, searchCount);
        const raw = (out.text || out.finalResponse?.output_text || "").trim();
        if (!raw) {
          throw new Error(
            `${model} returned an empty web-search response after ` +
              `${(out.msTotal / 1000).toFixed(1)}s — ${searchState}, ` +
              `terminal=${out.terminalStatus}` +
              (out.unknownEventTypes.length
                ? `, unread event type(s): ${out.unknownEventTypes.join(",")}`
                : "."),
          );
        }
        return {
          content: unfence(raw),
          raw,
          usage: responsesUsage(out.finalResponse?.usage),
        };
      }

      // Blocking fallback (BAKEOFF_GROK_SEARCH_STREAM=0). Retained verbatim in
      // behaviour, but instrumented: on this transport the SDK's `timeout`
      // bounds the WHOLE generation (headers do not arrive until the answer is
      // finished), so a slow-but-healthy turn dies as a bare
      // `APIConnectionTimeoutError: Request timed out.` with no status. The
      // wrapper below names that explicitly instead.
      let resp = await searchClient.responses
        .create(searchBody, { signal })
        .catch((err: unknown) => {
          throw new Error(
            `${model} blocking web-search request failed after ` +
              `${Date.now() - searchOpenedAt}ms [${describeTransport(searchProbe)}] ` +
              `${searchShape}: ${describeProviderError(err)}` +
              (searchProbe.status === null
                ? ` — NO response headers were ever received, so this is a connect/response-header ` +
                  `timeout, not a provider error. On the blocking transport the ` +
                  `${REQUEST_TIMEOUT_MS}ms client timeout bounds the ENTIRE generation; leave ` +
                  `BAKEOFF_GROK_SEARCH_STREAM unset (streamed) or raise BAKEOFF_REQUEST_TIMEOUT_MS.`
                : ` — xAI responded with HTTP ${searchProbe.status}, so the failure is ` +
                  `provider-side, not a connection timeout.`),
          );
        });
      while (resp.status === "queued" || resp.status === "in_progress") {
        await abortableSleep(5_000, signal);
        resp = await searchClient.responses.retrieve(resp.id, undefined, { signal });
      }
      if (resp.status && resp.status !== "completed") {
        throw new Error(
          `${model} web-search run ended as ${resp.status}: ${
            resp.error?.message ?? resp.incomplete_details?.reason ?? "no detail"
          }`,
        );
      }
      // Live-fetch evidence: xAI's Responses surface mirrors OpenAI's — a
      // web_search_call output item and/or url_citation annotations on the message.
      const searchCount = responsesSearchCount(resp.output);
      enforceLiveFetch(model, opts.webSearch, searchCount > 0, searchCount);
      const raw = (resp.output_text ?? "").trim();
      if (!raw) throw new Error(`${model} returned an empty response.`);
      return { content: unfence(raw), raw, usage: responsesUsage(resp.usage) };
    }
    // Prompt caching: xAI auto-caches repeated prompt prefixes and bills the hit
    // portion as discounted cached tokens with no request-side flag (its
    // OpenAI-compatible surface rejects unknown fields, so no prompt_cache_key is
    // sent). The big verbatim-repeated prefix therefore still lands cache hits.
    //
    // STREAMED (not a single blocking call): on the full-history build/seo
    // turns grok-4.6 legitimately runs minutes with a large hidden reasoning
    // pass before its first visible byte — a plain non-streaming
    // chat.completions call holds one connection idle that whole time, which is
    // exactly the shape that trips "Request timed out" on a slower-generating
    // tag even though the eventual reply is fine (grok-4.20-0309-reasoning is
    // fast enough that the same non-streaming call never hit this). Streaming
    // keeps the connection actively receiving bytes throughout, matching the
    // approach the Claude adapter already uses for its own long generations, and
    // sidesteps the idle-connection timeout without changing the prompt, turn
    // order, or final content in any way.
    //
    // OBSERVABILITY + STALL WATCHDOG: the SDK's `timeout` bounds only
    // time-to-headers on a streamed call (see GROK_FIRST_EVENT_TIMEOUT_MS), so
    // a stream that opens and then says nothing used to hang all the way to the
    // generic 630s wall-clock backstop with no clue as to why. The probing
    // `fetch` below records status / connect time / raw body bytes (metadata
    // only), and `consumeGrokStream` bounds first-event and inter-event silence
    // while counting the deltas the accumulator does not read. Neither changes
    // the request: same model, same budget, same messages, same stream flags.
    const maxTokens = opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
    const promptChars =
      messages.reduce((n, m) => n + m.content.length, 0) + (system?.length ?? 0);
    const probe = newTransportProbe();
    const streamingClient = new OpenAI({
      apiKey,
      baseURL: XAI_BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 0,
      fetch: probingFetch(probe),
    });
    const openedAt = Date.now();
    const stream = await streamingClient.chat.completions
      .create(
        {
          model,
          max_tokens: maxTokens,
          messages: openAiMessages(messages, system),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      )
      .catch((err: unknown) => {
        // Surface the provider's OWN status + error body instead of letting a
        // 4xx read as a generic transport failure three layers up.
        throw new Error(
          `${model} stream open FAILED after ${Date.now() - openedAt}ms ` +
            `[${describeTransport(probe)}] (${messages.length} msg(s), ${promptChars} prompt chars, ` +
            `max_tokens=${maxTokens}): ${describeProviderError(err)}`,
        );
      });
    console.log(
      `    ⏱ ${model} stream open: ${Date.now() - openedAt}ms [${describeTransport(probe)}] ` +
        `(${messages.length} msg(s), ${promptChars} prompt chars, max_tokens=${maxTokens})`,
    );
    const outcome = await consumeGrokStream(stream, {
      label: model,
      firstEventTimeoutMs: GROK_FIRST_EVENT_TIMEOUT_MS,
      idleTimeoutMs: GROK_STREAM_IDLE_TIMEOUT_MS,
      abort: () => stream.controller.abort(),
      describeTransport: () => describeTransport(probe),
    });
    console.log(
      `    ⏱ ${model} stream done: firstEvent=${outcome.msToFirstChunk ?? "never"}ms ` +
        `firstToken=${outcome.msToFirstContent ?? "never"}ms total=${(outcome.msTotal / 1000).toFixed(1)}s ` +
        `events=${outcome.chunks} content=${outcome.contentChars}ch ` +
        `reasoning=${outcome.reasoningChars}ch toolDeltas=${outcome.toolCallChunks} ` +
        `finish=${outcome.finishReason ?? "none"} rawBytes=${probe.rawBytes}` +
        (outcome.ignoredDeltaKeys.length
          ? ` unparsedDeltaFields=[${outcome.ignoredDeltaKeys.join(",")}]`
          : ""),
    );
    const cu = outcome.usage;
    const raw = outcome.content.trim();
    if (!raw) {
      // An empty stream is a real provider failure, so it still throws — but now
      // it says WHY, in the same shape as the DeepSeek diagnostic above.
      throw new Error(
        `${model} returned an empty response after a ${(outcome.msTotal / 1000).toFixed(1)}s stream ` +
          `[${describeTransport(probe)}]: ${outcome.chunks} parsed event(s), ` +
          `${outcome.contentChars} visible char(s), ${outcome.reasoningChars} hidden reasoning char(s), ` +
          `${outcome.toolCallChunks} tool-call delta(s), finish_reason="${outcome.finishReason ?? "none"}"` +
          (outcome.ignoredDeltaKeys.length
            ? `, unparsed delta field(s): ${outcome.ignoredDeltaKeys.join(",")}`
            : "") +
          (outcome.finishReason === "length"
            ? ` — the ${maxTokens}-token output budget was exhausted before any visible content was ` +
              `emitted. Raise the output-token budget or shorten the turn's input.`
            : "."),
      );
    }
    // chat/completions usage: prompt_tokens/completion_tokens INCLUDE their
    // cached / reasoning subsets, reported in the *_details blocks. Null when no
    // usage block came back (so cost falls back to the estimate).
    const usage: TokenUsage | null = cu
      ? {
          inputTokens: cu.prompt_tokens ?? 0,
          cachedInputTokens: cu.prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: cu.completion_tokens ?? 0,
          reasoningTokens: cu.completion_tokens_details?.reasoning_tokens ?? 0,
        }
      : null;
    return { content: unfence(raw), raw, usage };
  }, "xai");
}

/** DeepSeek direct via its OpenAI-compatible endpoint, using STS's own
 * `Deepseek` secret (env var name kept exactly as provisioned). Like Grok, the
 * v4 family exposes no effort/reasoning-budget knob on this endpoint — an
 * explicit `effort` override is a config mistake, not something to fake, so it
 * fails loud at construction rather than silently ignoring the request. */
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

/**
 * DeepSeek's "flash"/"reasoner" tags are hidden-reasoning models: like OpenAI's
 * pro tier, the reasoning trace is billed against the SAME `max_tokens` budget
 * as the visible answer (`completion_tokens_details.reasoning_tokens` is a
 * SUBSET of `completion_tokens`, not additional). On a long generative HTML
 * build turn the model can burn the entire budget on its hidden reasoning and
 * hit `finish_reason: "length"` before emitting a single visible character —
 * that reads as a silent "empty response", not a thrown error. The plain
 * "-chat" tag has no hidden reasoning and needs no extra headroom. Mirrors
 * `OPENAI_MAX_OUTPUT_TOKENS`'s reasoning-headroom pattern.
 */
const DEEPSEEK_REASONING_MAX_OUTPUT_TOKENS = 64000;
export function makeDeepSeekComplete(model: string, effort?: string): CompleteFn {
  if (effort) {
    throw new Error(
      `DeepSeek effort override "${effort}" requested for ${model}, but DeepSeek's v4 API has no ` +
        `effort/reasoning-budget knob to apply it to.`,
    );
  }
  const apiKey = process.env.Deepseek;
  if (!apiKey) {
    throw new Error(`Deepseek secret is not set (required for model ${model}).`);
  }
  const client = new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  return guarded(model, async (messages, system, opts, signal) => {
    // DeepSeek's OpenAI-compatible surface has no native web-search tool at
    // all. A flagged turn therefore has NO evidence of live fetching to offer —
    // call enforceLiveFetch directly with searched=false so it fails loud
    // exactly like every other adapter would on a genuine no-search response,
    // rather than silently letting the turn (and the SEO-verify score) pass on
    // pure training-recall content.
    enforceLiveFetch(model, opts?.webSearch, false, 0);
    const reasoningTag = isDeepSeekReasoningTag(model);
    const resp = await client.chat.completions.create(
      {
        model,
        max_tokens:
          opts?.maxOutputTokens ?? (reasoningTag ? DEEPSEEK_REASONING_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS),
        messages: openAiMessages(messages, system),
      },
      { signal },
    );
    const raw = (resp.choices[0]?.message?.content ?? "").trim();
    if (!raw) {
      const finishReason = resp.choices[0]?.finish_reason ?? "unknown";
      const reasoningTokens =
        (resp.usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined)
          ?.completion_tokens_details?.reasoning_tokens ?? 0;
      if (reasoningTag && finishReason === "length") {
        throw new Error(
          `${model} returned an empty response: it exhausted its ${
            opts?.maxOutputTokens ?? DEEPSEEK_REASONING_MAX_OUTPUT_TOKENS
          }-token budget on hidden reasoning (${reasoningTokens} reasoning tokens) before emitting any ` +
            `visible content (finish_reason="length"). Raise the output-token budget further or shorten ` +
            `the turn's input.`,
        );
      }
      throw new Error(
        `${model} returned an empty response (finish_reason="${finishReason}", raw=${JSON.stringify(
          resp,
        ).slice(0, 500)}).`,
      );
    }
    const cu = resp.usage;
    const usage: TokenUsage | null = cu
      ? {
          inputTokens: cu.prompt_tokens ?? 0,
          cachedInputTokens: (cu as { prompt_tokens_details?: { cached_tokens?: number } })
            .prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: cu.completion_tokens ?? 0,
          reasoningTokens:
            (cu as { completion_tokens_details?: { reasoning_tokens?: number } })
              .completion_tokens_details?.reasoning_tokens ?? 0,
        }
      : null;
    return { content: unfence(raw), raw, usage };
  }, "deepseek");
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
    signal: AbortSignal.timeout(30_000),
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

function isDeepSeekReasoningTag(model: string): boolean {
  return /flash|reasoner/i.test(model);
}
