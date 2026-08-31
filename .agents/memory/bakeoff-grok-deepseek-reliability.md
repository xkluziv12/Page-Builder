---
name: Bake-off Grok/DeepSeek reliability
description: Why Grok timed out on build/seo turns and why DeepSeek's reasoning tags returned empty replies, and the fixes.
---

# Grok timeouts and DeepSeek empty replies in the bake-off harness

## Grok: non-streaming call on a slow turn trips "Request timed out"
`makeGrokComplete` used a single blocking `client.chat.completions.create(...)`
(no `stream: true`) for the plain (non web-search) turn. On the full-history
build/seo turns, xAI's Grok family can legitimately run minutes with a large
hidden reasoning pass before the first visible byte — a non-streaming call holds
one idle connection that whole time, which is the exact shape that trips
"Request timed out" on a slower-generating tag even though the eventual reply
would have been fine.

**Why:** confirmed empirically — direct large-prompt tests against xAI never
exceeded ~155-230s even at 135K prompt tokens (well under the 600s
`REQUEST_TIMEOUT_MS`), so the timeout was about connection idling, not the
underlying per-call wall-clock budget being too small.

**Fix:** switched the Grok adapter's plain-turn call to `stream: true` (like the
Claude adapter already does), accumulating `delta.content` and reading
`stream_options.include_usage` for the final usage block. This changes transport
only — same prompt/history/turn order — so the comparison stays apples-to-apples.
A live no-gmb run after the fix completed all turns (intro/build/seo/seo-verify/
schema/verify-links) for Grok in ~820s total with zero timeouts.

## DeepSeek: reasoning tags can burn the whole `max_tokens` budget on hidden reasoning
DeepSeek's "flash"/"reasoner" tags are hidden-reasoning models: like OpenAI's pro
tier, `completion_tokens_details.reasoning_tokens` is a SUBSET of
`completion_tokens`, billed against the same `max_tokens` budget as the visible
answer. On a long generative HTML build turn the model can spend the entire
budget on its hidden reasoning and hit `finish_reason: "length"` before emitting
a single visible character — that reads as a silent "empty response", not a
thrown error. Confirmed directly: a small `max_tokens` reproduces this 100% of
the time; the module's existing 32000 cap usually suffices but is not immune
under long real conversations.

**Fix:** added `DEEPSEEK_REASONING_MAX_OUTPUT_TOKENS` (64000) applied only to
tags matching `/flash|reasoner/i`, and turned the empty-response case into a
diagnostic error naming the finish_reason + reasoning-token count instead of a
generic "empty response" — makes future recurrences instantly diagnosable.
Verified live: deepseek-v4-flash's build turn (previously empty) now returns a
normal ~50KB document.

## Separate, pre-existing, structural gap: DeepSeek (and any no-search model) can't pass seo-verify
The seo-verify turn `enforceLiveFetch`s a native web-search call; DeepSeek's API
exposes no native web-search tool at all, so BOTH deepseek-v4-pro and
deepseek-v4-flash fail loud there (as does gemini-3.1-pro-preview in the same
run) — this is NOT the build-turn empty-reply bug, is unrelated to the Grok/
DeepSeek fixes above, and should not be "fixed" by weakening the fail-loud search
gate (that gate is intentional and must stay uniform). Tracked as a separate
follow-up, not patched inline.
