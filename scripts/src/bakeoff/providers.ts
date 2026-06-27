import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { EngineResult } from "@workspace/mc-core";

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

export type CompleteFn = (
  messages: ChatMessage[],
  system?: string,
  opts?: CompleteOptions,
) => Promise<EngineResult>;

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
const OPENAI_REASONING_EFFORT = (process.env.BAKEOFF_OPENAI_REASONING ?? "medium") as
  | "low"
  | "medium"
  | "high";

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
) => Promise<EngineResult>;

/**
 * Wrap a raw completion with a per-request timeout + small bounded retry. This
 * is the ONLY behavioural change vs. a plain provider call: it is transport
 * resilience, not a prompt/history change, so the comparison stays faithful. A
 * refusal returns content normally (no throw) and is therefore NOT retried —
 * only thrown transport/empty-response failures are.
 */
function guarded(model: string, fn: RawComplete): CompleteFn {
  return async (messages, system, opts) => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await withTimeout(
          (signal) => fn(messages, system, opts, signal),
          WALL_CLOCK_MS,
          `${model} completion`,
        );
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
 */
function enforceLiveFetch(
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

/** Claude direct, with STS's own ANTHROPIC_API_KEY. */
export function makeClaudeComplete(model: string): CompleteFn {
  const client = new Anthropic({
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  return guarded(model, async (messages, system, opts) => {
    // Stream: the Anthropic SDK refuses non-streaming requests whose token
    // budget could push the call past 10 minutes (full SEO pages are large).
    const stream = client.messages.stream({
      model,
      max_tokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      ...(system ? { system } : {}),
      // Native web_search server tool, attached ONLY on the flagged turn. Claude
      // runs the search itself and folds the results into its answer; we still
      // read only the text blocks below, so search/tool-result blocks are ignored.
      ...(opts?.webSearch
        ? { tools: [{ type: "web_search_20250305" as const, name: "web_search" as const }] }
        : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
    return { content: unfence(raw), raw };
  });
}

/** Gemini direct, with STS's own GEMINI_API_KEY. */
export function makeGeminiComplete(model: string): CompleteFn {
  const ai = new GoogleGenAI({
    apiKey: requireEnv("GEMINI_API_KEY"),
    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
  });
  return guarded(model, async (messages, system, opts) => {
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
    return { content: unfence(raw), raw };
  });
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
export function makeOpenAIComplete(model: string): CompleteFn {
  const client = new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  // The "pro" tier mandates an explicit reasoning effort and rejects "low"
  // (valid: medium | high | xhigh), defaulting to the slow "high" when unset — so
  // we pin it to a configurable floor (medium). The plain chat tags (e.g. gpt-5.5)
  // run at the API default with no reasoning override. This only tunes HOW HARD a
  // pro model thinks; prompts, history, and turn order are identical everywhere.
  const isPro = /\bpro\b/i.test(model) || model.toLowerCase().includes("-pro");
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
        max_output_tokens: opts?.maxOutputTokens ?? OPENAI_MAX_OUTPUT_TOKENS,
        background: true,
        ...(isPro ? { reasoning: { effort: OPENAI_REASONING_EFFORT } } : {}),
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
    return { content: unfence(raw), raw };
  });
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

/** Grok direct via xAI's OpenAI-compatible endpoint, with STS's own XAI_API_KEY. */
export function makeGrokComplete(model: string): CompleteFn {
  const client = new OpenAI({
    apiKey: requireEnv("XAI_API_KEY"),
    baseURL: XAI_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
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
    if (opts?.webSearch) {
      let resp = await client.responses.create(
        {
          model,
          max_output_tokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
          tools: [{ type: "web_search" as const }],
          ...(system ? { instructions: system } : {}),
          input: messages.map((m) => ({ role: m.role, content: m.content })),
        },
        { signal },
      );
      while (resp.status === "queued" || resp.status === "in_progress") {
        await abortableSleep(5_000, signal);
        resp = await client.responses.retrieve(resp.id, undefined, { signal });
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
      enforceLiveFetch(model, opts?.webSearch, searchCount > 0, searchCount);
      const raw = (resp.output_text ?? "").trim();
      if (!raw) throw new Error(`${model} returned an empty response.`);
      return { content: unfence(raw), raw };
    }
    const resp = await client.chat.completions.create({
      model,
      max_tokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      messages: openAiMessages(messages, system),
    });
    const raw = (resp.choices[0]?.message?.content ?? "").trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw };
  });
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
