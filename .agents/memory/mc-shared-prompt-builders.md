---
name: MC shared per-phase prompt builders
description: Single source of truth for Mission Control per-phase prompt text (build/audit/schema/verify) that both Dashboard and Replit modes consume.
---

# MC shared per-phase prompt builders

`lib/mc-core/src/prompts/builders.ts` is the single source of truth for the
per-phase prompt text (`build`, `audit`, `schema`, `verify`). BOTH Mission
Control modes consume it: Dashboard engines send `{system, user}` to a model
(via `PromptCompletionEngine` in `engine/base.ts`); Replit mode renders the same
text for a VA to copy-paste via the pure `promptForPhase(phase, ctx, html)`.

**Rule:** any feature that needs MC prompt text must call these builders. Never
re-inline prompt strings in an engine or in the UI — that reintroduces drift
between the two modes and breaks the parity gate.

**Why:** the two modes must execute byte-identical prompts; the parity gate is
the whole point. Before this, Dashboard inlined static strings while the
bake-off harness had the sharper GMB-aware logic — two copies that drift.

## GMB-aware vs No-GMB branch
- The branch key is **presence of `ctx.gmb`** (`GmbProfile | null` on
  `RunContext`), exactly analogous to `verifiedCid`. Null ⇒ No-GMB run.
- **No-GMB output is byte-for-byte identical** to the legacy Dashboard strings.
  `gmbBlock()` returns `""` so nothing is appended. There is a regression test
  (`prompts/builders.test.ts`) asserting the exact legacy strings — if you change
  `describeContext` or a builder's wording, that test guards the No-GMB path.
- GMB runs **append** a verified-NAP block after `describeContext` (mirrors the
  bake-off `gmbContextSuffix` pattern). It carries the real
  name/address/phone/hours/CID/?cid= map and says "invent nothing beyond this".
- `verify` is additive (no legacy baseline; `system` is ""). The old Dashboard
  pipeline had no verify phase.

## Fail-loud schema
The orchestrator's schema phase no longer silently substitutes a deterministic
`generateLocalBusinessSchema` placeholder when the engine returns invalid
JSON-LD — it **throws** and halts the run. Both modes inherit this via the shared
orchestrator. Don't reintroduce a placeholder fallback; a schema that doesn't
match its page is worse than a halted run.

**Why:** the silent fallback masked broken engine output and could publish a page
whose JSON-LD contradicts its content.
