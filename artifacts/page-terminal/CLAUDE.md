# Page Terminal (M.A.R.K.)

Internal SEO/content-ops console for STS (and TechnoCycle sub-brand). The React
shell is just chrome: a top nav with a tool picker and an `<iframe>` that loads
one of several **self-contained static HTML tools** from `public/tools/`.
"M.A.R.K." = *Machine Assisted Routing Kit*, the branding baked into several
of those tool files (`index.html` title, `mark-attr` footer, etc.) and into
the admin-token localStorage key.

This is one artifact in a larger Replit monorepo. Sibling artifacts (notably
`../mission-control`, an "OLD"/"NEW" system-switch link target from the nav)
and shared packages under `../../lib/` (e.g. `@workspace/api-client-react`,
resolved via the `tsconfig.json` project reference) are **out of scope** for
work in this directory.

## Hard rules

- **Google Drive is out of scope.** `src/views/PromptManager.tsx` still
  references a Drive publish target (`publishResult.drive`), but that view
  (along with `PromptLibrary.tsx`) is **not mounted** by `src/App.tsx` — it
  was intentionally removed from the nav (commit `d94178a`). Do not wire it
  back up, do not add new Drive integration, and do not "fix" the dead Drive
  code as if it's live.
- **Never expose secrets.** The admin token (`src/lib/adminToken.ts`, key
  `mark_admin_token`) lives in `localStorage` and is wired into
  `@workspace/api-client-react` via `setAuthTokenGetter` in `src/main.tsx` —
  never log it, print it, or hardcode a token value. There is no `.env` in
  this artifact; any secrets (e.g. a GitHub webhook secret) belong to the API
  layer, not this static/SPA artifact.
- **Preserve the self-contained static HTML tool / iframe architecture.**
  Every file in `public/tools/*.html` (and `public/tools/technocycle/*.html`)
  is a standalone document with its own inline `<style>`/`<script>` — no
  shared build step, no imports from `src/`. `src/App.tsx` loads them by
  filename into an `<iframe>` (see the `TOOLS` array and `resolveFile`). Do
  not attempt to convert a tool into a React component or give tools direct
  access to the React app's state/modules — that breaks the whole point of
  the architecture (each tool is independently copy/pasteable and safe to
  hand-edit without touching the shell).
- **Do not touch Mission Control / the API / `mc-core` / `main`.** Those live
  outside this directory (`../mission-control`, shared `lib/` packages, the
  monorepo's `main` git branch/shared config). If a task seems to require
  changes there, stop and flag it rather than editing across the boundary —
  work in this session is scoped to `artifacts/page-terminal/` only.

## Stack

- React 18 + TypeScript, Vite (`vite.config.ts` requires `PORT` and
  `BASE_PATH` env vars — it throws if either is missing; Replit supplies
  them per `.replit-artifact/artifact.toml`, PORT `19951`, `BASE_PATH=/`).
- Tailwind v4 via `@tailwindcss/vite`; `src/components/ui/*` is a shadcn/
  Radix component library — available but largely unused by the current
  shell (`App.tsx` + `terminal.css` is what actually renders).
- `@tanstack/react-query` + `@workspace/api-client-react` (workspace package,
  resolved from `../../lib/api-client-react`) for any API calls made by the
  (currently unmounted) Prompt Manager/Library views.
- Replit dev-only Vite plugins: cartographer, dev-banner, runtime-error-modal.

## File map

- `index.html` / `src/main.tsx` — Vite entry, mounts `App` and wires the
  admin-token auth getter.
- `src/App.tsx` — the shell: brand switcher (`sts`/`tc`, persisted to
  `localStorage` under `pageTerminalBrand`), tool picker, and the `<iframe>`
  that resolves `public/tools/{file}` or, for TC brand, `technocycle/{file}`
  when a `tcFile` override exists on that `Tool` entry.
- `src/lib/adminToken.ts` — localStorage-backed admin token.
- `src/lib/brands.ts` — a *different*, broader brand enum (`sts`/`dcd`/
  `technocycle`) used by the API client layer; don't confuse with `App.tsx`'s
  UI-only `Brand = "sts" | "tc"` toggle.
- `src/views/PromptManager.tsx`, `src/views/PromptLibrary.tsx` — dead code,
  not imported anywhere currently; prompt CRUD + publish UI (DB + the
  out-of-scope Drive target). Leave unmounted unless explicitly asked to
  restore this feature, and if restored, drop the Drive coupling first.
- `public/tools/*.html` — the real product: self-contained tools (Page
  Rebuild, Hub+Spoke, Blog Terminal, grading tools, admin console, etc.).
- `public/tools/technocycle/*.html` — TechnoCycle-branded copies of a subset
  of tools. **See `TECHNOCYCLE_HANDOFF.md`** — this conversion effort is
  paused mid-flight (2 of 5 copies still on an inherited Joomla workflow) and
  documents its own hard rules (never invent a TC fact — use the literal
  `TECHNOCYCLE_TBD:` placeholder; never edit original STS tool HTML).
- `public/prompts/technocycle/*.txt` — TC prompt text assets referenced by
  the technocycle tool copies.
- `.replit-artifact/artifact.toml` — Replit deployment config (dev/build
  commands, port, env).

## Prompt / content source-of-truth lessons (from git history)

- Prompt content's source of truth is a **read-only** git sync
  (`xkluziv12/master-prompts` → DB), consumed one-way; this artifact/the API
  layer never writes back to that repo. A separate write/backup target
  (`page-terminal-prompts`) existed but outbound GitHub publishing was later
  removed entirely (commit `74c51b7`) — publishing now only targets DB (and,
  per stale UI text, Drive — see the Google Drive hard rule above).
  `prompts.gitPath` was renamed to `prompts.gitSourcePath` across the API/DB/
  UI (commit `e32a2b3`) — if you touch prompt schema again, grep for
  lingering `gitPath` at any boundary.
- Established git boundary (documented in `TECHNOCYCLE_HANDOFF.md`, carries
  forward to all work here): never touch `xkluziv12/master-prompts` or
  `xkluziv12/framework`; never use the `solve-my-ai-bot` identity or
  `SOLVE_MY_AI_BOT_TOKEN`.

## Verification (safe, artifact-scoped, no external services)

Run from this directory (`artifacts/page-terminal/`):

```
pnpm --filter @workspace/page-terminal run typecheck   # tsc --noEmit, no server, no env vars needed
```

`build` / `dev` / `serve` are also local-only (no external calls at build
time) but require `PORT` and `BASE_PATH` env vars or they throw immediately
— Replit sets these automatically; if running manually, match
`.replit-artifact/artifact.toml` (`PORT=19951`, `BASE_PATH=/`):

```
PORT=19951 BASE_PATH=/ pnpm --filter @workspace/page-terminal run build
PORT=19951 BASE_PATH=/ pnpm --filter @workspace/page-terminal run dev
```

There is no test suite in this artifact — typecheck is the primary
mechanical check. For changes to `public/tools/*.html`, verify by opening the
file directly (or via the running dev server's iframe) since there's no
build step for those files.
