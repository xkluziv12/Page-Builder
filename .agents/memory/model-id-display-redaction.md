---
name: Model-id display redaction trap
description: Why hardcoding an LLM model id read from the editor can 404, and how to source the real one.
---

# Model-id display redaction trap

Frontier model names are redacted in the agent's VIEW of file contents and tool
output: the real Anthropic Sonnet literal `claude-sonnet-4-6` is shown to the
agent as `n-4-6`, Opus as `n-4-8`, etc. The redaction is inconsistent — sometimes
`rg` shows the true string, sometimes the masked one.

**The trap:** if you copy the masked form (`n-4-6`) and paste it as a string
literal into new code, you ship a fake model id. The provider call then fails
with `404 not_found_error {"model":"n-4-6"}`. The other providers (OpenAI
`gpt-5.4`, xAI `grok-*`, Google `gemini-*-preview`) are NOT redacted, so only the
Anthropic ids hit this.

**Why:** the system masks model names in transit; what the agent types is what
gets written to disk verbatim, so a masked literal becomes a real (broken) value.

**How to apply:** never hand-type an Anthropic model id from what you read on
screen. Either (a) import the constant from working code — `lib/mc-core`'s Claude
engine defines the real Sonnet default — or (b) reuse an id a successful run
already used (e.g. the bake-off `run.ts` Opus literal). If a brand-new Anthropic
call 404s on a plausible-looking id, suspect this first.
