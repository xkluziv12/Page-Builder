---
name: Routed Dashboard engine (mc-core)
description: How Mission Control's model-backed Dashboard path gets bake-off-style orchestration without touching the orchestrator/checkers.
---

# Routed Dashboard engine

Mission Control's Dashboard (model-backed) runs route through a `RoutedEngine`
(an `AIEngine` implementation in `lib/mc-core/src/engine/`) instead of a bare
Claude/OpenAI/Gemini engine. It layers per-phase model routing, in-flight
timeouts, retry → main→backup fallback, output validation, and a verify +
corrective-re-verify loop ON TOP of the existing engines.

**Why:** the multi-LLM bake-off harness (`scripts/src/bakeoff/**`, read-only)
proved these orchestration strengths; this brings them to the live Dashboard path
without re-implementing the pipeline.

**How to apply / invariants to keep:**
- NEVER change the pipeline orchestrator or the deterministic checker quality
  gate to add orchestration behavior — it belongs in `RoutedEngine` /
  `transport.ts` behind the `AIEngine` seam, so prompts stay byte-identical.
- The verify turn (`verifyPrompt`, ✅ VERIFIED / ❌ FAILED) is only wired into the
  Dashboard path *through* `RoutedEngine.auditPage`; the orchestrator itself has
  no verify phase. A bare engine's `verifyPage` returns one turn.
- A **null verdict** (no ✅/❌ line) is "invalid output" at the routing layer —
  it must trigger retry → main→backup fallback, exactly like empty/refusal/
  missing-HTML/invalid-JSON. Only a clear ❌ FAILED is "valid output" handed to
  the corrective re-verify loop. The loop fails loud if no ✅ is reached.
- `readVerdict` is **last-match-wins** so a quoted rubric never overrides the
  model's final verdict line.
- Fail-loud policy split: the **requested (main) engine** and any **explicit**
  `MC_ROUTE_<PHASE>_{MAIN,BACKUP}` route fail loud on a missing provider key. The
  **default** auto-backup degrades to main-only with a loud `logger.warn` (the
  user only picked the main engine; an optional resilience backend shouldn't sink
  the whole run). Keep that asymmetry.
- Timeouts must ABORT in-flight requests: engines wrap `complete()` in
  `withTimeout(signal)`. OpenAI threads the signal into create + `retrieve(id,
  undefined,{signal})` + `abortableSleep` poll, and best-effort `cancel`s the
  background job on abort. Gemini uses `config.abortSignal`; Claude uses
  `{signal}`.
- Env knobs: `MC_REQUEST_TIMEOUT_MS`, `MC_MAX_ATTEMPTS`, `MC_VERIFY_CORRECTIONS`,
  `MC_ROUTE_<PHASE>_{MAIN,BACKUP}`, `MC_SYNTHESIS_PROVIDER`, `MC_SYNTHESIS_MODEL`.
