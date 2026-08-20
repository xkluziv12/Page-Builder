# 2026-06-23 — Opus-tier, No-GMB only, 5 models

This is the top-tier apples-to-apples re-run requested after `full-adherence`.

## What changed vs. `2026-06-23-full-adherence`

- **Model tier jump (Claude + OpenAI only).** Live probing showed the only
  providers with a tier above the prior baseline are Anthropic and OpenAI:
  - Claude: `claude-sonnet` baseline → **`claude-opus-4-8`**.
  - OpenAI: prior chat tag → **`gpt-5.5-pro`** (pro) **plus** a standard
    **`gpt-5.5`** entrant, so pro vs. standard can be compared directly.
  - Google has no tier above `gemini-3.1-pro-preview` and xAI none above
    `grok-4.3`, so **Gemini and Grok are unchanged** (carried over, identical
    grounding, not re-run).
- **No-GMB only.** The GMB scenario was dropped from the deliverable going
  forward (operator decision). The prior 4-model GMB+No-GMB snapshot taken just
  before the drop is preserved in `../2026-06-23-opus-tier-4model/` (results.json
  only).
- **Shared grounding reused verbatim** from the prior run (4447 chars), so the
  research input is identical across every model and both tiers.

## OpenAI transport (pro) — the hard part

`gpt-5.5-pro` is served only by the **Responses API**, not `chat/completions`
(which 404s "not a chat model"). Two non-obvious facts cost several attempts:

1. **Pro rejects `reasoning.effort: "low"`** — valid values are
   `medium | high | xhigh`, and it defaults to the slow `high`. We pin it to the
   `medium` floor (`BAKEOFF_OPENAI_REASONING`, pro-only; standard runs at the API
   default).
2. **The synchronous Responses endpoint has a server-side processing cap
   (~minutes)** that pro exceeds on the full page-build turn — it returns
   "Request timed out" *regardless of how high our own client timeout is set*
   (confirmed: failed in ~3–4 min even with a 45-min client cap). The fix is
   OpenAI **background mode**: submit the identical request as a background job
   and poll `responses.retrieve` to completion. This is a transport change only
   (same prompt / input / turn order) and is applied uniformly to every OpenAI
   tag, so no model is special-cased. With it, the pro build turn that used to
   time out completed in ~5 min and the full pro run in ~13 min.

> Note: chunking the page build into sections *would* dodge the cap, but every
> other model builds the whole page in one build turn — chunking only pro would
> be per-model special-casing and break the apples-to-apples comparison. Background
> mode keeps the single faithful build turn.

## Result (No-GMB, composite /100)

| Rank | Model               | Model tag                 | Composite |
|------|---------------------|---------------------------|-----------|
| 1    | Claude Opus 4.8     | `claude-opus-4-8`         | 76        |
| 2    | OpenAI GPT-5.5      | `gpt-5.5` (standard)      | 75        |
| 3    | Gemini 3.1 Pro      | `gemini-3.1-pro-preview`  | 73        |
| 3    | OpenAI GPT-5.5-PRO  | `gpt-5.5-pro`             | 73        |
| 5    | Grok (xAI)          | `grok-4.3`                | 72        |

**Headline:** the pro tier did **not** win — standard `gpt-5.5` (75) edged
`gpt-5.5-pro` (73) here despite ~6× the wall time, and Claude Opus 4.8 led overall.
