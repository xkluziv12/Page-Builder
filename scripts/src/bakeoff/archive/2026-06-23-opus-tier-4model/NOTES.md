# 2026-06-23 — Opus-tier, partial GMB-preservation snapshot (results.json only)

This is an **intermediate** snapshot, not a clean deliverable. It preserves the
**GMB scenario** data captured during the Opus-tier run just before GMB was
dropped from the board (operator decision: No-GMB only going forward).

- Contains both `no-gmb` and `gmb` scenarios, **4 models** (Claude Opus 4.8,
  Gemini 3.1 Pro, Grok 4.3, OpenAI — recorded as ERROR at this point, before the
  background-mode fix).
- Kept only so the completed GMB pages for Claude/Gemini/Grok are not lost when
  the live board went No-GMB only.
- The clean, final deliverable (No-GMB, 5 models, OpenAI fixed via background
  mode, with pages + screenshots) is in `../2026-06-23-opus-tier-5model/`.

GMB scenario scores at snapshot time (composite /100): Claude 70, Grok 66,
Gemini 65, OpenAI ERROR.
