# Bake-Off archive

Dated snapshots of bake-off runs, kept side-by-side for comparison across
versions. Each snapshot folder is self-contained: the full `results.json`, each
built page as standalone HTML (`pages/<scenario>/<model>.html`), the rendered
screenshots (`screenshots/<scenario>/...`), and a `NOTES.md` explaining what
changed in that version.

To archive a future run after it finishes: copy the live
`artifacts/bake-off/src/data/results.json` and
`artifacts/bake-off/public/screenshots/` into a new dated folder here and add a
`NOTES.md` describing what changed vs. the prior version.

## Versions

| Date       | Folder                          | Note                                   |
|------------|---------------------------------|----------------------------------------|
| 2026-06-23 | `2026-06-23-full-adherence/`    | Full adherence to the human checklist: verbatim mini-prompts + real fixtures, intro handshake validated, seo-verify/verify-links verdicts acted on. Sonnet-tier baseline, GMB + No-GMB, 4 models. |
| 2026-06-23 | `2026-06-23-opus-tier-4model/`  | Intermediate (results.json only): preserves the GMB scenario data captured during the Opus-tier run just before GMB was dropped. 4 models, OpenAI = ERROR (pre background-mode fix). |
| 2026-06-23 | `2026-06-23-opus-tier-5model/`  | Top-tier No-GMB-only deliverable: Claude Opus 4.8 + Gemini 3.1 Pro + Grok 4.3 + both OpenAI tiers (`gpt-5.5` standard and `gpt-5.5-pro` via background mode). Pro did not win (standard 75 > pro 73; Claude 76 led). |
