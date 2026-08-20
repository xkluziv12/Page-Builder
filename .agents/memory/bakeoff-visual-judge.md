---
name: Bake-off visual judge (screenshots)
description: How the bake-off renders pages to screenshots and scores visual closeness; why it's set up this way.
---

# Bake-off visual judge

The bake-off's `visualMatch` is a TRUE visual judge, not CSS-token overlap. Each model's
final HTML and the real reference page are rendered to PNG screenshots with headless
Chromium, then scored by perceptual pixel-diff plus an optional vision-LLM rating.

**Rendering stack**: `playwright-core` (npm) + a Nix-installed `chromium` system dependency.
Playwright's own bundled browsers don't run on NixOS, so resolve the binary at runtime
(`which chromium`, the Nix store path moves) and pass it as `executablePath`. Launch with
`--no-sandbox --disable-gpu --disable-dev-shm-usage`.
**Why:** managed Nix chromium is the reliable browser on Replit; downloaded Playwright
binaries fail on missing shared libs.

**Comparable pixels**: capture at a FIXED viewport (1280×2400, `fullPage:false`, fixed clip)
so every screenshot has identical dimensions and `pixelmatch` can diff directly with no
resize step (avoids needing sharp). Pages mostly white at the bottom → perceptual scores
skew high in absolute terms; treat them as RELATIVE across models, not absolute.

**Combined score**: `visualMatch = mean(perceptual, visionLlm)` when the Anthropic
integration is available, else perceptual only. Old design-token overlap kept as the
secondary `visualTokens`. Vision rating fails soft (returns null) if keys/JSON missing.

**Re-judge without burning tokens**: `pnpm --filter @workspace/scripts run bakeoff:rescore`
reuses the saved model HTML in `artifacts/bake-off/src/data/results.json`, re-renders +
re-scores, and rewrites the JSON. The full `bakeoff` run hits 4 live LLM providers — don't
re-run it just to refresh the visual judge.
**How to apply:** screenshots are written to `artifacts/bake-off/public/screenshots/<scenario>/`
and referenced from results.json as relative paths (`screenshots/<scenario>/<id>.png`); the
viewer resolves them against `import.meta.env.BASE_URL`.

**Gotcha: outDir must include the scenario subdir, matching pathPrefix.** Both the inline
visual pass in `run.ts` AND `rescore-visual.ts` must write to
`outDir = SCREENSHOT_DIR/<scenario.id>` with `pathPrefix = screenshots/<scenario.id>`. If
`run.ts` writes to the bare `SCREENSHOT_DIR` while recording a `screenshots/<scenario>/...`
path, every scenario overwrites the SAME top-level files and the recorded paths point at
files that don't exist → broken images in the viewer (model ids collide across scenarios).
Keep the two code paths in lockstep; identical model ids in different scenarios MUST land in
different subdirs.
