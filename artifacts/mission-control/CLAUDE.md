# Mission Control — CLAUDE.md

Scope: this file governs work inside `artifacts/mission-control/` only.

## What this artifact is

An internal, admin-only dashboard for the "MC" build/review/publishing pipeline. It is a
pure frontend (Vite + React SPA) — all data and mutations go through the generated
`@workspace/api-client-react` hooks, which call the backend in `artifacts/api-server`
(which in turn uses shared business logic in `lib/mc-core`, e.g. SEO/page-research).
This artifact contains no server code and no business logic of its own.

Routes (`src/App.tsx`):
- `/` — Dashboard (run summary, create run)
- `/runs/:id` — Run detail (build phases, chat history, QC results)
- `/registry` — Registry links
- `/master-grid` — Work log grid
- 404 fallback

## Hard rules

- **Google Drive integration is out of scope.** Do not add Drive auth, Drive API calls,
  or Drive-related UI to this artifact.
- **Never expose secrets.** This is a client bundle shipped to the browser — nothing
  server-side-only (API keys, admin secrets, tokens) may be embedded in source, env
  vars prefixed for Vite, or committed here. The admin token entered by the user is
  verified against the backend and held only in `sessionStorage`; it must never be
  hardcoded, logged, or sent anywhere except the `Authorization` header of API calls.
- **Preserve the admin auth gate and its fail-closed default.** `AdminAccessGate`
  (`src/components/admin-access-gate.tsx`) wraps the entire `App` in `src/App.tsx`.
  Default state is locked; unlock only happens after the backend accepts the token
  (`GET /api/mc/summary` with `Authorization: Bearer <token>`). Do not weaken this to
  trust client-only state, add bypasses, or gate only individual pages instead of the
  whole app. Remember this gate is UX convenience, not the real security boundary — the
  backend in `artifacts/api-server` must independently enforce authorization on every
  route; never assume the frontend gate alone makes an endpoint safe.
- **Fail loud, not silent.** Follow the existing pattern: invalid/rejected tokens show
  an explicit error (never a silent no-op or silent fallback to "unlocked"); network
  errors in `vite.config.ts` (missing `PORT`/`BASE_PATH`) throw rather than defaulting.
  Keep that style — don't introduce silent fallbacks or swallowed errors in new code.
- **STS Joomla template checklist:** display `TOP LOGO 2026 (TESTING TIME)` in red
  when a publishing checklist asks operators to set the Joomla menu-item template.
  The Mission Control publisher does not set that template; do not imply that a
  successful publish phase changed the menu item's Template Style.
- **Do not modify unrelated artifacts or `main` from here.** Changes for
  `artifacts/api-server`, `lib/mc-core`, `lib/api-client-react`, or other artifacts
  belong in their own directories/PRs. If a task in this artifact seems to require a
  backend or shared-lib change, call that out explicitly rather than reaching outside
  this directory.

## Stack

- Vite + React 18 + TypeScript, `wouter` for routing, TanStack Query for data fetching.
- Tailwind CSS + shadcn/radix-based UI primitives in `src/components/ui/*`.
- Part of a pnpm workspace monorepo (`@workspace/mission-control`); imports typed API
  hooks from `@workspace/api-client-react` (generated from `lib/api-spec/openapi.yaml`).
- `tsconfig.json` extends `../../tsconfig.base.json` and references
  `../../lib/api-client-react`.

## File map

- `src/App.tsx` — route table + top-level `AdminAccessGate` wrapper.
- `src/components/admin-access-gate.tsx` — session-token auth gate; owns
  `setAuthTokenGetter`, `clearAdminSession`, and the unlock/lock listener set.
- `src/components/layout.tsx` — sidebar/nav shell, includes the "Lock" control.
- `src/components/github-sync-status.tsx` — GitHub backup mirror status widget +
  manual "Sync now" trigger (calls an authorized backend endpoint).
- `src/pages/dashboard.tsx`, `run-detail.tsx`, `registry.tsx`, `master-grid.tsx`,
  `not-found.tsx` — route components.
- `src/components/ui/*` — shadcn-style primitives; treat as generated/vendored, prefer
  composing over hand-editing unless fixing a real bug.
- `src/hooks/*`, `src/lib/utils.ts` — small local hooks/utilities.
- `index.html`, `public/robots.txt` — intentionally `noindex, nofollow` / `Disallow: /`
  since this is an internal admin tool, not a public site. Don't revert to indexable.
- `.replit-artifact/artifact.toml` — deployment/service config (port, base path,
  build/serve commands); `PORT` and `BASE_PATH` env vars are required, not optional.

## Known lessons

- The client-side unlock state (`isUnlocked` in `AdminAccessGate`) is convenience UX
  only. Real authorization must live server-side in `artifacts/api-server` — recent
  history hardened exactly this class of gap (GitHub mirror/webhook triggers requiring
  server-side authorization, admin route regression tests). Don't reintroduce
  client-only trust for any new privileged action surfaced in this UI.
- URL-fetching / page-research logic (with SSRF hardening, time/size bounds) lives in
  `lib/mc-core`, not here. If this artifact ever needs to fetch or preview arbitrary
  URLs, reuse the hardened mc-core path instead of writing new fetch logic in the
  frontend or a new backend route.
- This artifact has no test suite of its own; auth/authorization coverage for the
  routes this UI calls lives in `artifacts/api-server` (e.g. `test/mc-auth.test.mjs`)
  and `scripts/tests/api-route-security.test.ts`. When changing auth-adjacent behavior
  here, check whether those need updating too (in their own directories).

## Verification

Run from this directory (`artifacts/mission-control/`):

- Typecheck (expected to pass with no output on success, exit code 0):
  `npm run typecheck`  (equivalent to `tsc -p tsconfig.json --noEmit`)
- Build: `npm run build`
- Dev server (requires `PORT` and `BASE_PATH` env vars, e.g. as set by
  `.replit-artifact/artifact.toml`): `npm run dev`
- Preview a production build: `npm run serve`

There is no lint/test script in this artifact's `package.json`; don't invent one without
checking the monorepo root for a shared convention first.
