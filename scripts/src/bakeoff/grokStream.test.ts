import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  consumeGrokResponsesStream,
  consumeGrokStream,
  describeProviderError,
} from "./providers";

// Focused, network-free coverage of the Grok chat/completions STREAM consumer.
//
// Why this exists: `openai@6`'s client `timeout` only bounds time-to-headers on
// a streamed call (its abort timer is cleared the instant `fetch` resolves), so
// once the SSE connection is open nothing inside the SDK bounds the body. The
// live symptom was a build turn sitting for 630s and reporting only "timed out
// ... with no response" — no way to tell "provider sent nothing" from "provider
// streamed hidden reasoning the accumulator threw away". `consumeGrokStream`
// takes a plain async iterable, so both the stall windows and the delta
// accounting are testable here without touching xAI.

type Chunk = OpenAI.ChatCompletionChunk;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Minimal chunk builder — only the fields the consumer reads. */
function chunk(delta: Record<string, unknown>, finish?: string, usage?: unknown): Chunk {
  return {
    id: "c",
    object: "chat.completion.chunk",
    created: 0,
    model: "grok-test",
    choices: [{ index: 0, delta, finish_reason: (finish ?? null) as never, logprobs: null }],
    ...(usage ? { usage } : {}),
  } as unknown as Chunk;
}

/** Yield chunks immediately, then end. */
async function* immediate(...chunks: Chunk[]): AsyncGenerator<Chunk> {
  for (const c of chunks) yield c;
}

const WATCHDOG_OFF = {
  label: "grok-test",
  firstEventTimeoutMs: 10_000,
  idleTimeoutMs: 10_000,
  abort: () => {},
};

describe("consumeGrokStream — delta accounting", () => {
  it("accumulates visible content and records usage, finish_reason and timings", async () => {
    const out = await consumeGrokStream(
      immediate(
        chunk({ role: "assistant" }),
        chunk({ content: "<!DOCTYPE " }),
        chunk({ content: "html>" }, "stop"),
        chunk({}, undefined, { prompt_tokens: 12, completion_tokens: 3 }),
      ),
      WATCHDOG_OFF,
    );
    expect(out.content).toBe("<!DOCTYPE html>");
    expect(out.contentChars).toBe(15);
    expect(out.chunks).toBe(4);
    expect(out.finishReason).toBe("stop");
    expect(out.usage?.prompt_tokens).toBe(12);
    expect(out.msToFirstChunk).not.toBeNull();
    expect(out.msToFirstContent).not.toBeNull();
  });

  it("counts hidden reasoning deltas WITHOUT folding them into the answer", async () => {
    const out = await consumeGrokStream(
      immediate(
        chunk({ reasoning_content: "thinking hard about the page" }),
        chunk({ reasoning_content: "still thinking" }),
        chunk({ content: "OK" }, "stop"),
      ),
      WATCHDOG_OFF,
    );
    expect(out.content).toBe("OK");
    expect(out.reasoningChars).toBe("thinking hard about the page".length + "still thinking".length);
  });

  it("reports a reasoning-only stream as zero visible content, not as an answer", async () => {
    const out = await consumeGrokStream(
      immediate(chunk({ reasoning_content: "…" }), chunk({}, "length")),
      WATCHDOG_OFF,
    );
    expect(out.content).toBe("");
    expect(out.contentChars).toBe(0);
    expect(out.reasoningChars).toBe(1);
    expect(out.finishReason).toBe("length");
  });

  it("surfaces delta fields the accumulator does not read", async () => {
    const out = await consumeGrokStream(
      immediate(chunk({ refusal: "no" }), chunk({ some_future_field: 1, content: "hi" }, "stop")),
      WATCHDOG_OFF,
    );
    expect(out.ignoredDeltaKeys.sort()).toEqual(["refusal", "some_future_field"]);
  });

  it("counts tool-call deltas", async () => {
    const out = await consumeGrokStream(
      immediate(chunk({ tool_calls: [{ index: 0 }] }), chunk({ content: "hi" }, "stop")),
      WATCHDOG_OFF,
    );
    expect(out.toolCallChunks).toBe(1);
  });

  it("tolerates a usage-only terminal frame carrying no choices", async () => {
    const usageOnly = {
      id: "c",
      object: "chat.completion.chunk",
      created: 0,
      model: "grok-test",
      choices: [],
      usage: { prompt_tokens: 5, completion_tokens: 1 },
    } as unknown as Chunk;
    const out = await consumeGrokStream(immediate(chunk({ content: "hi" }), usageOnly), WATCHDOG_OFF);
    expect(out.content).toBe("hi");
    expect(out.usage?.prompt_tokens).toBe(5);
  });
});

describe("consumeGrokStream — stall watchdog", () => {
  it("fails loud when the stream opens but never yields a parsed event", async () => {
    async function* silent(): AsyncGenerator<Chunk> {
      await sleep(300);
      yield chunk({ content: "too late" });
    }
    const abort = vi.fn();
    await expect(
      consumeGrokStream(silent(), {
        label: "grok-4.6",
        firstEventTimeoutMs: 40,
        idleTimeoutMs: 10_000,
        abort,
        describeTransport: () => "http=200 connectMs=90 firstByteMs=none rawBytes=0 quietMs=n/a",
      }),
    ).rejects.toThrow(/grok-4\.6 opened a stream but produced NO parsed event within 0s/);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("folds the transport state into the first-event stall error", async () => {
    async function* silent(): AsyncGenerator<Chunk> {
      await sleep(300);
      yield chunk({ content: "x" });
    }
    await expect(
      consumeGrokStream(silent(), {
        label: "grok-4.6",
        firstEventTimeoutMs: 40,
        idleTimeoutMs: 10_000,
        abort: () => {},
        describeTransport: () => "http=200 connectMs=90 firstByteMs=120 rawBytes=4096 quietMs=30000",
      }),
    ).rejects.toThrow(/rawBytes=4096/);
  });

  it("fails loud when the stream goes silent mid-generation, naming what arrived", async () => {
    async function* stalls(): AsyncGenerator<Chunk> {
      yield chunk({ content: "<!DOCTYPE html>" });
      await sleep(300);
      yield chunk({ content: "never seen" });
    }
    const abort = vi.fn();
    await expect(
      consumeGrokStream(stalls(), {
        label: "grok-4.6",
        firstEventTimeoutMs: 10_000,
        idleTimeoutMs: 40,
        abort,
        describeTransport: () => "http=200 connectMs=90 firstByteMs=120 rawBytes=512 quietMs=40",
      }),
    ).rejects.toThrow(/went silent for 0s after 1 event\(s\).*content=15ch/s);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("does not stall while events keep arriving inside the idle window", async () => {
    async function* slowButAlive(): AsyncGenerator<Chunk> {
      for (let i = 0; i < 5; i++) {
        await sleep(20);
        yield chunk({ reasoning_content: "." });
      }
      yield chunk({ content: "done" }, "stop");
    }
    const out = await consumeGrokStream(slowButAlive(), {
      label: "grok-4.6",
      firstEventTimeoutMs: 500,
      idleTimeoutMs: 200,
      abort: () => {},
    });
    expect(out.content).toBe("done");
    expect(out.reasoningChars).toBe(5);
  });

  it("treats a non-positive window as watchdog-off rather than an instant stall", async () => {
    async function* slow(): AsyncGenerator<Chunk> {
      await sleep(30);
      yield chunk({ content: "ok" }, "stop");
    }
    const out = await consumeGrokStream(slow(), {
      label: "grok-4.6",
      firstEventTimeoutMs: 0,
      idleTimeoutMs: 0,
      abort: () => {},
    });
    expect(out.content).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Grok RESPONSES-API stream (the mandatory web-search turn).
//
// Why this exists: that turn used to be a single BLOCKING `responses.create`,
// where `openai@6`'s client timeout bounds the WHOLE generation (its abort
// timer is cleared when `fetch` resolves, and on a non-streamed body that is
// only once the answer is finished). The live failure was the SDK's verbatim
// `APIConnectionTimeoutError: Request timed out.` — no HTTP status, no evidence
// of whether xAI had searched, generated, or done nothing at all. The turn is
// streamed now, and this covers the consumer that has to tell those apart —
// without ever relaxing the mandatory live-search gate.

type Ev = OpenAI.Responses.ResponseStreamEvent;

/** Minimal event builder — only the fields the consumer reads. */
const ev = (type: string, rest: Record<string, unknown> = {}): Ev =>
  ({ type, sequence_number: 0, ...rest }) as unknown as Ev;

const done = (status: string, extra: Record<string, unknown> = {}): Ev =>
  ev(`response.${status}`, { response: { status, ...extra } });

async function* evs(...items: Ev[]): AsyncGenerator<Ev> {
  for (const e of items) yield e;
}

const RESP_WATCHDOG_OFF = {
  label: "grok-test",
  firstEventTimeoutMs: 10_000,
  idleTimeoutMs: 10_000,
  abort: () => {},
};

describe("consumeGrokResponsesStream — answer + live-search accounting", () => {
  it("accumulates output-text deltas and records the terminal response", async () => {
    const out = await consumeGrokResponsesStream(
      evs(
        ev("response.created"),
        ev("response.output_text.delta", { delta: "All " }),
        ev("response.output_text.delta", { delta: "good." }),
        done("completed", { output_text: "All good.", usage: { input_tokens: 9 } }),
      ),
      RESP_WATCHDOG_OFF,
    );
    expect(out.text).toBe("All good.");
    expect(out.textChars).toBe(9);
    expect(out.terminalStatus).toBe("completed");
    expect(out.finalResponse?.usage?.input_tokens).toBe(9);
    expect(out.msToFirstEvent).not.toBeNull();
    expect(out.msToFirstText).not.toBeNull();
  });

  it("dedupes the in_progress/searching/completed trio into ONE search call", async () => {
    const out = await consumeGrokResponsesStream(
      evs(
        ev("response.web_search_call.in_progress", { item_id: "ws_1" }),
        ev("response.web_search_call.searching", { item_id: "ws_1" }),
        ev("response.web_search_call.completed", { item_id: "ws_1" }),
        ev("response.web_search_call.in_progress", { item_id: "ws_2" }),
        ev("response.web_search_call.completed", { item_id: "ws_2" }),
        ev("response.output_text.delta", { delta: "ok" }),
        done("completed"),
      ),
      RESP_WATCHDOG_OFF,
    );
    expect(out.searchCalls).toBe(2);
    expect(out.searchEvents).toBe(5);
    expect(out.msToFirstSearchEvent).not.toBeNull();
  });

  it("counts a web_search output item as a search call and shares its id with the progress events", async () => {
    const out = await consumeGrokResponsesStream(
      evs(
        ev("response.output_item.added", { item: { id: "ws_1", type: "web_search_call" } }),
        ev("response.web_search_call.in_progress", { item_id: "ws_1" }),
        ev("response.output_item.added", { item: { id: "msg_1", type: "message" } }),
        ev("response.output_text.delta", { delta: "ok" }),
        done("completed"),
      ),
      RESP_WATCHDOG_OFF,
    );
    expect(out.searchCalls).toBe(1);
  });

  it("counts url_citation annotations and ignores other annotation types", async () => {
    const out = await consumeGrokResponsesStream(
      evs(
        ev("response.output_text.annotation.added", { annotation: { type: "url_citation" } }),
        ev("response.output_text.annotation.added", { annotation: { type: "url_citation" } }),
        ev("response.output_text.annotation.added", { annotation: { type: "file_citation" } }),
        ev("response.output_text.delta", { delta: "ok" }),
        done("completed"),
      ),
      RESP_WATCHDOG_OFF,
    );
    expect(out.citations).toBe(2);
  });

  it("reports ZERO search evidence when the model never called the tool", async () => {
    // This is the shape the mandatory gate must reject: a perfectly healthy,
    // completed answer written from training recall. The consumer must not
    // manufacture evidence to rescue it.
    const out = await consumeGrokResponsesStream(
      evs(ev("response.output_text.delta", { delta: "from memory" }), done("completed")),
      RESP_WATCHDOG_OFF,
    );
    expect(out.searchCalls).toBe(0);
    expect(out.citations).toBe(0);
    expect(out.textChars).toBe(11);
  });

  it("counts hidden reasoning deltas WITHOUT folding them into the answer", async () => {
    const out = await consumeGrokResponsesStream(
      evs(
        ev("response.reasoning_text.delta", { delta: "thinking" }),
        ev("response.reasoning_summary_text.delta", { delta: "more" }),
        ev("response.output_text.delta", { delta: "OK" }),
        done("completed"),
      ),
      RESP_WATCHDOG_OFF,
    );
    expect(out.text).toBe("OK");
    expect(out.reasoningChars).toBe("thinking".length + "more".length);
  });

  it("separates 'searched but wrote nothing' from 'wrote but never searched'", async () => {
    const searchedOnly = await consumeGrokResponsesStream(
      evs(
        ev("response.web_search_call.in_progress", { item_id: "ws_1" }),
        ev("response.reasoning_text.delta", { delta: "…" }),
        done("incomplete", { incomplete_details: { reason: "max_output_tokens" } }),
      ),
      RESP_WATCHDOG_OFF,
    );
    expect(searchedOnly.searchCalls).toBe(1);
    expect(searchedOnly.textChars).toBe(0);
    expect(searchedOnly.terminalStatus).toBe("incomplete");
    expect(searchedOnly.incompleteReason).toBe("max_output_tokens");
  });
});

describe("consumeGrokResponsesStream — terminal states and unknown events", () => {
  it("records a failed run's provider-authored error", async () => {
    const out = await consumeGrokResponsesStream(
      evs(done("failed", { error: { code: "server_error", message: "upstream unavailable" } })),
      RESP_WATCHDOG_OFF,
    );
    expect(out.terminalStatus).toBe("failed");
    expect(out.providerError).toBe("upstream unavailable");
  });

  it("records a standalone error event as code + message", async () => {
    const out = await consumeGrokResponsesStream(
      evs(ev("error", { code: "rate_limit", message: "slow down" })),
      RESP_WATCHDOG_OFF,
    );
    expect(out.providerError).toBe("rate_limit: slow down");
  });

  it("reports a stream that ended with no terminal event as terminalStatus null", async () => {
    const out = await consumeGrokResponsesStream(
      evs(ev("response.output_text.delta", { delta: "half" })),
      RESP_WATCHDOG_OFF,
    );
    expect(out.terminalStatus).toBeNull();
    expect(out.text).toBe("half");
  });

  it("surfaces event types it does not read, and bounds how many it keeps", async () => {
    const noisy = Array.from({ length: 40 }, (_, i) => ev(`response.some_new_thing.${i}`));
    const out = await consumeGrokResponsesStream(
      evs(...noisy, ev("response.content_part.added"), done("completed")),
      RESP_WATCHDOG_OFF,
    );
    expect(out.unknownEventTypes.length).toBe(12);
    // Lifecycle noise the consumer deliberately ignores is NOT reported as unknown.
    expect(out.unknownEventTypes).not.toContain("response.content_part.added");
  });
});

describe("consumeGrokResponsesStream — stall watchdog", () => {
  it("fails loud when the stream opens but never yields a parsed event", async () => {
    async function* silent(): AsyncGenerator<Ev> {
      await sleep(300);
      yield ev("response.output_text.delta", { delta: "too late" });
    }
    const abort = vi.fn();
    await expect(
      consumeGrokResponsesStream(silent(), {
        label: "grok-4.6",
        firstEventTimeoutMs: 40,
        idleTimeoutMs: 10_000,
        abort,
        describeTransport: () => "http=200 connectMs=90 firstByteMs=none rawBytes=0 quietMs=n/a",
      }),
    ).rejects.toThrow(
      /grok-4\.6 opened a web-search response stream but produced NO parsed event within 0s.*rawBytes=0/s,
    );
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("names the search + answer state in a mid-stream idle stall", async () => {
    async function* stalls(): AsyncGenerator<Ev> {
      yield ev("response.web_search_call.in_progress", { item_id: "ws_1" });
      yield ev("response.output_text.delta", { delta: "partial" });
      await sleep(300);
      yield done("completed");
    }
    const abort = vi.fn();
    await expect(
      consumeGrokResponsesStream(stalls(), {
        label: "grok-4.6",
        firstEventTimeoutMs: 10_000,
        idleTimeoutMs: 40,
        abort,
        describeTransport: () => "http=200 connectMs=90 firstByteMs=120 rawBytes=512 quietMs=40",
      }),
    ).rejects.toThrow(/went silent for 0s after 2 event\(s\).*searchCalls=1.*answer=7ch/s);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("does not stall while tool-progress events keep the stream alive", async () => {
    async function* slowButAlive(): AsyncGenerator<Ev> {
      for (let i = 0; i < 5; i++) {
        await sleep(20);
        yield ev("response.web_search_call.searching", { item_id: `ws_${i}` });
      }
      yield ev("response.output_text.delta", { delta: "done" });
      yield done("completed");
    }
    const out = await consumeGrokResponsesStream(slowButAlive(), {
      label: "grok-4.6",
      firstEventTimeoutMs: 500,
      idleTimeoutMs: 200,
      abort: () => {},
    });
    expect(out.text).toBe("done");
    expect(out.searchCalls).toBe(5);
  });
});

describe("describeProviderError", () => {
  it("renders a plain Error as name + message", () => {
    expect(describeProviderError(new TypeError("fetch failed"))).toBe("TypeError: fetch failed");
  });

  it("truncates very long provider messages", () => {
    const long = describeProviderError(new Error("x".repeat(5000)));
    expect(long.length).toBeLessThan(500);
  });

  it("renders a non-Error throw as a bounded string", () => {
    expect(describeProviderError({ weird: true })).toBe("[object Object]");
  });
});
