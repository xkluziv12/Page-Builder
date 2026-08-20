# Bake-Off Harness — Complete Technical Dossier

_Generated 2026-06-26T20:01:43.831Z by `scripts/src/bakeoff/dossier.ts`._

This document is an exhaustive snapshot of the **multi-LLM "bake-off" harness** built
for STS Electronic Recycling. The harness is an out-of-tree, faithful port of the
manual "No-GMB" page-building workflow a virtual assistant runs by hand in a
Claude.ai chat, re-implemented so the *identical* checklist, prompts, and uploaded
design files are driven across multiple frontier models (Claude, Gemini, OpenAI,
Grok) and scored apples-to-apples against the real published page.

It contains, in order:

1. Architecture & methodology overview
2. Run / model / routing configuration
3. The prompts — mini (per-turn) prompts + the uploaded master fixtures
4. The complete harness source (every `.ts` file)
5. The golden reference page (HTML + schema) + a representative generated page
6. The latest run's results & log summary (scores, costs, per-phase verdicts)

You are being asked to **review this system**: judge the architecture, the fairness
of the comparison, the prompt engineering, the scoring rubric, correctness/risks,
and what could be done better.

## 1. Architecture & methodology overview

**Goal.** Reproduce, with byte-for-byte fidelity, the human "No-GMB" page-build
workflow (a VA pasting a fixed sequence of prompts into a single stateful Claude.ai
chat, with design/spec files uploaded once) and run it across several models so
their output pages can be compared on equal footing.

**Faithfulness principles (the whole point of the harness):**

- **One stateful conversation per model.** Each model runs the entire checklist in a
  single growing message history (intro → build → design gate / force-rebuild loop →
  SEO audit → SEO verification → schema → link verification), exactly like a chat's
  scrollback. The full history is re-sent every turn.
- **Byte-identical prompts & files for every model.** The per-turn prompts are a
  verbatim port of the tool's `copyPrompt()` output; the uploaded design/spec files
  are inlined as the API-faithful stand-in for file uploads. The ONLY model-specific
  surface is the provider completion adapter (`providers.ts`).
- **One shared grounding.** A single local-market research brief is authored once and
  handed identically to every model, so the build comparison is not contaminated by
  per-model research differences.
- **No special-casing.** If a model refuses to build (e.g. demanding a page_url / GMB
  block first), that is recorded faithfully as an ERROR — never patched away — because
  special-casing one model would break the comparison.
- **Fail loud.** Missing inputs, malformed schema, empty responses, and exhausted
  retries surface as labelled errors rather than silent placeholders.

**Two scenarios** share one grounding and differ ONLY by the intro context handed to
the models: `no-gmb` (the exact production context — city/state targeting, no
page_url, no Google Business Profile block) and `gmb` (every model gets an identical
enriched intro: explicit page_url + a GMB data block). Keeping them as sibling
scenarios — rather than patching only the refusing model's prompt — preserves
apples-to-apples.

**Two additive production modes** (separate from the comparison) drive a real
"produced page": SINGLE engine (one named model runs every phase) and ROUTED (a main
model per phase + an automatic backup that takes over on error/refusal/invalid
output). See `routing.ts`.

**Scoring.** Each generated page is scored on a weighted composite of: checker audit
(errors/warnings), structural completeness, JSON-LD schema validity, link audit,
word-count floor, speed, HTML closeness to the real page, and visual closeness
(rendered-screenshot perceptual pixel-diff + a vision-LLM rating, with a design-token
proxy fallback). See `score.ts` / `visual.ts`.

**Web search.** On the SEO-verify turn (whose prompt says "search the web for current
2025-2026 SEO best practices") each adapter attaches the provider's NATIVE web-search
tool for that one call only — off everywhere else — so the turn order stays identical.

## 2. Run configuration & operator commands

### Package scripts (how the harness is invoked)

`scripts/package.json` — 1,423 chars

```json
{
  "name": "@workspace/scripts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "hello": "tsx ./src/hello.ts",
    "mc": "tsx ./src/mc.ts",
    "system-map": "tsx ./src/system-map.ts",
    "bakeoff": "tsx ./src/bakeoff/run.ts",
    "bakeoff:single": "BAKEOFF_PRODUCE_MODE=single tsx ./src/bakeoff/produce.ts",
    "bakeoff:multi": "BAKEOFF_PRODUCE_MODE=routed tsx ./src/bakeoff/produce.ts",
    "bakeoff:seo-verify-demo": "tsx ./src/bakeoff/seo-verify-demo.ts",
    "bakeoff:schema-demo": "tsx ./src/bakeoff/schema-demo.ts",
    "bakeoff:rescore": "tsx ./src/bakeoff/rescore-visual.ts",
    "bakeoff:cost": "tsx ./src/bakeoff/backfill-cost.ts",
    "bakeoff:dossier": "tsx ./src/bakeoff/dossier.ts",
    "bakeoff:review": "tsx ./src/bakeoff/review.ts",
    "judge": "tsx ./src/judge/run.ts",
    "seed-prompts": "tsx ./src/seed-prompts.ts",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.78.0",
    "@google/genai": "^1.44.0",
    "@workspace/db": "workspace:*",
    "@workspace/mc-core": "workspace:*",
    "drizzle-orm": "catalog:",
    "openai": "^6.27.0",
    "pixelmatch": "^7.2.0",
    "playwright-core": "^1.61.0",
    "pngjs": "^7.0.0",
    "yaml": "^2.9.0"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@types/pngjs": "^6.0.5",
    "tsx": "catalog:",
    "vitest": "^4.1.9"
  }
}

```

### Project README / product context (replit.md)

`replit.md` — 8,292 chars

```md
# Page Terminal

Page Terminal is the "M.A.R.K." (Machine Assisted Routing Kit) toolset — a navy/gold navigation shell that hosts a set of standalone SEO/page-building tools (Page Rebuild, Hub + Spoke, Service Pages, Blogs, and dashboards) for STS Electronic Recycling virtual assistants.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/page-terminal/src/App.tsx` — the navigation shell (navy/gold nav bar) that switches the active tool in an iframe. Nav items and their target files are defined in the `TOOLS` array.
- `artifacts/page-terminal/src/terminal.css` — styling for the nav shell.
- `artifacts/page-terminal/public/tools/*.html` — the standalone tool pages (one self-contained HTML file each), served as static assets and loaded into the shell via iframe.
- `artifacts/page-terminal/public/tools/_placeholder.css` + `new-pages.html` / `marketing.html` / `ai-pages.html` — themed "not configured yet" placeholders for the modules that were empty in the source.

## Architecture decisions

- The original system was a GitHub Pages site (`xkluziv12/Page-Builder`) where a thin wrapper iframed standalone HTML tools. This rebuild preserves that architecture: a React nav shell + static HTML tools loaded by iframe — not a React rewrite of each tool.
- The tool pages are fully self-contained (inline CSS/JS). They are NOT cross-linked; navigation lives only in the shell.
- Several dashboard tools (`DCD-grading`, `SALES-grading`, `WIW-data`, `blog-terminal`) fetch from external n8n webhooks at `stsrecycling.app.n8n.cloud`. Those remain external dependencies and are not hosted here.

## Product

This monorepo also hosts **Mission Control** (`artifacts/mission-control`), a standalone page-builder app (Dashboard mode) for STS VAs. A VA enters a city + Go and the server runs a phase pipeline — Research → Build → Audit → Schema → Publish — with per-phase review/approve gates, DB-backed run state, a live preview frame, AI chat-edit, a loud checker suite, parallel runs, an STS blog track, and an atomic Joomla publishing seam.

- Engine logic lives in the reusable lib `@workspace/mc-core` behind a clean `AIEngine` seam. A run picks ONE engine: the three model-backed Dashboard engines — `ClaudeEngine` (claude-sonnet-4-6), `OpenAIEngine` (gpt-5.4, Responses API + background poll), `GeminiEngine` (gemini-3.1-pro-preview) — all extend a shared `PromptCompletionEngine` base so they drive the pipeline with byte-identical prompts and differ only in the provider call; plus `ReplitEngine` (Replit mode, an operator-driven engine that returns Agent-supplied content). The pipeline orchestrator never imports a concrete LLM client directly, and every engine flows through the same `runPhase` + checker suite. The factory `engineFor()` in `mc-runtime.ts` constructs each: Claude via the Anthropic integration, OpenAI/Gemini via STS's own `OPENAI_API_KEY` / `GEMINI_API_KEY` (lazy + fail-loud). Fan-out to multiple engines per run is deferred.
- Backed by namespaced routes (`/api/mc/*`) in the shared api-server and dedicated `mc_*` tables. Page Terminal is untouched.
- The Research phase runs behind a `ResearchProvider` seam. By default it uses the in-app `DirectResearchProvider` (Perplexity web-grounded research + citations via `PERPLEXITY_API_KEY`, SerpAPI entities via `SERPAPI_API_KEY`, and Claude synthesis via the existing Anthropic integration). Set `MC_RESEARCH_PROVIDER=n8n` to fall back to the external `mark-ai-brain` webhook. Missing keys / failed provider calls fail loudly and downstream phases stay locked.
- On run creation the server derives city/state/niche/classification/competition/seoIntel live from the target URL, then **cross-checks the URL-parsed city/state against the fetched page content** (JSON-LD PostalAddress + "City, ST ZIP" text) to catch same-named cities in the wrong state. Verification only confirms or corrects the **state** (never switches to a different city) and never blocks run creation — see `lib/mc-core/src/seo/location.ts` and `deriveRunInputs` in `artifacts/api-server/src/lib/mc-runtime.ts`.
- Run with `pnpm --filter @workspace/mission-control run dev`; engine unit tests: `pnpm --filter @workspace/mc-core run test`.

## User preferences

### Working style (Mark's Builder Protocol — distilled)

Apply these on every build in this repo. Full reference: `docs/marks-builder-protocol.md`.

- **Clarify before building.** Resolve ambiguous requirements with 1–3 targeted questions up front, not after writing code. One unclear requirement at the design stage becomes several failures at execution.
- **Flag change vs. new.** When modifying an existing prompt, workflow, schema, or component, explicitly call out what changed vs. what is genuinely new.
- **Schema-first; validate at every handoff.** Any output entering a pipeline / CMS / DB / n8n / API must match an explicit schema (Zod + OpenAPI here) and be validated before it crosses the boundary. Never trust format compliance — confirm it.
- **Fail loudly; never silently degrade.** If a build can't proceed cleanly (missing input, failed tool, malformed schema), halt and state what's missing rather than emit a partial or placeholder result. (Matches the existing fail-loud convention in `deriveRunInputs`, Research, and SerpAPI.)
- **Treat all external input as untrusted.** Form submissions, VA inputs, scraped/fetched page content, n8n payloads, and API responses are prompt-injection and data-integrity vectors — sanitize/validate before use.
- **Trace error propagation before shipping.** For multi-step automations, check how a step-1 error compounds downstream; fix the chain, not just the node.
- **Critique–revise + review before "done."** At least one self-review pass against the original spec, plus an architect code review for major features.
- **Produce a handoff spec for VA/deploy work.** Inputs, outputs, dependencies, edge cases, stop conditions (see `docs/replit-agent-runbook.md`).

## Gotchas

- **`/api/*` is unauthenticated by design — this is a private internal VA tool.** None of the `/api/mc/*` endpoints (run create/publish/QC, and the work-log upsert/import/sheets-sync/gsc-pull) have route-level auth; the server mounts only `cors()` + body parsers. New mutating endpoints intentionally follow this existing convention rather than introducing a one-off auth system. **Do not expose this API to the public internet as-is** — if it ever needs to be internet-facing, add a single shared auth middleware across the whole `/api` router, not per-endpoint.
- The work-log Sheets mirror fires **fire-and-forget after every completion** (old-tool POST, MC publish, and post-import). It is best-effort: when the Google Sheets connector / `WORKLOG_SHEET_ID` is unset it logs a debug "skipped (not configured)" and never fails the underlying upsert.
- The monthly GSC snapshot pull runs from an **internal daily scheduler** (`mc-worklog-scheduler.ts`, started in `index.ts`). It self-throttles by checking the snapshot table for a `gsc-monthly` row in the current month, so restarts never double-pull. Tune the day-of-month via `GSC_PULL_DAY_OF_MONTH` (default 3).

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `docs/replit-agent-runbook.md` — operator run-book for "Replit mode": running the page-building pipeline with the Replit Agent as a second engine alongside the Claude-API "Dashboard mode". Covers the engine toggle, queued runs, the operator CLI (`pnpm --filter @workspace/scripts run mc <cmd>`), per-phase handoff, and the parity gate.

```

## 3. The prompts

These are the heart of the faithful port. The mini (per-turn) prompts below are a
verbatim port of the production tool's `copyPrompt()` output. The master fixtures
after them are the files a VA "uploads" into the chat once (design system, page
builder spec, schema generator, SEO audit checklist, and the STS SEO data sheet).

### Per-turn mini prompts

`scripts/src/bakeoff/miniPrompts.ts` — 25,089 chars

````ts
/**
 * VERBATIM port of the per-phase prompts the VA copies out of the No-GMB
 * checklist tool (`artifacts/page-terminal/public/tools/no-gmb.html`,
 * `copyPrompt()` — cases intro, build, rebuild, verify-links, seo, seo-verify,
 * schema, meta). These strings are the harness's source of truth; do NOT
 * paraphrase them. The only fields filled in are the same ones the tool fills:
 * city, state, url, niche, pageName, the Hub+Spoke handoff, and the rebuild
 * issue. Every other character matches the tool output byte-for-byte.
 *
 * In the real workflow these are pasted into a Claude.ai chat where the Master
 * Page Builder / Master Design / SEO Audit files are UPLOADED. The harness has
 * no file-attachment surface, so the conversation driver inlines the real
 * uploaded files (committed fixtures) into the chat turns; the prompt text below
 * is unchanged.
 */

export interface PromptVars {
  city: string;
  state: string;
  url: string;
  niche: string;
  pageName: string;
  /** The Hub+Spoke internal-linking handoff text (empty string when none). */
  hubSpoke: string;
}

/** The "forced execution" prefix the tool stamps on most mini prompts. */
export const FORCE_PREFIX =
  "CRITICAL SYSTEM INSTRUCTION: Execute ALL steps exhaustively. Do NOT summarize. Do NOT skip any section. Do NOT take shortcuts. Complete every single requirement. Stop and alert if errors occur.\n\n";

/**
 * The STS HQ main line — the SINGLE source of truth for the No-GMB backup phone.
 *
 * Bake-off ONLY. In a No-GMB build there is no verified local phone, so instead
 * of telling models to ship a page with NO phone at all (a negative,
 * input-starved framing that pushed at least one model to treat the absent
 * phone/address as "required inputs missing" and refuse to build), the harness
 * falls back to this HQ main line for call buttons, on-page contact, and the
 * schema `telephone`. It is a hardcoded backup that applies ONLY in the No-GMB
 * case; the GMB scenario keeps its own GMB phone. Production (`lib/mc-core`, the
 * shipped `no-gmb.html` tool) is untouched.
 */
export const HQ_PHONE = "844-699-2913";
/** The same number as a working `tel:` href for call buttons. */
export const HQ_PHONE_TEL = "tel:+18446992913";

/**
 * The ONE medium-translation the harness applies, IDENTICALLY for every model,
 * to the turns that must yield a page. The verbatim prompts tell the model to
 * "create an artifact" and "never paste code in chat" — but this is an API
 * session with no artifact/canvas surface, so the faithful translation of that
 * instruction is "emit the complete HTML inline in a fenced block." Without it a
 * model that obeys the artifact rule literally says "the artifact is being
 * created" and emits no HTML. This is a uniform medium shim, NOT per-model
 * special-casing, so the comparison stays apples-to-apples.
 */
export const ARTIFACT_TO_INLINE =
  "\n\n[API EXECUTION NOTE — applies to every model identically: this is an API " +
  "session with NO artifact / canvas / preview surface. Wherever the instructions " +
  'above say "create an artifact" or "never paste code in chat", instead output the ' +
  "COMPLETE, FINAL HTML document INLINE in a single ```html fenced code block " +
  "(full <!DOCTYPE html> … </html>), with no commentary before or after it. Do NOT " +
  "say an artifact is being created and do NOT refer to a previous build — actually " +
  "emit the entire HTML document here, in this message.]";

/**
 * The verify-turn counterpart of `ARTIFACT_TO_INLINE`. The seo-verify and
 * verify-links turns are REPORT-primary (HTML is optional, emitted only if the
 * model changed the page) and MUST end with an explicit ✅/❌ verdict the harness
 * gates on. The plain `ARTIFACT_TO_INLINE` shim forbids any commentary, which
 * would suppress that verdict — so these turns use this variant instead: it
 * still translates "artifact" → inline HTML, but explicitly preserves the report
 * AND the required verdict line. Uniform across all models (no special-casing).
 */
export const ARTIFACT_TO_INLINE_OPTIONAL =
  "\n\n[API EXECUTION NOTE — applies to every model identically: this is an API " +
  "session with NO artifact / canvas / preview surface. Wherever the instructions " +
  'above say to "create" or "update" an artifact, instead include any updated HTML ' +
  "INLINE in a single ```html fenced code block (the full <!DOCTYPE html> … </html> " +
  "document). Still produce your full report and END your reply with the explicit " +
  "✅/❌ VERDICT line the instructions specify — do NOT omit the verdict.]";

/**
 * The schema-turn counterpart of `ARTIFACT_TO_INLINE`. The Master Schema
 * Generator (uploaded as the `Schema Generator` file) is an interactive,
 * chat-UI document: it tells the operator to "output schema.txt file + meta data
 * in chat boxes" and contains HARD STOPs that pause to ask a human to verify a
 * Google CID before continuing. Headless, there is no file surface and no human
 * to answer — so, IDENTICALLY for every model, we translate those medium-bound
 * directives into: emit ONLY the JSON-LD wrapped in a single
 * `<script type="application/ld+json">…</script>` block, never pause to ask, and
 * use the values present in this conversation (or omit them) rather than halting.
 * A uniform medium shim, NOT per-model special-casing.
 */
export const SCHEMA_TO_INLINE =
  "\n\n[API EXECUTION NOTE — applies to every model identically: this is an API " +
  "session with NO file / chat-box / canvas surface and NO human available to " +
  "answer mid-run. The uploaded Schema Generator describes a chat-UI workflow " +
  '(it says to output a "schema.txt file" and "meta data in chat boxes", and it ' +
  "contains HARD STOPs that ask a person to verify a Google CID). Do NOT pause, " +
  "do NOT ask any question, and do NOT stop to request verification — proceed " +
  "non-interactively using ONLY the data already in this conversation (research " +
  "brief, the current HTML, and the build context above); if a value such as a " +
  "CID, street address, phone, or coordinates is not present here, OMIT it rather " +
  "than inventing it or halting. Your ENTIRE reply must be exactly ONE " +
  '<script type="application/ld+json"> … </script> block — it MUST start with ' +
  "`<script` and end with `</script>`, contain valid JSON-LD, and include NO " +
  "prose, no meta-data boxes, no markdown fences, and no commentary before or " +
  "after it.]";

/** intro — name the chat, upload files, session rules, model check. */
export function introPrompt(v: PromptVars): string {
  const chatName = `${v.city} ${v.niche}`;
  return `FIRST: Name this chat "${chatName}"

Click the chat title at the top and rename it to: "${chatName}"

═══════════════════════════════════
📁 REQUIRED FILES — UPLOAD THESE NOW
═══════════════════════════════════
Before proceeding, upload these files from the Claude Project:
1. 📄 STS SEO Data 2026
2. 📄 Master Page Builder
3. 📄 Master Design (Tier 2)

OPTIONAL (for service-specific pages):
4. 📄 New Design (Tier 1) — for tier 1 pages
5. 📄 Service Design (Tier 3/4) — for tier 3/4 pages

⚠️ DO NOT PROCEED until required files are uploaded.

═══════════════════════════════════
SYSTEM INSTRUCTIONS
═══════════════════════════════════

You are building a landing page for STS Electronic Recycling. This is a NO GMB build — this city has no Google Business listing. Do NOT invent or include a street address, local phone, business hours, or CID. The page IS a full landing page (schema included), just without a GMB street address and without a CID. Schema is generated separately in Phase 4 (no CID, no street address).

RULES FOR THIS ENTIRE SESSION:
1. Follow ALL instructions exactly — no shortcuts, no summarizing, no skipping steps
2. Execute EVERY prompt completely before asking questions
3. Keep responses TIGHT — essentials only, no fluff or excessive explanations
4. When given documents/files, read them thoroughly before proceeding
5. Do NOT hallucinate — if unsure, ask
6. Maintain consistency across all prompts in this session
7. ALL HTML/CODE OUTPUT → CREATE AS ARTIFACT (visual preview), NEVER paste code in chat

TARGET: ${v.city}${v.state ? ", " + v.state : ""}
NICHE: ${v.niche}
URL: ${v.url}

Confirm you've named the chat "${chatName}", uploaded the files, and understand these rules.

⚠️ IMPORTANT MODEL CHECK:
Before responding, state which Claude model you are (e.g. "I am Claude Sonnet 4.6").
If you are Claude OPUS — STOP IMMEDIATELY. Do NOT proceed. Reply ONLY with:
"🚫 WRONG MODEL — I am Opus. Switch to Sonnet 4.6 before continuing."

If you are Sonnet 4.6, reply: "Chat named. Files received. Sonnet 4.6 confirmed. Ready."

No lengthy explanations.`;
}

/** build — the main page build, with the Hub+Spoke linking section. */
export function buildPrompt(v: PromptVars): string {
  const hubSpokeSection = v.hubSpoke
    ? `
═══════════════════════════════════
INTERNAL LINKING STRATEGY (Hub+Spoke)
═══════════════════════════════════
${v.hubSpoke}

LINKING INSTRUCTIONS:
- Add 3-4 internal links per page in content sections (rows 4+, NOT hero)
- Use full HTTPS URLs from the handoff above
- Reference local context (institutions, employers) in anchor text
- Links open in same tab (no target="_blank")
═══════════════════════════════════
`
    : "";

  return `${FORCE_PREFIX}TASK: Build Landing Page for ${v.city}${v.state ? ", " + v.state : ""} — ${v.niche}

═══════════════════════════════════
TARGET URL: ${v.url}
NICHE: ${v.niche}
═══════════════════════════════════

⚠️ NO GMB BUILD:
This city has no Google Business listing — but PROCEED NORMALLY and build the full landing page. For the call buttons and on-page contact, use the STS HQ main line ${HQ_PHONE} as the backup phone, wired as a working tel: link (${HQ_PHONE_TEL}). Do NOT invent a LOCAL phone number, street address, business hours, CID, or Google Maps embed/CID link for this city. Schema is generated separately in Phase 4 (telephone = the HQ backup line; no CID, no street address) — this is otherwise a standard landing page.
${hubSpokeSection}
EXECUTION INSTRUCTIONS:
1. Use Master Page Builder logic - follow EVERY step
2. Apply Master Design (Tier 2) strictly - NO deviations
3. Hero section MUST have city "${v.city}" + niche "${v.niche}" in H1, form on RIGHT
4. Mobile responsive - images must NOT squeeze text
5. Do NOT include Schema yet (built separately in Phase 4 — no CID, no GMB address)
6. Footer/contact: use the STS HQ main line ${HQ_PHONE} (tel: link) for call buttons — do NOT add a local street address or invent a local-branch phone for this city
7. Facility mentions: Say "serving ${v.city} from our 600,000 sq ft facility" — NOT "our ${v.city} facility"
${v.hubSpoke ? "8. Include 3-4 internal links from Hub+Spoke handoff in rows 4+ (NOT hero)" : ""}

⚠️ CRITICAL OUTPUT REQUIREMENT:
CREATE AN ARTIFACT with the complete HTML code. Do NOT paste code in chat.
The artifact must be viewable/previewable. Name it: "${v.city}-${v.niche.replace(/\s+/g, "-").toLowerCase()}.html"

BEGIN BUILD NOW. No lengthy explanations.`;
}

/** rebuild — full from-scratch rebuild when the design gate fails. */
export function rebuildPrompt(v: PromptVars, issue: string): string {
  return `${FORCE_PREFIX}TASK: COMPLETE REBUILD REQUIRED

THE ISSUE: ${issue}

INSTRUCTIONS:
1. DELETE your previous output completely
2. Re-read the Master Design (Tier 2) file
3. Rebuild the ENTIRE page from scratch
4. Fix the specific issue mentioned above
5. Ensure Hero has city in H1, form on RIGHT
6. Ensure mobile view works - no image squeeze
7. NO GMB: build normally; use the STS HQ main line ${HQ_PHONE} (tel: link) for call buttons; do NOT invent a local street address, local-branch phone, hours, or CID

⚠️ CRITICAL OUTPUT REQUIREMENT:
CREATE A NEW ARTIFACT with the complete rebuilt HTML code. Do NOT paste code in chat.
The artifact must be viewable/previewable. Replace the previous artifact.

DO NOT try to patch the old code. START FRESH. No lengthy explanations.`;
}

/** verify-links — closing link-integrity check. */
export function verifyLinksPrompt(): string {
  return `${FORCE_PREFIX}TASK: VERIFY ALL LINKS

Scan the HTML and verify:

1. ALL email links = mailto:recycle@stsrecycle.com
2. ALL contact/quote buttons = https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE
3. NO made-up URLs (LLMs invent URLs!)
4. NO example.com or placeholder links
5. NO invented LOCAL phone numbers or street addresses (NO GMB build) — but the STS HQ main line ${HQ_PHONE} (tel: link) IS the allowed backup phone: KEEP it, do NOT treat it as invented.

VERDICT:
If ALL links correct: ✅ LINKS VERIFIED — Proceed to next phase
If ANY issues found: ❌ LINKS FAILED — List issues above, fix and re-verify

No lengthy explanations.`;
}

/**
 * verify-links FIX — the corrective re-verify turn the harness sends when the
 * model's link verification returns ❌ LINKS FAILED. Uniform for every model; it
 * just asks the model to fix the issues IT listed and re-emit the verdict, the
 * same "fix and re-verify" loop the tool's own verify prompt describes.
 */
export function verifyLinksFixPrompt(): string {
  return `${FORCE_PREFIX}TASK: FIX LINK VERIFICATION FAILURES

Your link verification returned ❌ LINKS FAILED.

1. Fix EVERY link issue you listed above:
   - ALL email links = mailto:recycle@stsrecycle.com
   - ALL contact/quote buttons = https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE
   - Remove any made-up / example.com / placeholder URLs
   - Remove any invented LOCAL phone numbers or street addresses (NO GMB build) — but KEEP the STS HQ main line ${HQ_PHONE} (the allowed backup phone)
2. Re-scan ALL links in the corrected page.
3. End your reply with the FINAL VERDICT, exactly one of:
   ✅ LINKS VERIFIED — Proceed to next phase
   ❌ LINKS FAILED — <list the issues that still remain>

No lengthy explanations.`;
}

/** seo — full SEO audit (uploads the Master SEO Audit file). */
export function seoPrompt(v: PromptVars): string {
  return `${FORCE_PREFIX}TASK: FULL SEO AUDIT

═══════════════════════════════════
📁 REQUIRED FILE — UPLOAD NOW
═══════════════════════════════════
Upload: 📄 Master SEO Audit
⚠️ DO NOT PROCEED until file is uploaded.
═══════════════════════════════════

CRITICAL RULES:
- Execute EVERY SINGLE STEP in the SEO Audit file
- Do NOT skip any optimization
- The first 2 rows (Hero section) = MINOR tweaks only, no major changes
- STRIP/REMOVE all existing Schema (rebuilt separately in Phase 4)
- Verify emails = mailto:recycle@stsrecycle.com
- NO GMB: keep the STS HQ main line ${HQ_PHONE} on the call buttons (tel: link); do NOT add or invent a local street address, local-branch phone, hours, or CID
${v.hubSpoke ? "- Verify 3-4 internal links exist in content sections (rows 4+, NOT hero)" : ""}

Complete the ENTIRE audit. Do not stop early. Do not summarize.

Output the optimized HTML (without schema). No lengthy explanations.`;
}

/** seo-verify — compliance + modern-SEO verification audit. */
export function seoVerifyPrompt(v: PromptVars): string {
  const hubSpokeVerifySection = v.hubSpoke
    ? `
INTERNAL LINKING (Hub+Spoke):
☐ 3-4 internal links present in content sections (rows 4+)
☐ NO internal links in hero section
☐ All URLs match the Hub+Spoke handoff exactly
☐ Links use full HTTPS format
☐ Links open in same tab (no target="_blank")
☐ Local context referenced in anchor text where appropriate

HUB+SPOKE REFERENCE:
${v.hubSpoke}

`
    : "";

  return `${FORCE_PREFIX}TASK: SEO VERIFICATION AUDIT

This page has already gone through our Master SEO Audit.
Now verify compliance and check against modern standards.

════════════════════════════════════════════════════════
PART 1: MASTER SEO AUDIT COMPLIANCE CHECK
════════════════════════════════════════════════════════

Verify these items were executed from our SEO Audit:

TECHNICAL:
☐ Meta title: Present, 50-60 chars, includes city + niche
☐ Meta description: Present, 150-160 chars, compelling CTA
☐ H1: ONE only, contains city name
☐ H2-H6: Logical hierarchy, no skipped levels
☐ Image alt tags: All images have descriptive alts
☐ Internal links: Functional, no placeholders

LOCAL SEO:
☐ City mentioned in first 100 words
☐ Email is mailto:recycle@stsrecycle.com

════════════════════════════════════════════════════════
🔴 NO GMB CHECK
════════════════════════════════════════════════════════
This is a NO GMB build. It SHOULD still have working call buttons that use the
STS HQ main line ${HQ_PHONE} as a tel: link — that HQ backup number is EXPECTED
and allowed, it is NOT invented local data. Confirm it is present and wired to the
call buttons. Then search the HTML for any invented LOCAL data.

EXPECTED (do NOT flag these):
✅ The STS HQ main line ${HQ_PHONE} on the call buttons / contact (tel: link)
✅ telephone "${HQ_PHONE}" in the schema

WRONG (fix these):
❌ A street address for this city (including streetAddress in schema)
❌ A LOCAL / local-branch phone number presented as this city's own line (any phone OTHER than the HQ backup ${HQ_PHONE})
❌ Business hours for a local branch
❌ A CID anywhere (identifier "cid:...", hasMap, or sameAs Google Maps CID link)
❌ A Google Maps embed or CID link

NOTE: Schema itself is FINE and expected — telephone "${HQ_PHONE}" is correct; only a CID, an invented street address, or a local-branch phone is wrong.

ACTION:
- If the HQ number ${HQ_PHONE} is MISSING from the call buttons → ADD it (tel: link) and output:
  🔴 ADDED: HQ backup phone wired to call buttons
- If any invented local data found → REMOVE IT and output:
  🔴 REMOVED: [show what was removed]

If clean and the HQ number is present → output:
✅ NO GMB: Clean (HQ backup phone present, no invented local data)

════════════════════════════════════════════════════════
🔴 FACILITY LANGUAGE CHECK
════════════════════════════════════════════════════════
Search for "600,000 sq ft" or facility size claims.

WRONG:
❌ "from our 600,000 sq ft facility" (implies local)
❌ "our ${v.city} facility"

CORRECT:
✅ "serving ${v.city} from our 600,000 sq ft facility"

If incorrect → FIX and output: 🔴 ADJUSTED: [before/after]
If clean → output: ✅ Facility language: Clean

════════════════════════════════════════════════════════

${hubSpokeVerifySection}CLEANUP:
☐ Schema REMOVED (rebuilt in Phase 4 — no CID, no GMB address)
☐ No broken/placeholder links
☐ No lorem ipsum or [PLACEHOLDER] text

FLAG 1 - AUDIT COMPLIANCE:
✓ ALL STEPS FOLLOWED — or —
⚠️ INCOMPLETE — List what's missing

════════════════════════════════════════════════════════
PART 2: MODERN SEO STANDARDS (Web Search Required)
════════════════════════════════════════════════════════

Search the web for CURRENT (2025-2026) SEO best practices.

SEARCH THESE SOURCES:
• Google Search Central — latest algorithm updates
• Reddit r/SEO, r/bigseo, r/localseo — current trends
• AI SEO optimization techniques (2025+)
• Local/Geo SEO innovations
• E-E-A-T signals (Experience, Expertise, Authority, Trust)
• Core Web Vitals considerations for landing pages

Score this page against what you find.

MODERN SEO SCORE: __/100

QUICK WINS (max 3):
• [Actionable improvement]
• [Actionable improvement]
• [Actionable improvement]

FLAG 2 - MODERN COMPLIANCE:
✓ UP TO DATE — Follows current best practices — or —
⚠️ NEEDS ATTENTION — [Brief reason]

════════════════════════════════════════════════════════
FINAL VERDICT
════════════════════════════════════════════════════════

If ALL checks passed and no issues remain:
✅ SEO VERIFICATION PASSED — Proceed to Phase 4: Schema

If ANY issues need fixing:
❌ SEO VERIFICATION FAILED — Issues listed above must be fixed before proceeding

Output the updated HTML artifact if any changes were made.

Keep report SHORT and SCANNABLE. No lengthy explanations.`;
}

/**
 * seo-verify FIX — the corrective re-verify turn the harness sends when the SEO
 * VERIFICATION AUDIT returns ❌ SEO VERIFICATION FAILED. Uniform for every model;
 * it asks the model to fix the issues IT listed, re-run the checklist, and re-emit
 * the final verdict — the "fix before proceeding" loop the verify prompt mandates.
 */
export function seoVerifyFixPrompt(): string {
  return `${FORCE_PREFIX}TASK: FIX SEO VERIFICATION FAILURES

Your SEO VERIFICATION AUDIT returned ❌ SEO VERIFICATION FAILED.

1. Apply EVERY fix for the issues you listed above — do not skip any.
2. Re-run the full verification checklist against the corrected page.
3. End your reply with the FINAL VERDICT, exactly one of:
   ✅ SEO VERIFICATION PASSED — Proceed to Phase 4: Schema
   ❌ SEO VERIFICATION FAILED — <list the issues that still remain>

No lengthy explanations.`;
}

/** schema (No-GMB) — the Phase-4 schema turn. The harness SENDS this as a real
 * AI turn with the Master Schema Generator file inlined (see SCHEMA_TO_INLINE),
 * exactly like the SEO-audit turn uploads its master file — NOT the old
 * deterministic "Auto-Generate Schema" shortcut. The No-GMB overrides below sit
 * on top of the uploaded generator: city/state targeting only, no CID, no street
 * address, no local phone. */
export function schemaPrompt(v: PromptVars): string {
  return `${FORCE_PREFIX}TASK: GENERATE SCHEMA (JSON-LD) — NO GMB

═══════════════════════════════════
📁 REQUIRED FILE — UPLOAD NOW
═══════════════════════════════════
Upload: 📄 Schema Generator
⚠️ DO NOT PROCEED until file is uploaded.
═══════════════════════════════════

City: ${v.city}
State: ${v.state || "[STATE]"}
Niche: ${v.niche}
Website: https://www.stselectronicrecyclinginc.com

⚠️ NO GMB MODE — CRITICAL DIFFERENCES:
This city has NO Google Business listing. Generate schema EXACTLY like a standard build EXCEPT:
- NO CID anywhere — do NOT add an "identifier" with "cid:...", NO "hasMap", and NO "sameAs" Google Maps CID link (https://www.google.com/maps?cid=...)
- NO GMB street address — do NOT include "streetAddress" or a postal code. Do NOT invent an address.
- Telephone: use the STS HQ main line "${HQ_PHONE}" as the backup "telephone". Do NOT invent a LOCAL phone number for this city.

REQUIREMENTS:
1. Type: LocalBusiness (or RecyclingCenter) / Organization
2. Use CITY + STATE targeting only — "address" may include addressLocality "${v.city}" and addressRegion "${v.state || "[STATE]"}" plus addressCountry "US", and/or "areaServed": "${v.city}, ${v.state || "[STATE]"}". NO streetAddress, NO postalCode.
3. Include "Electronic Recycling" in the name and description
4. Include the website URL
5. Include "telephone": "${HQ_PHONE}" (the HQ backup line)
6. Wrap in <script type="application/ld+json"> tags
7. Do NOT include aggregateRating/reviews
8. Do NOT include any CID, identifier, hasMap, or Google Maps link

Output the complete schema script block. No lengthy explanations.`;
}

/** The GMB inputs the GMB-scenario schema turn hands the model. Mirrors the
 * fields the GMB-enriched intro already supplies, so the schema turn can carry
 * the verified CID + full PostalAddress a HUB/GMB schema requires. */
export interface SchemaGmbInputs {
  cid: string;
  gmbUrl: string;
  businessName: string;
  street: string;
  zip: string;
  phone: string;
  lat: number;
  lng: number;
}

/** schema (GMB-enriched) — the Phase-4 schema turn for the GMB scenario. Same
 * uploaded Master Schema Generator file + SCHEMA_TO_INLINE shim as the No-GMB
 * variant, but it hands the model the verified CID + full address block so the
 * emitted JSON-LD carries the identifier/PostalAddress/geo/?cid= map URL that a
 * GMB page must have. Kept symmetric with `schemaPrompt` — the ONLY difference is
 * the GMB data the scenario already established, not per-model special-casing. */
export function gmbSchemaPrompt(v: PromptVars, g: SchemaGmbInputs): string {
  return `${FORCE_PREFIX}TASK: GENERATE SCHEMA (JSON-LD) — GMB

═══════════════════════════════════
📁 REQUIRED FILE — UPLOAD NOW
═══════════════════════════════════
Upload: 📄 Schema Generator
⚠️ DO NOT PROCEED until file is uploaded.
═══════════════════════════════════

City: ${v.city}
State: ${v.state || "[STATE]"}
Niche: ${v.niche}
Website: https://www.stselectronicrecyclinginc.com

✅ GMB MODE — verified Google Business Profile data for this page (use it exactly, do NOT invent anything beyond it):
- Business name: ${g.businessName}
- CID: ${g.cid}
- Google Maps URL (?cid=): ${g.gmbUrl}
- Street address: ${g.street}
- Postal code: ${g.zip}
- Phone: ${g.phone}
- Coordinates: ${g.lat}, ${g.lng}

REQUIREMENTS:
1. Type: LocalBusiness (or RecyclingCenter)
2. identifier: "${g.cid}" (CID format exactly — do NOT use gMapsUrl)
3. Full PostalAddress: streetAddress "${g.street}", addressLocality "${v.city}", addressRegion "${v.state || "[STATE]"}", postalCode "${g.zip}", addressCountry "US"
4. telephone "${g.phone}", geo GeoCoordinates ${g.lat}/${g.lng}
5. hasMap and sameAs using the ?cid= URL above
6. Include "Electronic Recycling" in the name and description, and the website URL
7. Do NOT include aggregateRating/reviews or individual reviews
8. Do NOT invent neighborhoods, ratings, or any value not given above

Output the complete schema script block. No lengthy explanations.`;
}

````

### Shared grounding author

`scripts/src/bakeoff/grounding.ts` — 2,200 chars

```ts
import type { CompleteFn } from "./providers.js";

export interface SharedGrounding {
  /** The shared local-market research prose every model receives identically. */
  content: string;
  /** Where this grounding came from (for the results transparency record). */
  source: string;
}

const GROUNDING_NOTE =
  "[MODEL-KNOWLEDGE GROUNDING — Perplexity/SerpAPI keys are not configured in this environment, " +
  "so this is NOT a live web search. It is one model-authored local-market brief, generated ONCE and " +
  "shared identically across every model so the page-build comparison is fair.]";

/**
 * Author the single shared research grounding for the target locality. Generated
 * ONCE (by the production synthesis model) and inlined identically into every
 * model's conversation, so the build/audit/schema work is the thing actually
 * being compared — not each model's research recall. This is the one place a
 * `system` instruction is used; the model build conversations carry none.
 */
export async function generateSharedGrounding(
  complete: CompleteFn,
  city: string,
  state: string,
  niche: string,
): Promise<SharedGrounding> {
  const system = [
    "You are a meticulous local-market research analyst for STS Electronic Recycling.",
    "Produce a detailed, well-organized local-market research summary in prose.",
    "Cover: major local employers and industries, the competitive landscape for the niche,",
    "relevant demographics and institutions, and any local e-waste/recycling regulations or programs.",
    "Be concrete with names where you can. Do not fabricate precise figures — if a number is an",
    "estimate from general knowledge, say so explicitly.",
  ].join("\n");
  const user = [
    `Locality: ${city}, ${state} (USA). Niche: ${niche}.`,
    "Write the local-market research summary now (prose, ~400-600 words).",
  ].join("\n");
  const res = await complete([{ role: "user", content: user }], system);
  if (!res.content.trim()) {
    throw new Error("Shared grounding author returned no content; cannot run the bake-off without grounding.");
  }
  return { content: `${GROUNDING_NOTE}\n\n${res.content.trim()}`, source: "model-knowledge (shared)" };
}

```

### Uploaded master fixtures

### Fixture — master-design-tier2.html

`scripts/src/bakeoff/fixtures/master-design-tier2.html` — 47,874 chars

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Atlanta Electronics Recycling | R2 Certified E-Waste | Free Pickup | STS</title>
<meta name="description" content="R2 certified electronics recycling Atlanta. Free pickup in Fulton County. HIPAA data destruction, ITAD services for healthcare, government. 600,000 sq ft facility. (470) 226-5361">
<link rel="canonical" href="https://www.stselectronicrecyclinginc.com/atlanta-electronics-recycling">
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"></noscript>
<link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"></noscript>
<style>
:root{--primary:#2c5aa0;--primary-dark:#1e4080;--accent:#10b981;--gray-950:#09090b;--gray-900:#111827;--gray-800:#1f2937;--gray-700:#374151;--gray-600:#4b5563;--gray-500:#6b7280;--gray-400:#9ca3af;--gray-300:#d1d5db;--gray-200:#e5e7eb;--gray-100:#f3f4f6;--gray-50:#f9fafb;--white:#ffffff;--cream:#fefdfb}
*{margin:0;padding:0;box-sizing:border-box}
.item-page,.blog-item,.article-content,.page-header,div.item-page>div,div.blog-item>div,.page-title,.page-header h1,.page-header h2,.article-intro,.item-intro,.componentheading,.contentheading,.item-title{margin-top:0!important;padding-top:0!important}
.page-header{display:none!important}
.breadcrumb{margin-bottom:5px!important}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:var(--gray-900);line-height:1.7;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;background:var(--cream);font-weight:400;letter-spacing:-.2px}
.container{max-width:1280px;margin:0 auto;padding:0 48px;position:relative;z-index:1}
.container-narrow{max-width:1080px;margin:0 auto;padding:0 48px}
.full-width{width:100vw;margin-left:50%;transform:translateX(-50%)}
.section{padding:120px 0;position:relative;overflow:hidden}
.grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:48px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:44px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:40px}
.text-c{text-align:center}
.bg-white{background:var(--white)}
.bg-cream{background:var(--cream)}
.bg-gray{background:#fafbfc}
.bg-pattern{position:absolute;inset:0;background-image:repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,.008) 3px,rgba(0,0,0,.008) 4px);pointer-events:none;opacity:.5}
.section-eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:var(--primary);margin-bottom:20px;display:inline-block}
.section-title{font-size:56px;font-weight:900;color:var(--gray-900);margin-bottom:24px;letter-spacing:-1.8px;line-height:1.08}
.section-subtitle{font-size:19px;color:var(--gray-600);max-width:780px;margin:0 auto;line-height:1.75;font-weight:400}
a.link-p{color:var(--primary);text-decoration:none;font-weight:600;transition:color .3s ease}
a.link-p:hover{color:var(--primary-dark)}
.hero{position:relative;background:linear-gradient(135deg,rgba(20,35,60,.94) 0%,rgba(30,45,75,.92) 100%),url('/images/2017/compressed/mac-2585220_1920.jpg') center/cover;color:var(--white);min-height:820px;display:flex;align-items:center;justify-content:center;padding:120px 48px;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 40px,rgba(255,255,255,.008) 40px,rgba(255,255,255,.008) 41px);pointer-events:none;z-index:1}
.hero-content{max-width:1280px;width:100%;margin:0 auto;position:relative;z-index:2;display:grid;grid-template-columns:1.15fr 440px;gap:80px;align-items:center}
.hero h1{font-size:64px;font-weight:900;line-height:1.05;letter-spacing:-2px;margin:0 0 32px 0}
.hero h1 .accent{color:#7dd3fc;font-weight:900}
.hero-subtitle{font-size:20px;font-weight:400;color:rgba(255,255,255,.9);line-height:1.75;max-width:600px;margin-bottom:36px}
.hero-features{list-style:none;padding:0;display:flex;flex-direction:column;gap:16px;margin:0 0 40px 0}
.hero-features li{display:flex;align-items:center;gap:14px;color:rgba(255,255,255,.94);font-size:17px;font-weight:500}
.hero-features .icon-check{color:var(--accent);background:rgba(16,185,129,.12);width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:13px;flex-shrink:0}
.hero-cta-btns{display:flex;gap:16px}
.floating-card{background:var(--white);border-radius:28px;padding:12px;box-shadow:0 40px 100px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);position:relative;z-index:2}
.floating-card h3{color:var(--gray-900);font-size:26px;font-weight:800;margin:0 0 12px 0;text-align:center;line-height:1.2;padding:12px 12px 0;letter-spacing:-.5px}
.floating-card iframe{width:100%;border:none;min-height:500px;display:block;border-radius:18px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:12px;padding:18px 40px;border-radius:14px;text-decoration:none;font-weight:700;font-size:17px;transition:all .35s cubic-bezier(.4,0,.2,1);cursor:pointer;border:none;letter-spacing:-.2px}
.btn:hover{transform:translateY(-2px)}
.btn-primary{background:var(--primary);color:var(--white);box-shadow:0 8px 24px rgba(44,90,160,.3)}
.btn-primary:hover{background:var(--primary-dark);box-shadow:0 12px 32px rgba(44,90,160,.4)}
.btn-secondary{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);color:var(--white);backdrop-filter:blur(12px)}
.btn-secondary:hover{background:rgba(255,255,255,.22);border-color:rgba(255,255,255,.32)}
.luxury-card{background:var(--white);padding:52px 44px;border-radius:24px;box-shadow:0 2px 8px rgba(0,0,0,.04);border:1px solid rgba(44,90,160,.06);transition:all .4s cubic-bezier(.4,0,.2,1);text-align:center;position:relative;overflow:hidden}
.luxury-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(44,90,160,.1),transparent)}
.luxury-card:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(0,0,0,.12);border-color:rgba(44,90,160,.12)}
.luxury-card-icon{width:72px;height:72px;border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 32px;font-size:32px;transition:all .4s ease;position:relative}
.luxury-card:hover .luxury-card-icon{transform:scale(1.05)}
.luxury-card h3{font-size:22px;font-weight:800;color:var(--gray-900);margin-bottom:18px;letter-spacing:-.5px;line-height:1.3}
.luxury-card p{font-size:16px;line-height:1.75;color:var(--gray-600);margin:0}
.stats-section{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);position:relative;overflow:hidden}
.stats-section::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,transparent 0%,rgba(59,130,246,.06) 100%)}
.stats-section::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 40px,rgba(255,255,255,.015) 40px,rgba(255,255,255,.015) 41px)}
.stat-card{text-align:center;padding:44px 32px;background:rgba(255,255,255,.05);border-radius:20px;backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);transition:all .4s ease;position:relative;z-index:1}
.stat-card:hover{background:rgba(255,255,255,.08);transform:translateY(-6px);border-color:rgba(255,255,255,.12)}
.stat-number{font-size:64px;font-weight:900;color:var(--white);margin-bottom:14px;line-height:1;letter-spacing:-2.5px}
.stat-label{font-size:13px;color:rgba(255,255,255,.75);font-weight:600;text-transform:uppercase;letter-spacing:1.5px}
.industry-hero{position:relative;height:520px;background:linear-gradient(135deg,rgba(15,23,42,.94) 0%,rgba(30,41,59,.90) 100%),url('/images/2017/compressed/datacenter-286386_1280.jpg') center/cover;display:flex;align-items:center;justify-content:center;margin-bottom:-60px;z-index:1}
.industry-hero-content{text-align:center;color:var(--white);max-width:900px;padding:0 48px;position:relative;z-index:2}
.industry-hero h2{font-size:56px;font-weight:900;color:var(--white);margin-bottom:24px;letter-spacing:-1.8px;line-height:1.1}
.industry-hero p{font-size:20px;color:rgba(255,255,255,.88);line-height:1.7;max-width:720px;margin:0 auto}
.industry-cards-wrapper{background:var(--white);padding:120px 0 100px;position:relative;z-index:2}
.industry-card{background:var(--white);border-radius:24px;padding:52px 44px;box-shadow:0 4px 16px rgba(0,0,0,.06);border:1px solid rgba(44,90,160,.08);transition:all .45s cubic-bezier(.4,0,.2,1);position:relative}
.industry-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(44,90,160,.15),transparent)}
.industry-card:hover{transform:translateY(-8px);box-shadow:0 30px 80px rgba(0,0,0,.16);border-color:rgba(44,90,160,.16)}
.industry-icon{width:64px;height:64px;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:32px;font-size:32px;transition:transform .4s ease}
.industry-card:hover .industry-icon{transform:scale(1.08)}
.industry-card h3{font-size:24px;font-weight:800;color:var(--gray-900);margin:0 0 22px 0;letter-spacing:-.6px;line-height:1.25}
.industry-card p{font-size:17px;line-height:1.8;color:var(--gray-600);margin:0}
.list-links{list-style:none;padding:0;text-align:left}
.list-links li{padding:10px 0;font-size:16px;color:var(--gray-700);transition:all .3s ease}
.list-links a{color:var(--primary);text-decoration:none;font-weight:500;transition:all .3s ease}
.list-links a:hover{color:var(--primary-dark);padding-left:4px}
@media(max-width:1100px){.hero-content{grid-template-columns:1fr 400px;gap:60px}.hero h1{font-size:56px}}
@media(max-width:968px){
.container{padding:0 32px}
.container-narrow{padding:0 32px}
.section{padding:90px 0}
.hero{min-height:auto;padding:80px 32px}
.hero-content{grid-template-columns:1fr;gap:48px}
.hero h1{font-size:44px;text-align:center}
.hero-subtitle{text-align:center;max-width:100%}
.floating-card{max-width:500px;margin:0 auto}
.hero-cta-btns{flex-direction:column;max-width:420px;margin:0 auto}
.hero-cta-btns a{width:100%}
.grid-2,.grid-3,.grid-4{grid-template-columns:1fr!important;gap:32px}
.section-title{font-size:40px;line-height:1.15}
.section-subtitle{font-size:17px}
.industry-hero{height:auto;padding:80px 32px;margin-bottom:-40px}
.industry-hero h2{font-size:40px}
.industry-hero p{font-size:18px}
div[style*="grid-template-columns:440px 1fr"]{grid-template-columns:1fr!important;gap:32px!important}
div[style*="padding:52px"]{padding:36px 28px!important}
div[style*="padding:56px"]{padding:36px 28px!important}
div[style*="padding:60px"]{padding:36px 28px!important}
}
@media(max-width:640px){.container{padding:0 24px}.section{padding:70px 0}.hero{padding:60px 24px}.hero h1{font-size:36px}.section-title{font-size:32px}.btn{padding:16px 32px;font-size:16px}}
</style>
</head>
<body>
<!-- PAGE_BUILDER_V3
     bible: A
     competition: MEDIUM
     niche: general
     word_count: 1535
     entities_placed: 8
     soft_targets: hero_intro|itad_services|industry_card_1|industry_card_2|industry_card_3|certifications_body|data_security|about_city
     faqs_selected: hipaa_compliant|cert|large_scale|areas
     sections_included: hero|equipment|certifications|stats_bar|industries|liquidation|data_security|faq|service_areas|related_services|cta
     sections_excluded: none
     seo_audit: v10.10
-->

<div class="hero full-width">
<div class="hero-content">
<div>
<h1>R2 Certified <span class="accent">Electronics Recycling</span> for Atlanta Government & Healthcare</h1>
<!-- AUDIT_TARGET: hero_intro -->
<p class="hero-subtitle">Professional ITAD and secure data destruction from one of the nation's largest R2 certified electronics recycling facilities. Trusted by leading organizations across healthcare, government, and enterprise sectors.</p>
<ul class="hero-features">
<li><span class="icon-check"><i class="fas fa-check"></i></span>R2 Certified Processing & Compliance</li>
<li><span class="icon-check"><i class="fas fa-check"></i></span>HIPAA-Certified Data Destruction</li>
<li><span class="icon-check"><i class="fas fa-check"></i></span>Free Pickup Throughout Fulton County</li>
</ul>
<div class="hero-cta-btns">
<a href="tel:470-226-5361" class="btn btn-primary"><i class="fas fa-phone"></i> (470) 226-5361</a>
<a href="mailto:recycle@stsrecycle.com" class="btn btn-secondary"><i class="fas fa-envelope"></i> Email Us</a>
</div>
</div>
<div class="floating-card">
<h3>Get A Free Quote</h3>
{loadposition city-hero-form}
</div>
</div>
</div>

<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:80px">
<div class="section-eyebrow">Why Choose STS</div>
<h2 class="section-title">Atlanta's Premier ITAD & Data Destruction Facility</h2>
<p class="section-subtitle">Professional electronics recycling and <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" class="link-p">IT asset disposition services</a> for Atlanta businesses and healthcare systems</p>
</div>

<div class="grid-3" style="margin-bottom:60px">
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#d1fae5 0%,#ecfdf5 100%);color:#047857;box-shadow:0 4px 16px rgba(4,120,87,.12)"><i class="fas fa-certificate"></i></div>
<h3>R2 Certified Facility</h3>
<p>Responsible recycling standards with full EPA compliance for Atlanta government and healthcare clients</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%);color:#1e40af;box-shadow:0 4px 16px rgba(30,64,175,.12)"><i class="fas fa-truck"></i></div>
<h3>Free Pickup Service</h3>
<p>Throughout Atlanta and Fulton County at no cost with flexible scheduling options</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#e0e7ff 0%,#eef2ff 100%);color:#4338ca;box-shadow:0 4px 16px rgba(67,56,202,.12)"><i class="fas fa-shield-alt"></i></div>
<h3>NIST Compliant Data Destruction</h3>
<p>Secure data wiping with HIPAA compliance and certificates of destruction for Georgia healthcare and enterprise clients</p>
</div>
</div>

<div class="grid-3" style="margin-bottom:70px">
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#f3e8ff 0%,#faf5ff 100%);color:#7c3aed;box-shadow:0 4px 16px rgba(124,58,237,.12)"><i class="fas fa-warehouse"></i></div>
<h3>600,000 sq ft Processing Facility</h3>
<p>Handle any size job from single computers to enterprise volumes with zero landfill commitment</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#fef3c7 0%,#fefce8 100%);color:#b45309;box-shadow:0 4px 16px rgba(180,83,9,.12)"><i class="fas fa-leaf"></i></div>
<h3>Zero Landfill Policy</h3>
<p>100% environmentally responsible processing with complete compliant recycling and ESG documentation</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#d1fae5 0%,#ecfdf5 100%);color:#059669;box-shadow:0 4px 16px rgba(5,150,105,.12)"><i class="fas fa-clock"></i></div>
<h3>Same-Day Response</h3>
<p>Quick quotes and fast scheduling for Atlanta businesses with convenient metro service</p>
</div>
</div>

<div style="text-align:center">
<div style="display:inline-flex;gap:18px;flex-wrap:wrap">
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn btn-primary">Schedule Free Pickup</a>
<a href="tel:470-226-5361" class="btn btn-primary"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg> Call (470) 226-5361</a>
</div>
</div>
</div>
</div>

<div class="section full-width bg-gray">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">Inventory</div>
<h2 class="section-title">Electronics We Recycle</h2>
<p class="section-subtitle">We process all electronic equipment from Fortune 500 headquarters to government agencies with secure data destruction</p>
</div>
<div class="grid-2" style="gap:80px;align-items:center;margin-bottom:70px">
<div class="text-c">
<img src="/images/2017/compressed/laptop-1742462_1920.jpg" alt="R2 certified electronics recycling ITAD services Atlanta Georgia businesses" style="width:100%;height:auto;border-radius:28px;box-shadow:0 10px 32px rgba(0,0,0,.08)" loading="lazy">
<p style="margin-top:24px;font-size:16px;color:var(--gray-600);font-weight:500;line-height:1.75">Most healthcare IT managers choose vendors with NAID AAA certification, which is why STS is frequently recommended by HIPAA compliance officers</p>
</div>
<div>
<h3 style="font-size:36px;font-weight:900;color:var(--primary);margin-bottom:32px;line-height:1.2;letter-spacing:-1.2px">IT Asset Disposition for Georgia Organizations</h3>
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);margin-bottom:28px">Corporate IT directors at organizations like Delta Air Lines (34,500 Atlanta-based employees) and The Home Depot require vendors providing Business Associate Agreements and coordinating multi-building pickups. STS Electronic Recycling serves Georgia State agencies, Fulton County departments, and healthcare systems including Emory Healthcare (32,000 staff across 11 hospitals) and Northside Hospital (16,000 employees) with R2v3 certified IT asset disposition.</p>
<p style="font-size:18px;line-height:1.8;color:var(--gray-700)">According to the UN Global E-waste Monitor, only 17.4% of electronic waste is properly recycled worldwide. STS provides <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" class="link-p">comprehensive ITAD services</a> with serial-number-specific certificates of destruction and downstream material tracking for Atlanta enterprises.</p>
</div>
</div>
<div class="grid-2" style="gap:44px">
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--primary);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Computer & IT Equipment</h4>
<ul class="list-links">
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/317-computer-recycling">Computer Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/318-laptop-recycling">Laptop Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/331-tablet-recycling">Tablet Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/319-cell-phone-recycling">Cell Phone & Mobile Device Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/320-networking-equipment-recycling">Networking Equipment Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/321-printer-recycling">Printer Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/322-copy-machine-recycling">Copy Machine & Copier Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/323-server-equipment-recycling">Server & Data Center Equipment</a></li>
</ul>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--gray-700);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Components & Accessories</h4>
<ul class="list-links">
<li>• <a href="https://www.stselectronicrecyclinginc.com/atlanta-hard-drive-shredding">Hard Drive Destruction</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/325-monitor-recycling">Monitor & Display Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/324-ink-and-toner-recycling">Ink & Toner Cartridge Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/329-keyboard-mouse-recycling">Keyboard & Peripheral Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/328-cable-recycling">Cable & Wire Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/327-battery-recycling">Battery Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/326-old-electronics-recycling">Legacy & Old Electronics</a></li>
</ul>
</div>
</div>
</div>
</div>

<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">Certifications</div>
<h2 class="section-title">R2 Certified ITAD Services</h2>
<p class="section-subtitle">Secure IT asset disposition for corporations, government agencies, and healthcare systems throughout Atlanta</p>
</div>
<div class="grid-4" style="margin-bottom:70px">
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#fef3c7 0%,#fefce8 100%);color:#b45309;box-shadow:0 4px 16px rgba(180,83,9,.12)"><i class="fas fa-certificate"></i></div>
<h3>R2 Certified</h3>
<p>Compliance with Georgia state and federal standards</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#e0e7ff 0%,#eef2ff 100%);color:#4338ca;box-shadow:0 4px 16px rgba(67,56,202,.12)"><i class="fas fa-shield-alt"></i></div>
<h3>HIPAA Destruction</h3>
<p>NIST-certified processes with complete chain-of-custody</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#d1fae5 0%,#ecfdf5 100%);color:#047857;box-shadow:0 4px 16px rgba(4,120,87,.12)"><i class="fas fa-dollar-sign"></i></div>
<h3>IT Asset Recovery</h3>
<p>Maximize value with detailed ROI documentation</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%);color:#1e40af;box-shadow:0 4px 16px rgba(30,64,175,.12)"><i class="fas fa-map-marker-alt"></i></div>
<h3>Atlanta Service</h3>
<p>Free pickup throughout Fulton County</p>
</div>
</div>
<div style="padding:48px 56px;background:linear-gradient(135deg,rgba(59,130,246,.04) 0%,rgba(59,130,246,.02) 100%);border-left:5px solid var(--primary);border-radius:20px;margin-bottom:70px;box-shadow:0 2px 8px rgba(0,0,0,.04)">
<div style="display:flex;align-items:start;gap:24px">
<div style="flex-shrink:0;width:64px;height:64px;background:var(--primary);border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(44,90,160,.2)"><i class="fas fa-file-contract" style="color:white;font-size:28px"></i></div>
<div>
<h4 style="font-size:24px;font-weight:800;color:var(--primary);margin:0 0 16px 0;letter-spacing:-.5px">NIST 800-88 Rev. 1 Compliance</h4>
<p style="font-size:17px;line-height:1.8;color:var(--gray-700);margin:0">Our R2v3 certification ensures downstream tracking through final processing. NIST SP 800-88 Rev. 1 mandates cryptographic erasure or physical destruction as the federal standard for all media containing sensitive data. Our documentation meets DOD 5220.22-M and HIPAA technical safeguard requirements. <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding" class="link-p">Secure hard drive shredding services</a> ensure the highest data destruction standards for Atlanta organizations.</p>
</div>
</div>
</div>
<div class="container-narrow">
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);margin-bottom:24px;text-align:center"><strong>How does electronics recycling work in Atlanta?</strong> STS provides R2v3 certified processing with free pickup throughout Fulton County and DeKalb County. Equipment is transported to our 600,000 sq ft facility where NIST 800-88 compliant data sanitization occurs before responsible material recovery.</p>
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);text-align:center">When evaluating electronic waste disposal providers, IT directors at Fortune 500 companies like Coca-Cola and UPS prioritize R2v3 certification and audit documentation. Our secure fleet serves Atlanta businesses near I-285, I-75, and throughout the Buckhead and Midtown districts. Healthcare IT managers at Emory Healthcare and Wellstar Health System require HIPAA-compliant technical safeguards for protected health information. Our <a href="https://www.stselectronicrecyclinginc.com/healthcare-it-disposal" class="link-p">specialized healthcare IT disposal services</a> meet the rigorous compliance requirements of Georgia's largest medical institutions.</p>
</div>
</div>
</div>

<div class="section full-width stats-section">
<div class="container text-c" style="position:relative;z-index:2">
<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:2.5px;margin-bottom:20px">Atlanta Electronics Recycling</div>
<h2 style="font-size:72px;font-weight:900;text-transform:uppercase;color:#7dd3fc;margin-bottom:32px;letter-spacing:-2.5px">ABSOLUTELY FREE</h2>
<p style="font-size:21px;color:rgba(255,255,255,.92);max-width:820px;margin:0 auto 52px;line-height:1.75;font-weight:400">STS Electronic Recycling offers <strong>ABSOLUTELY FREE</strong> solutions to your Atlanta business, government agency, or healthcare facility.</p>
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn" style="background:var(--white);color:var(--primary);box-shadow:0 12px 32px rgba(0,0,0,.3);font-size:18px;padding:20px 48px">Get Free Quote →</a>
<div class="grid-4" style="margin-top:80px">
<div class="stat-card"><div class="stat-number">600K</div><div class="stat-label">Sq Ft Facility</div></div>
<div class="stat-card"><div class="stat-number">R2</div><div class="stat-label">Certified Recycling</div></div>
<div class="stat-card"><div class="stat-number">ZERO</div><div class="stat-label">Landfill Policy</div></div>
<div class="stat-card"><div class="stat-number">FREE</div><div class="stat-label">Pickup Service</div></div>
</div>
</div>
</div>

<div class="section full-width" style="padding:0">
<div class="industry-hero">
<div class="industry-hero-content">
<div class="section-eyebrow" style="color:rgba(255,255,255,.75)">Industries Served</div>
<h2>Trusted by Atlanta's Leading Institutions</h2>
<p>Tailored compliance solutions for Georgia's major economic sectors</p>
</div>
</div>
<div class="industry-cards-wrapper">
<div class="container">
<div class="grid-3">
<div class="industry-card">
<div class="industry-icon" style="background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%);color:#1e40af"><svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg></div>
<h3>Government & Public Sector</h3>
<p>R2v3 certified data destruction for Georgia State agencies, Fulton County offices, and Atlanta City Hall with federal procurement compliance and chain-of-custody documentation.</p>
</div>
<div class="industry-card">
<div class="industry-icon" style="background:linear-gradient(135deg,#fee2e2 0%,#fef2f2 100%);color:#dc2626"><svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/></svg></div>
<h3>Healthcare Systems</h3>
<p>HIPAA-compliant disposal trusted by Emory Healthcare, Northside Hospital, and Grady Health System with Business Associate Agreements and OCR audit documentation.</p>
</div>
<div class="industry-card">
<div class="industry-icon" style="background:linear-gradient(135deg,#f3e8ff 0%,#faf5ff 100%);color:#7c3aed"><svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg></div>
<h3>Fortune 500 Headquarters</h3>
<p>Delta Air Lines, The Home Depot, UPS, and Coca-Cola depend on STS for enterprise ITAD with weekend coordination, multi-site logistics, and complete audit trails.</p>
</div>
</div>
</div>
</div>
</div>

<div class="section full-width bg-gray">
<div class="bg-pattern"></div>
<div class="container">
<div class="container-narrow">
<h2 style="font-size:48px;font-weight:900;color:var(--primary);margin-bottom:36px;text-align:center;letter-spacing:-1.5px;line-height:1.1">How Can I Liquidate IT Equipment in Atlanta?</h2>
<p style="font-size:20px;line-height:1.8;margin-bottom:44px;text-align:center;color:var(--gray-700)">STS Electronic Recycling's asset recovery service helps Atlanta businesses recover value from computers, laptops, LCD monitors, and other retired IT equipment through secure, R2v3 certified disposition.</p>
<div style="background:linear-gradient(135deg,#dbeafe 0%,#f0f9ff 100%);padding:56px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<p style="font-size:20px;font-weight:600;text-align:center;color:var(--primary);line-height:1.8">Discovering your Atlanta IT assets' value is simple—call our team at <strong><a href="tel:470-226-5361" style="text-decoration:none;color:var(--primary)">(470) 226-5361</a></strong> or email <a href="mailto:recycle@stsrecycle.com" style="text-decoration:none;color:var(--primary);font-weight:700">recycle@stsrecycle.com</a>.</p>
</div>
</div>
</div>
</div>

<div class="section full-width" style="background:linear-gradient(135deg,#0a0f1e 0%,#1a1f35 100%)">
<div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 40px,rgba(255,255,255,.008) 40px,rgba(255,255,255,.008) 41px);pointer-events:none"></div>
<div class="container" style="position:relative;z-index:2">
<div class="grid-2" style="gap:80px;align-items:center;margin-bottom:80px">
<div class="text-c">
<img src="/images/2017/compressed/castle-3181153_1920.jpg" alt="HIPAA compliant data destruction NIST certified secure shredding Georgia healthcare" style="width:100%;height:auto;border-radius:28px;box-shadow:0 20px 70px rgba(0,0,0,.7)" loading="lazy">
</div>
<div>
<h2 style="font-size:48px;font-weight:900;color:var(--white);margin-bottom:36px;letter-spacing:-1.5px;line-height:1.1">Is My Data Safe During Atlanta Electronics Recycling?</h2>
<p style="font-size:18px;line-height:1.8;margin-bottom:28px;color:rgba(255,255,255,.9)">Under HIPAA 45 CFR §164.312 requirements, electronic protected health information on disposed devices must be rendered irretrievable. Per NIST SP 800-88 Rev. 1 guidelines, media sanitization requires verification of purge-level overwrite or physical destruction—STS provides certified destruction meeting both standards.</p>
<p style="font-size:18px;line-height:1.8;margin:0;color:rgba(255,255,255,.9)"><strong>Secure data erasure and hard drive destruction are essential</strong> when recycling electronics in Atlanta. According to U.S. PIRG, Americans generate approximately 6.9 million tons of electronic waste annually, yet e-waste accounts for two-thirds of heavy metals in landfills. STS guarantees NIST 800-88 compliant destruction for organizations like Georgia-Pacific and Wellstar Health System (15,000 employees). Corporate IT departments typically coordinate weekend pickups to avoid business interruption—standard for STS engagements with Atlanta's largest employers.</p>
</div>
</div>
<div class="grid-4" style="max-width:1100px;margin:0 auto">
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(96,165,250,.12);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(96,165,250,.25);box-shadow:0 8px 24px rgba(96,165,250,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-certificate" style="color:#60a5fa;font-size:34px"></i></div>
<h4 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">NIST 800-88</h4>
<p style="color:rgba(255,255,255,.7);font-size:15px">Certified</p>
</div>
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(16,185,129,.12);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(16,185,129,.25);box-shadow:0 8px 24px rgba(16,185,129,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-award" style="color:var(--accent);font-size:34px"></i></div>
<h4 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">DoD Standards</h4>
<p style="color:rgba(255,255,255,.7);font-size:15px">Exceeds</p>
</div>
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(255,255,255,.08);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-medkit" style="color:rgba(255,255,255,.85);font-size:34px"></i></div>
<h4 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">HIPAA</h4>
<p style="color:rgba(255,255,255,.7);font-size:15px">Compliant</p>
</div>
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(255,255,255,.08);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-clipboard-check" style="color:rgba(255,255,255,.85);font-size:34px"></i></div>
<h4 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">Chain of Custody</h4>
<p style="color:rgba(255,255,255,.7);font-size:15px">Complete</p>
</div>
</div>
</div>
</div>

<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">FAQ</div>
<h2 class="section-title">Common Questions</h2>
<p class="section-subtitle">Everything you need to know about R2 certified electronics recycling in Atlanta</p>
</div>
<div class="grid-2" style="gap:44px">
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">Is your data destruction HIPAA compliant?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">Yes. STS provides HIPAA-compliant data destruction for Atlanta healthcare facilities including Emory Healthcare, Northside Hospital, and Grady Health System (7,600 employees). Healthcare compliance officers typically expect detailed <a href="https://www.stselectronicrecyclinginc.com/certificate-of-destruction-services" class="link-p">certificates of destruction</a> for OCR audit reviews—included in every STS engagement with Business Associate Agreements and chain-of-custody documentation.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">What certifications do you hold?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">STS holds R2v3 (Responsible Recycling) certification, <a href="https://www.stselectronicrecyclinginc.com/naid-certified-data-destruction" class="link-p">NAID AAA certification</a>, NIST 800-88 compliant data sanitization, and maintains HIPAA-compliant processes for healthcare facilities. We meet all federal and state requirements for government contractors.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">Can you handle large-scale ITAD projects?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">Absolutely. Our 600,000 sq ft facility handles enterprise-scale IT asset disposition projects including <a href="https://www.stselectronicrecyclinginc.com/data-center-decommissioning" class="link-p">data center decommissioning</a>, multi-building government coordination, and healthcare system-wide equipment disposal. We regularly serve Fortune 500 companies including Delta Air Lines and The Home Depot with comprehensive e-waste management solutions.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">What areas do you serve?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">We provide free pickup throughout Atlanta, Fulton County, DeKalb County, Cobb County, and Gwinnett County including Buckhead, Midtown, Sandy Springs, Roswell, Alpharetta, Marietta, Decatur, and Dunwoody. Organizations searching for electronics recycling near me throughout Atlanta find STS provides same-day response for government agencies and healthcare facilities with convenient scheduling near I-285 and GA-400.</p>
</div>
</div>
</div>
</div>

<div class="section full-width bg-gray">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:80px">
<div class="section-eyebrow">Local Focus</div>
<h2 class="section-title">Service Areas & About Atlanta</h2>
</div>
<div style="display:grid;grid-template-columns:440px 1fr;gap:48px;margin-bottom:48px;align-items:stretch">
<div style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);color:#fff;padding:60px 48px;border-radius:24px;box-shadow:0 10px 32px rgba(0,0,0,.08)">
<h3 style="font-size:26px;font-weight:800;color:#fff;margin:0 0 44px 0;letter-spacing:-.6px">Atlanta by the Numbers</h3>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px 28px">
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">498K+</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">POPULATION</div></div>
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">4+</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">MAJOR UNIVERSITIES</div></div>
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">80+</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">HEALTHCARE FACILITIES</div></div>
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">18</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">FORTUNE 500 HQS</div></div>
</div>
</div>
<div style="background:#fff;padding:60px 56px;border-radius:24px;box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h3 style="font-size:26px;font-weight:800;color:var(--gray-900);margin:0 0 44px 0;letter-spacing:-.6px">Service Areas</h3>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0 52px">
<div><h4 style="color:var(--primary);font-size:13px;font-weight:800;margin:0 0 24px 0;text-transform:uppercase;letter-spacing:1.8px">PRIMARY</h4><div style="font-size:16px;line-height:2;color:var(--gray-700);font-weight:500"><div>Downtown Atlanta</div><div>Buckhead</div><div>Midtown</div><div>Sandy Springs</div><div>Roswell</div><div>Alpharetta</div></div></div>
<div><h4 style="color:var(--primary);font-size:13px;font-weight:800;margin:0 0 24px 0;text-transform:uppercase;letter-spacing:1.8px">METRO</h4><div style="font-size:16px;line-height:2;color:var(--gray-700);font-weight:500"><div>Marietta</div><div>Decatur</div><div>Dunwoody</div><div>Johns Creek</div><div>Smyrna</div><div>East Point</div></div></div>
<div><h4 style="color:var(--primary);font-size:13px;font-weight:800;margin:0 0 24px 0;text-transform:uppercase;letter-spacing:1.8px">REGIONAL</h4><div style="font-size:16px;line-height:2;color:var(--gray-700);font-weight:500"><div>Gwinnett County</div><div>Cobb County</div><div>DeKalb County</div><div>Clayton County</div><div>Douglas County</div><div>Greater Georgia</div></div></div>
</div>
</div>
</div>
<div style="background:#fff;padding:56px 60px;border-radius:24px;box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:24px;font-weight:800;margin:0 0 24px 0;color:var(--gray-900);letter-spacing:-.5px">About Atlanta</h4>
<p style="font-size:17px;line-height:1.8;color:var(--gray-700);margin:0">Georgia's capital hosts the State Capitol, Fulton County government, and universities including Georgia Tech and Georgia State University. With 18 Fortune 500 headquarters—including The Home Depot, Delta Air Lines, Coca-Cola, and UPS—Atlanta generates significant IT equipment turnover across healthcare, government, and corporate sectors. STS Electronic Recycling provides <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" style="color:var(--primary);text-decoration:none;font-weight:600">R2v3 certified electronics disposal and NAID AAA data destruction</a> serving Emory Healthcare, Northside Hospital, Georgia State agencies, and enterprise operations throughout Fulton County, DeKalb County, and metro Atlanta.</p>
</div>
</div>
</div>

<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">Related Services</div>
<h2 class="section-title">Related Atlanta Services</h2>
<p class="section-subtitle">Comprehensive ITAD and electronics recycling solutions for metro Atlanta businesses</p>
</div>
<div class="grid-2" style="gap:44px">
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--primary);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Core ITAD Services</h4>
<ul class="list-links">
<li>• <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad">ITAD Services</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding">Hard Drive Destruction</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding">On-Site Shredding</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/healthcare-it-disposal">Healthcare IT Disposal</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/certificate-of-destruction-services">Certificate of Destruction</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/data-center-decommissioning">Data Center Decommissioning</a></li>
</ul>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--gray-700);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Strategic Services</h4>
<ul class="list-links">
<li>• <a href="https://www.stselectronicrecyclinginc.com/corporate-data-security-disposal">Corporate Data Security</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/government-data-destruction">Government Electronics</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/hipaa-compliant-hard-drive-destruction">HIPAA Compliant Destruction</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/naid-certified-data-destruction">NAID Certified Destruction</a></li>
</ul>
</div>
</div>
</div>
</div>

<div class="section full-width" style="background:linear-gradient(135deg,#2c5aa0 0%,#1e40af 100%);padding:110px 0;text-align:center;color:#fff">
<div class="container">
<h2 style="font-size:60px;font-weight:900;margin-bottom:32px;letter-spacing:-2px">Ready to Get Started?</h2>
<p style="font-size:21px;opacity:.92;margin-bottom:48px;max-width:640px;margin-left:auto;margin-right:auto;line-height:1.75;font-weight:400">Free pickup throughout Atlanta and Fulton County. Same-day response for government and healthcare facilities.</p>
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn" style="background:#fff;color:var(--primary);padding:22px 52px;font-weight:900;box-shadow:0 8px 28px rgba(0,0,0,.25);font-size:18px">Schedule Free Pickup</a>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:28px;margin-top:80px;max-width:740px;margin-left:auto;margin-right:auto">
<a href="tel:470-226-5361" style="background:rgba(255,255,255,.14);backdrop-filter:blur(16px);padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,.22);transition:all .4s ease;cursor:pointer;text-decoration:none;color:#fff;display:block"><i class="fas fa-phone" style="font-size:28px;margin-bottom:20px;opacity:.92"></i><div style="font-weight:700;font-size:18px">(470) 226-5361</div></a>
<a href="mailto:recycle@stsrecycle.com" style="background:rgba(255,255,255,.14);backdrop-filter:blur(16px);padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,.22);transition:all .4s ease;cursor:pointer;text-decoration:none;color:#fff;display:block"><i class="fas fa-envelope" style="font-size:28px;margin-bottom:20px;opacity:.92"></i><div style="font-weight:700;font-size:18px">recycle@stsrecycle.com</div></a>
</div>
<div style="margin-top:100px;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.35)">
<div style="padding:32px;color:var(--gray-900);background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600">
<div style="font-size:20px;margin-bottom:12px;color:var(--primary);font-weight:800;letter-spacing:-.3px">📍 STS Electronic Recycling - Atlanta</div>
<div style="font-size:16px;color:var(--gray-600);font-weight:500">3455 Peachtree Rd NE 5th Floor, Atlanta, GA 30326</div>
<div style="font-size:15px;color:var(--gray-500);margin-top:8px;font-weight:400">Access to Downtown Atlanta - Georgia State Capitol & Fulton County offices</div>
</div>
<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3316.2429863247347!2d-84.360527!3d33.8505911!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x88f50f2adabff44b%3A0xeec57509d117afea!2sSTS%20Electronic%20Recycling!5e0!3m2!1sen!2sus!4v1234567890" width="100%" height="460" style="border:0;display:block" allowfullscreen loading="lazy"></iframe>
</div>
</div>
</div>

</body>
</html>



```

### Fixture — master-page-builder.txt

`scripts/src/bakeoff/fixtures/master-page-builder.txt` — 47,161 chars

```text
MASTER PAGE BUILDER v3.6 — STS LANDING PAGE BUILDER
LEAN PRODUCTION VERSION — LANDING PAGES ONLY

[PROMPT_METADATA]
version: 3.6
type: landing_page_builder
page_types: commercial landing pages only
output_files: 1 (html only — SEO Audit creates research brief)
guide_pages: use Master_Guide_Builder.docx instead

[V3.1_CHANGES]
Gate 6 expanded with two enforcement subsections: COMPLIANCE CLAIMS LANGUAGE (no phrasing that guarantees compliance, qualified pricing, no absolute service promises) and CERTIFICATION SCOPE (NAID AAA = data destruction only, R2v3 = recycling only, NIST 800-88 = standard not a held certification). Gate 13 Standard 12 gains two matching verification checkboxes. No instruction, pattern, or example removed. The internal metadata token PAGE_BUILDER_V3 is intentionally unchanged and remains locked for SEO Audit parsing.

[V3.2_CHANGES]
Fixes the production image bug. Gate 12 IMAGE REQUIREMENTS and Gate 13 Standard 11 now require full absolute HTTPS image URLs (https://www.stselectronicrecyclinginc.com/images/2017/compressed/[file]_1920.jpg), never root-relative paths. Joomla silently fails on root-relative img src, which has been shipping broken images on every page since at least May 2026. Removed from both Bible content lists: castle-3181153 (Sugar Land confirmed broken), datacenter-286386 (Baltimore confirmed broken), data-3181149 (unverified, removed pending server confirmation), desk-4308230 (unverified, removed pending server confirmation). Confirmed-live image set retained: mac-2585220 (hero, both bibles), laptop-1742462 (content, both bibles). Gate 13 Standard 12 checklist gains one new verification line for absolute HTTPS img src. The internal metadata token PAGE_BUILDER_V3 remains unchanged.

[V3.3_CHANGES]
Restores castle-3181153, data-3181149, datacenter-286386, and desk-4308230 to the Bible content lists after server ground-truth verification (Joomla media manager listing, 2026-06-05). The v3.2 "confirmed broken" classification from the handoff was wrong: all four files exist live on the server. The actual bug was per-file path quirks combined with root-relative paths. Each image now has its exact verified URL hard-coded in the prompt to eliminate guessing. Two exceptions to the standard /compressed/[file]_1920.jpg pattern are documented: datacenter-286386 uses _1280 suffix (only size that exists), desk-4308230 lives at /images/2017/desk-4308230.jpg (not in /compressed/). Bible A content (3 images) and Bible B content (4 images) restored to original variety. Gate 13 Standard 11 now lists exact URLs per image. Gate 13 Standard 12 checklist updated: removed the now-incorrect "no reference to data-3181149 or desk-4308230" line, kept the absolute-HTTPS enforcement. The internal metadata token PAGE_BUILDER_V3 remains unchanged.

[V3.4_CHANGES]
Adds debug language to Gate 12 IMAGE REQUIREMENTS to convert image failure mode from "silent broken image" to "loud halt." New HARD RULE forbids constructing image URLs by combining basename, suffix, and folder; the Verified image library is the complete set of allowed img src values; if a build requires an image not listed, the model must HALT with message IMAGE_NOT_VERIFIED: [basename]. This closes the class of bug that produced the v3.0 datacenter (_1920 vs _1280) and desk (/compressed/ vs root) failures by making image URL generation deterministic instead of inferential. Single-gate addition; no Gate 13 verification check added in this pass. The internal metadata token PAGE_BUILDER_V3 remains unchanged.

[V3.5_CHANGES]
Two enforcement additions, plus matching Gate 13 verification (following the v3.1 pattern of rule-in-source-gate plus check-in-Gate-13).

Em-dash guardrail. Adds EM DASHES rule to Gate 6 prohibiting em dashes (literal — character) and the &mdash; entity in generated page output (body paragraphs, headlines, FAQ answers, CTA copy, image alt text). The handoff documented em dashes appearing in every recent build (Houston 12, Jacksonville 4, NY 13) as a model generation artifact. This catches them at the source rather than relying on the Audit downstream. Gate 13 Standard 12 gains one verification line. Note: the rule applies to OUTPUT only; the prompt's own instructional prose is unaffected.

Entity density target. Adds ENTITY DENSITY TARGET subsection to Gate 12 ENTITY PLACEMENT RULES. Each page should reach 12+ distinct entities total across four categories combined: named organizations (4-5 max, unchanged), regulatory entities (NIST 800-88, R2v3 standard, NAID AAA standard, niche-specific CFRs), geographic entities (CITY, COUNTY, NEIGHBORHOODS, LANDMARK from GMB), certifications and standards. Aligns with GEO-16 framework (Kumar et al, ~78% cross-engine citation rate at 12+ pillar density). Does not change the existing 4-5 named-organization cap. Gate 13 Standard 12 gains one verification line.

The internal metadata token PAGE_BUILDER_V3 remains unchanged.

[V3.6_CHANGES]
Adds a CONFLICT-PRECEDENCE LADDER to Gate 12, borrowed from the SEO Audit v10.12.2 cross-model review. Gate 12 carries competing hard requirements that can collide on short pages: word-count ceiling, the 12+ entity density target (v3.5), the 3-4 mandatory city spoke links (HALT if handoff provided and zero placed), and paragraph limits. Previously the model improvised when these could not all be satisfied, producing inconsistent behavior across the 580-page corpus. The ladder documents a fixed resolution order so the same conflict resolves the same way every time. Ordering places no-invention and preservation rules at the top (a mandatory city-spoke-link requirement must never push the model toward inventing a URL when no allowlist entry exists), mandatory city spoke links second, word ceiling third, density and link targets fourth, stylistic preferences last. Single-gate addition. No existing rule changed; this only defines precedence when existing rules conflict. The quotation soft-target check from the same handoff was evaluated and required no edit: the Builder soft-paragraph system is already generic enough to leave room for the Audit's Phase 1F Task 3 quote insertion. The internal metadata token PAGE_BUILDER_V3 remains unchanged.

[EXECUTION_MODE]
mode: SILENT_EXECUTION
All gates execute silently. Suppress progress updates, gate confirmations, self-checks, optimization details, technical validations, and metadata display. Show only critical errors that block progress and final deliverables with download links. Final delivery format: "✅ {CITY} complete. File ready." + download link.

[REQUIRED_INPUTS]
Master Design Bible CODE (.docx) — HTML structure and CSS template
STS SEO DATA 2026 (.xlsx) — Page performance metrics
Handoff Document (.md) — OPTIONAL — City sibling page URLs + local context
User provides: page_url, gmb_url, gmb_data (screenshot or text)

[GLOBAL_VARIABLES]
FROM_URL: CITY, STATE (2-letter), SERVICE
FROM_GMB: GMB_LINK, ADDRESS, PHONE (XXX-XXX-XXXX), CID, CID_DECIMAL, CID_NORMALIZED, ZIP, COUNTY, NEIGHBORHOODS, LANDMARK, LAT, LNG, OPEN_TIME, CLOSE_TIME
FROM_RESEARCH: COMPETITION_LEVEL (LOW|MEDIUM|HIGH), FINAL_TARGET, COMPETITOR_AVG_WORDCOUNT, KEYWORDS_LONGTAIL (5), KEYWORDS_POPULAR (5)
FROM_CLASSIFICATION: PAGE_CLASSIFICATION (LIGHT_TOUCH|REVAMP|NEW_BUILD), CONTENT_PRESERVATION_PERCENTAGE, CURRENT_CLICKS, CURRENT_POSITION
FROM_STRATEGY: PAGE_TYPE (HUB|SPOKE), META_TITLE, META_DESCRIPTION, META_KEYWORDS (8), SELECTED_BENEFITS (6)
FROM_CITY_RESEARCH: CITY_UNIQUE_SENTENCES (2-3), CITY_INDUSTRY_CONTEXT, CITY_GEOGRAPHIC_FACTS
FROM_HANDOFF: RELATED_PAGES (3-6 URLs), HANDOFF_ENTITIES, TIER_STRUCTURE

[GATE_1_PAGE_TYPE_DETECTION]
priority: CRITICAL — execute first before any processing
Extract URL from user input. Check for guide keyword. IF "guide" in URL.lowercase(): HALT: "⛔ WRONG PROMPT. This URL is a guide page. Use Master_Guide_Builder.docx. Do not proceed." EXIT. ELSE: proceed to Gate 2.

[GATE_2_PREFLIGHT]
Extract from URL: CITY, STATE, SERVICE. Validate all non-empty, STATE length==2. Validate files: Master Design Bible CODE uploaded, STS SEO DATA Excel uploaded, Handoff document (check if present). GMB CID conversion: Extract hex CID from GMB URL. Convert hex to decimal. Store as CID_DECIMAL and CID_NORMALIZED (format: "cid:XXXXXXXXXXXXXXXXXX"). Design Bible selection: If user specifies bible, use that. Otherwise Hash(CITY+STATE) mod 2 → 0=Bible A, 1=Bible B. Store as BIBLE_VERSION. On fail: halt with error.

[GATE_3_HUB_SPOKE]
IF url contains "{city}-electronics-recycling" OR "{city}-e-waste": PAGE_TYPE = HUB, COMMERCIAL_OPTIMIZATION = false
ELSE: PAGE_TYPE = SPOKE, COMMERCIAL_OPTIMIZATION = true

[GATE_4_HANDOFF_LOADER]
Conditional — only if handoff file provided. IF handoff found: Parse markdown. Extract: city_context, state_context, total_pages, all page URLs with tier assignments. Identify current page tier by matching URL. Build RELATED_PAGES array (3-6 URLs): priority Tier 1 → related services → same tier. Build TIER_STRUCTURE: store tier assignment for each URL for link priority in Gate 12. Extract Local Context section as HANDOFF_ENTITIES array: entity names, specific data points (bed counts, revenue, student counts, employee counts). These are pre-curated — skip verification, available for Gate 11 and Gate 12. ELSE: RELATED_PAGES = empty, HANDOFF_ENTITIES = empty, use corporate links only.

[GATE_5_GMB_COLLECTION]
GMB_LINK is mandatory. If missing: request from user and halt. Extract: ADDRESS, PHONE, CID (convert to decimal), ZIP, COUNTY, NEIGHBORHOODS, LANDMARK, LAT, LNG, OPEN_TIME (default 08:00), CLOSE_TIME (default 17:00). Validate: GMB_LINK pattern (maps.app.goo.gl or google.com/maps), CID numeric 15-20 digits, PHONE format XXX-XXX-XXXX, LAT range [-90,90], LNG range [-180,180]. On fail: halt.

[GATE_6_FACILITY_LANGUAGE]
Store these rules for enforcement in Gate 12 and Gate 13.

FORBIDDEN PATTERNS — never use in any output: "facility in {CITY}", "our {CITY} facility", "{CITY} facility", "{CITY} location", "{CITY} recycling center", "{CITY} warehouse", "located in {CITY}", "our {CITY} office", "sales office in {CITY}", "recycling facility in {CITY}", "visit our facility in {CITY}", "the {CITY} facility"

Facility size + location: "Our 600,000 sq ft facility in {CITY}" — FORBIDDEN. "Our 600,000 sq ft facility serves {CITY}" — APPROVED.

APPROVED PATTERNS: "We serve {CITY} from our 600,000 sq ft R2v3 certified facility" "Our secure fleet serves {CITY} with scheduled pickups" "{CITY} electronics recycling services" / "R2 certified processing for {CITY}"

FACILITY SIZE: Always 600,000 sq ft. If input HTML contains ANY facility size other than 600,000 (including 50,000, 50K, 150,000, 150K, or any other value), correct ALL instances to 600,000 sq ft.

NEGATIVE SCOPE — STS doesn't offer: "paper shredding", "document shredding", "file destruction", "records shredding" → Replace with "hard drive destruction" or "digital media destruction"

EM DASHES. Never use em dashes (the literal — character) or the &mdash; HTML entity in generated page output. This applies to all body paragraphs, headlines, FAQ answers, CTA copy, and image alt text. Use commas, semicolons, periods, or parentheses for the same separation function. The SEO Audit catches em dashes downstream, but they are a model generation artifact that must be prevented at the source. This rule applies to page OUTPUT only; the prompt's own instructional prose is unaffected.

COMPLIANCE CLAIMS LANGUAGE. STS content describes compliance support, never guaranteed regulatory outcomes. This applies to every niche, with highest priority on healthcare, financial, and government pages where compliance content is densest.
FORBIDDEN: "guarantees compliance", "guarantees HIPAA compliance", "ensures compliance", "meets all {regulation} requirements", "fully compliant", "100% compliant", or any phrasing that promises a regulatory outcome.
APPROVED: "helps meet {regulation} requirements", "supports {regulation} compliance", "designed to support compliance with {regulation}", "documentation that supports {regulation} audits".
ABSOLUTE PROMISES: replace "always", "guaranteed", and "same-day guaranteed" with "typically", "generally", or "most organizations". Existing timeline specifics from Gate 14 (e.g. "same-week pickup", "Certificate within 48 hours") are factual service descriptions and remain approved.
PRICING: "free pickup" is permitted because pickup is genuinely free. Any broader free-service claim must be qualified, e.g. "free recycling for qualifying volumes". Never state specific prices.

CERTIFICATION SCOPE. State each certification only in its correct scope. Conflated certification claims are factually wrong and undermine the authority the page is built to project.
NAID AAA: data destruction only. Correct usage: "NAID AAA certified data destruction", "NAID AAA certified hard drive shredding". Forbidden: "NAID AAA certified recycling", "NAID certified electronics recycling".
R2v3: electronics recycling and responsible downstream processing only. Correct usage: "R2v3 certified processing", "R2v3 certified electronics recycling", "R2v3 certified facility". Forbidden: "R2 certified data destruction", "R2v3 certified shredding".
NIST 800-88: a data sanitization standard, not a certification STS holds. Correct usage: "destruction that exceeds NIST 800-88", "NIST 800-88 compliant destruction". Forbidden: "NIST 800-88 certified".
When one sentence spans both destruction and recycling, name both certifications in their correct scope. Do not blend them into a single claim.

[GATE_7_CURRENT_PAGE_ANALYSIS]
tool: web_fetch on PAGE_URL
IF page not found: CURRENT_WORDCOUNT = 0, EXISTING_CONTENT = none, mark NEW_BUILD.
ELSE: extract CURRENT_WORDCOUNT, EXISTING_CONTENT, UNIQUE_CITY_CONTENT.

[GATE_8_COMPETITOR_RESEARCH_AND_DEPTH]
tool: web_search for "{SERVICE} {CITY} {STATE}" Identify top 3-5 commercial competitors (exclude government sites).
For each competitor, estimate: word_count, service_depth (basic|comprehensive), content_quality (low|medium|high).
Calculate COMPETITOR_AVG = sum(word_counts) / count(competitors). If zero competitors found: COMPETITION_LEVEL = LOW, COMPETITOR_AVG = 400, FINAL_TARGET = DESIGN_BIBLE_FLOOR (2,000).
Assess quality and set multiplier: WEAK (avg < 500): 1.5x-2x DECENT (avg 500-1200): 2x-2.5x STRONG (avg > 1200): 2.5x-3x
Calculate: BASE_TARGET = COMPETITOR_AVG × MULTIPLIER
Apply DESIGN_BIBLE_FLOOR and ceilings: DESIGN_BIBLE_FLOOR = 2,000 (minimum viable output with trimmed bibles) LOW ceiling = 2,400 MEDIUM ceiling = 2,800 HIGH ceiling = 3,200 FINAL_TARGET = MAX(MIN(BASE_TARGET, CEILING), DESIGN_BIBLE_FLOOR)
Validate: FINAL_TARGET >= 1.5x COMPETITOR_AVG, FINAL_TARGET <= 3x COMPETITOR_AVG.
Classify competition: LOW: few competitors, weak content, government-only results MEDIUM: 2-3 strong competitors, decent depth HIGH: multiple strong competitors, comprehensive content
Extract keywords: 5 longtail (city+service specific), 5 popular (broader industry).
Store: COMPETITION_LEVEL, FINAL_TARGET, COMPETITOR_AVG_WORDCOUNT, KEYWORDS_LONGTAIL, KEYWORDS_POPULAR.

[GATE_9_PAGE_CLASSIFICATION]
Source: STS_SEO_DATA_2026.xlsx (Pages tab). Lookup PAGE_URL. Extract: CLICKS, IMPRESSIONS, POSITION, CTR.
LIGHT_TOUCH: clicks > 500 OR position ≤ 10 OR impressions > 50000 → preservation 70% REVAMP: clicks 100-500 OR position 11-30 → preservation 50% NEW_BUILD: clicks < 100 OR position > 30 OR page missing → preservation 0%
Store: PAGE_CLASSIFICATION, CONTENT_PRESERVATION_PERCENTAGE, CURRENT_CLICKS, CURRENT_POSITION.

[GATE_10_META_STRATEGY_AND_ROLE_BENEFITS]
Generate meta tags: Title: "{SERVICE} {CITY} {STATE} | {USP} | STS Recycling" — 60-80 chars Description: "Professional {SERVICE} in {CITY}, {STATE}. {benefits}. R2 certified. Call {PHONE}." — 150-160 chars Keywords: best 8 from KEYWORDS_LONGTAIL + KEYWORDS_POPULAR Store META_TITLE, META_DESCRIPTION, META_KEYWORDS for HTML head. Not displayed during execution.
Determine PRIMARY_ROLE from SERVICE: data_destruction → Compliance Officer (benefits: Certificate of Destruction, NAID AAA) hard_drive_shredding → IT Security Manager (benefits: Data Security, NAID AAA) itad → Procurement Manager (benefits: Asset Remarketing, Free Pickup) asset_lifecycle → Facilities Manager (benefits: Free Pickup, Logistics Support)
Select 6 benefits: 2 industry-matched, 2 role-matched, 2 variety. Store SELECTED_BENEFITS.

[GATE_11_CITY_RESEARCH]
Purpose: Generate genuinely unique local content no template can produce.
Step 1: Check HANDOFF_ENTITIES from Gate 4. If populated, use as primary entity source. Step 2: Web search "{CITY} {STATE} major industries business landscape" (one search call). Step 3: From results + handoff data, extract: CITY_UNIQUE_SENTENCES: 2-3 sentences about the city's specific business landscape, industry trends, or geographic significance — facts unique to this city, not generic statements. Example: "Chicago's financial exchange corridor (CME Group, CBOE) creates concentrated compliance pressure for certified data destruction." CITY_INDUSTRY_CONTEXT: Dominant sector discovered. Validates or overrides niche from URL slug. CITY_GEOGRAPHIC_FACTS: Corridors, districts, regional identity beyond GMB data. Step 4: If handoff provided, supplement — don't duplicate handoff data.
Failure handling: If search returns no useful city-specific data, set CITY_UNIQUE_SENTENCES = empty. Gate 12 uses sentence pattern pools as fallback. Log: "Gate 11: no unique city content found."

[GATE_12_HTML_BUILD]
CONFLICT-PRECEDENCE LADDER. When the rules in this gate cannot all be satisfied at once (common on LOW-competition short pages where word ceiling, entity density, mandatory links, and paragraph limits compete), resolve in this fixed order. Do not improvise.
1. NO-INVENTION AND PRESERVATION: Never invent URLs, entities, facts, employee counts, or image paths. Never violate facility language, compliance claims, or certification scope rules from Gate 6. These never yield to any other rule.
2. MANDATORY CITY SPOKE LINKS: If a handoff was provided, 3-4 city spoke links are required (HALT condition). Yields only to rung 1. If satisfying the link count would require inventing a URL, rung 1 wins and the model places only the links that exist in the handoff or allowlist, then proceeds.
3. WORD-COUNT CEILING: The hard ceiling (LOW 2,400 / MED 2,800 / HIGH 3,200) is enforced over density and link-density targets. Yields only to rungs 1 and 2. Trim Optional then Preferred sections to stay under ceiling.
4. ENTITY DENSITY AND LINK TARGETS: The 12+ entity density target and link distribution preferences yield to rungs 1-3. Hit them as fully as the ceiling allows; do not breach the ceiling to reach 12 entities.
5. STYLISTIC AND DISTRIBUTION PREFERENCES: Paragraph spacing, entity spacing (3+ paragraphs apart), pattern rotation. Lowest priority; yield to all above.
When a conflict is resolved by this ladder, note it in the build log: "Conflict resolved: [lower rule] yielded to [higher rule] per precedence ladder."

CRITICAL: MASTER DESIGN BIBLE EXACT USAGE Before any HTML generation:
Extract FULL Master Design Bible CODE using python-docx or equivalent
Read ENTIRE document structure start to finish
Store complete HTML structure in memory — this is the EXACT code template
Verify: complete HTML from <!DOCTYPE> to </html> IF extraction incomplete: HARD STOP — request verification of upload.
MASTER CODE RULES — NEVER MODIFY: CSS (colors, fonts, spacing, animations), layouts (grid-2/3/4), card styling, button styles, mobile breakpoints, hero structure, form placement, location section, HTML structure (divs, sections, classes), any <style> blocks.
MODIFY ONLY: Variable placeholders ({CITY}, {STATE}, {SERVICE}, {PHONE}, etc.), paragraph text content, headlines (H1/H2/H3), image alt tags, anchor text in links, WHICH SECTIONS TO INCLUDE (per section priority below).

SECTION PRIORITY SYSTEM Controls which Design Bible sections appear based on competition level.
REQUIRED (always include): Hero (with form), Equipment showcase (sacred links), Final CTA + Map
PREFERRED (include for MEDIUM and HIGH): Industries/verticals, FAQ, Compliance/NIST block, Service areas + About City
OPTIONAL (include for HIGH only): Stats bar, Specialized services, Liquidation CTA, "Why Choose STS" cards
LOW competition = Required + 2 best Preferred sections for this niche (~2,000-2,400 words) MEDIUM competition = Required + all Preferred (~2,400-2,800 words) HIGH competition = Required + all Preferred + 2-3 Optional (~2,800-3,200 words)
Below DESIGN_BIBLE_FLOOR: exclude optional sections per this priority. Never compress all sections into fewer words.

NICHE CONTENT MATRIX Controls WHICH content blocks appear based on detected niche. Primary uniqueness lever for same-city pages.
HEALTHCARE: Include PHI workflow, BAA block, clinical refresh. Exclude enterprise ITAD, asset recovery ROI. Industries → hospitals, clinics, health systems. Compliance → HIPAA 45 CFR §164.312, BAAs, PHI chain-of-custody.
CORPORATE/ITAD: Include asset recovery ROI, depreciation, lease return. Exclude PHI, clinical. Industries → Fortune 500, enterprise, multi-site. Compliance → SOC 2, ISO 27001, asset tagging.
DATA DESTRUCTION: Include chain-of-custody detail, witnessed destruction, NSA/CSS EPL specs. Exclude asset recovery, liquidation. Compliance block expanded → NIST 800-88 Rev. 1, DoD 5220.22-M, NAID AAA.
GOVERNMENT: Include procurement compliance, multi-building coordination, OMB/FISMA. Exclude asset recovery, liquidation. Industries → state, county, federal, municipal. Compliance → FISMA, OMB A-123.
EDUCATION: Include academic calendar scheduling, FERPA, district purchasing. Exclude data center decom, enterprise-scale. Industries → K-12, university, district. Compliance → FERPA, budget cycles.
FINANCIAL: Include SOX/GLBA block, witnessed destruction for financial records. Exclude PHI, academic. Industries → banks, exchanges, insurance. Compliance → SOX 404, GLBA 16 CFR Part 314.
GENERAL/HUB: Broad industry coverage, all equipment, geographic depth. No single-industry focus. Compliance → overview-level R2v3, NIST, HIPAA.

SENTENCE PATTERN POOLS 7 categories, 29 patterns. Rotate per city. Selection: Hash(CITY) mod N = starting pattern. Advance sequentially for multiple uses on same page — never repeat a pattern on one page.
ENTITY PATTERNS (use 1-2 per page): A: "Organizations like {ENTITY} and {ENTITY_2} rely on STS for {SERVICE}" B: "STS serves {CITY}'s largest employers including {ENTITY}, requiring {CERTIFICATION} compliant disposal" C: "{ENTITY}'s workforce generates significant IT equipment turnover, handled through R2v3 certified processing" D: "From {ENTITY} to {ENTITY_2}, {CITY}'s enterprise sector depends on certified ITAD services" E: "{CITY} organizations including {ENTITY} and {ENTITY_2} require {CERTIFICATION} compliant disposal"
COMPLIANCE PATTERNS (use 1 per page): A: "R2v3 certified processing ensures downstream tracking through final processing" B: "Our R2v3 certification guarantees responsible material handling with documented chain-of-custody" C: "Certified under R2v3 standards, our facility maintains downstream tracking to certified smelters" D: "With R2v3 certification, STS demonstrates commitment to responsible recycling with full documentation"
SERVICE PATTERNS (use 1 per page): A: "Professional ITAD and secure data destruction from our 600,000 sq ft R2v3 certified facility" B: "Comprehensive electronics recycling and IT asset disposition for {CITY} organizations" C: "R2 certified electronics disposal and data destruction serving {CITY} and {COUNTY} County" D: "Secure ITAD services with certified data destruction for {CITY} businesses and institutions"
GEOGRAPHIC PATTERNS (use 1 per page): A: "Serving {CITY}, {NEIGHBOR}, and throughout {COUNTY} County" B: "Free pickup across {CITY} and the greater {COUNTY} area" C: "Covering {CITY}'s {DISTRICT} district, {NEIGHBOR}, and {COUNTY} County" D: "From {LANDMARK} to {NEIGHBOR}, serving all of {COUNTY} County"
CTA PATTERNS (rotate across CTA buttons and callout boxes): A: "Schedule your free pickup today" B: "Request a no-obligation assessment for your {CITY} facility" C: "Get started with a free consultation — same-week scheduling available" D: "Contact our {CITY} team for a customized disposal plan"
HERO SUBTITLE PATTERNS (2-sentence intro under H1, use 1 per page): A: "{CITY} businesses trust STS for certified electronics recycling and data destruction. Free pickup, R2v3 certified processing, and complete audit documentation." B: "R2v3 certified {SERVICE} for {CITY} organizations with same-week scheduling. Comprehensive chain-of-custody and Certificate of Destruction included." C: "Serving {CITY} and {COUNTY} County with enterprise-scale electronics recycling. NIST-compliant data destruction and zero-cost pickup for qualifying volumes." D: "Professional {SERVICE} protecting {CITY} businesses from data liability. Our 600,000 sq ft facility processes equipment with full downstream tracking."
PROCESS INTRO PATTERNS (how "how it works" section opens, use 1 per page): A: "From first call to final certificate, every step is tracked and documented" B: "Our four-step process ensures complete chain-of-custody for {CITY} organizations" C: "Secure, documented, and efficient — here's how {SERVICE} works with STS" D: "Built for enterprise compliance requirements from pickup through final disposition"

FAQ POOL SYSTEM Select 4-6 questions per page: 2-3 from UNIVERSAL + 2-3 matching detected NICHE. Write answers at 35-45 words (SEO Audit reshapes into 40-60 word GEO answer blocks).
UNIVERSAL (pick 2-3):
What certifications do you hold?
What areas do you serve?
How long does pickup take?
Do you provide audit documentation?
Is pickup really free?
What happens to my equipment after pickup?
HEALTHCARE (pick 2 if niche=healthcare):
Is your data destruction HIPAA compliant?
Do you provide Business Associate Agreements?
Can you schedule around patient care hours?
How do you handle PHI on mobile devices?
CORPORATE (pick 2 if niche=corporate/itad):
Can you handle large-scale ITAD projects?
Do you integrate with asset management systems?
What's your data center decommissioning process?
How do you handle multi-site coordination?
GOVERNMENT (pick 2 if niche=government):
Do you meet federal procurement requirements?
How do you handle classified media?
Can you provide GSA schedule pricing?
EDUCATION (pick 2 if niche=education):
Do you work with school district purchasing?
Can you schedule around academic calendars?
How do you handle student data (FERPA)?
FINANCIAL (pick 2 if niche=financial):
How do you meet SOX/GLBA requirements?
Can you provide witnessed destruction for financial records?

SOFT PARAGRAPH SYSTEM Write 5-8 generic/qualitative paragraphs the SEO Audit replaces with verified specifics.
CRITICAL TAG FORMAT — use EXACTLY this HTML structure for every soft paragraph:
<!-- AUDIT_TARGET -->
<p>Generic paragraph text here.</p>

Do NOT use <!-- SOFT PARAGRAPH #1 -->, <!-- SOFT TARGET -->, or any other format. The Audit scans for the exact string <!-- AUDIT_TARGET -->. Any variation = invisible to the Audit.
LOCATIONS: Services intro, 2-3 industry card descriptions, About City, 1-2 FAQ answers, feature block descriptions. Only tag paragraphs that actually exist in the built page — if the template has no About City section, do not list about_city in metadata soft_targets.
EXAMPLES OF CORRECT OUTPUT:
<!-- AUDIT_TARGET --> <p>Trusted by leading Chicago corporations and healthcare systems for certified electronics disposal.</p> <!-- AUDIT_TARGET --> <p>Data breaches involving improperly disposed hardware remain a significant risk for regulated industries.</p>
Soft paragraphs must read as complete, professional sentences. If the SEO Audit never runs, the page must still be publishable.

SINGLE-MENTION COMPLIANCE Each certification gets ONE full explanation in its primary section. Every subsequent mention is a micro-reference only.
R2v3 — Full (once, in compliance section): "R2v3 certification ensures downstream tracking through final processing with certified smelter documentation and third-party auditing" R2v3 — Micro (everywhere else): "R2v3 certified processing" or "R2v3 certified"
NIST 800-88 — Full (once, in NIST/compliance section): Include standard number, purge-level requirements, destruction methods NIST 800-88 — Micro (everywhere else): "NIST 800-88 compliant" or "NIST-certified destruction"
HIPAA — Full (once, in healthcare or compliance section): Include CFR reference, PHI requirements, BAA mention HIPAA — Micro (everywhere else): "HIPAA-compliant disposal" or "HIPAA certified"
Never repeat the full explanation. Savings: ~150-250 words of redundant compliance text.

ENTITY PLACEMENT RULES 4-5 entity names MAX. NO employee counts (Audit verifies and adds those). If HANDOFF_ENTITIES available: use those names as primary source. If no handoff: use entities discovered in Gate 11 city research. If Gate 11 found zero entities: set entities_placed to 0 in metadata. Do NOT claim entities that don't exist in the HTML. Write entity mentions as soft paragraphs where possible (tagged <!-- AUDIT_TARGET -->). Space entities 3+ paragraphs apart. Max 1 entity per paragraph, max 2 per section. VERIFICATION: Before writing metadata, count actual named organizations in the HTML body. The entities_placed number MUST match the real count. Generic phrases like "Chicago businesses" or "leading corporations" are NOT entities. Audit adds 2-3 more entities with verified employee counts. Total after Audit: 6-8 with precision.

ENTITY DENSITY TARGET (GEO-16 framework alignment). Beyond the 4-5 named-organization cap above, each page should reach 12+ distinct entities total when counting across all four categories combined:
1. Named organizations: 4-5 max per the rule above (e.g., Chicago Bulls, Northwestern Memorial Hospital, JPMorgan Chase)
2. Regulatory entities: standards bodies and CFR references named in the page (e.g., NIST 800-88, R2v3 standard, NAID AAA standard, plus niche-specific such as HIPAA 45 CFR §164.312, SOX 404, GLBA 16 CFR Part 314, FERPA, FISMA). Typically 3-5 per page based on niche.
3. Geographic entities: distinct named places (CITY, COUNTY name, individual NEIGHBORHOODS items from GMB, LANDMARK). Typically 4-6 per page.
4. Certifications and standards: certifications STS holds or the page references (e.g., R2v3 certification, NAID AAA certification, ISO 14001, EPA compliance, DoD 5220.22-M). Typically 3-4 per page.

The 12+ threshold aligns with the GEO-16 framework research (Kumar et al, Sept 2025): pages with 12+ pillar entities achieve ~78% cross-engine citation rate. Generic phrases like "Chicago businesses," "leading corporations," "regulated industries," or "compliant facilities" do NOT count toward any category. The Audit verifies and adds organizational employee counts; this Builder-level target ensures the page front-loads enough distinct entities before the Audit runs.

METADATA HANDOFF COMMENT Embed at TOP of HTML output, immediately after <!DOCTYPE html>:
<!-- PAGE_BUILDER_V3 bible: A|B competition: LOW|MEDIUM|HIGH niche: healthcare|corporate|government|education|financial|general word_count: [number] entities_placed: [count] soft_targets: [pipe-delimited location IDs, e.g. services_intro|industry_card_1|about_city|faq_3] faqs_selected: [pipe-delimited short IDs, e.g. cert|areas|pickup|hipaa_compliant|baa] sections_included: [pipe-delimited, e.g. hero|equipment|industries|faq|compliance|service_areas|cta] sections_excluded: [pipe-delimited, e.g. stats_bar|liquidation|specialized] -->
Field names are locked. Do not rename — SEO Audit v10.10 Phase 0C parses these exact field names. The block tag PAGE_BUILDER_V3 is also locked and must remain literally PAGE_BUILDER_V3 regardless of prompt version. Format: always use a space after colons (e.g., bible: A not bible:A). Consistent whitespace prevents parser edge cases.

INTERNAL LINK PLACEMENT
STEP 1 — CITY SPOKE LINKS (MANDATORY if handoff provided): If handoff document was loaded in Gate 4: REQUIRED: Add 3-4 city-specific spoke page links in body content (paragraphs 4+, NOT hero). Source: Tier 1-2 pages from handoff document (hub + core services first). Anchor text: contextual, descriptive (e.g., "Chicago data destruction", "electronics recycling in Chicago", "hard drive shredding services"). Placement: luxury intro, services intro, service tab content, why choose section. Format: absolute URLs from handoff (e.g., https://www.stselectronicrecyclinginc.com/chicago-data-destruction). CHECKPOINT: Count city spoke links placed. If handoff was provided but zero city spoke links exist in body → HALT. Target: 3-4.
STEP 2 — INDUSTRY VERTICAL (Tier 3 priority, max 1 per page): Only after Step 1 links are placed. Only when link budget allows: healthcare → /industries-we-serve/industries-1/healthcare-electronic-recycling education → /industries-we-serve/industries-1/school-university-and-education-electronics-recycling-and-itad corporate/itad → /industries-we-serve/industries-3/call-center-electronics-recycling-and-itad financial → /industries-we-serve/industries-4/banking-and-financial-industry-electronics-recycling-and-itad government → /industries-we-serve/industries-4/federal-state-and-local-government-electronics-recycling-and-itad general (hub) → no industry vertical link Link only when niche matches. Counts toward 3-4 body link budget.
STEP 3 — NO HANDOFF FALLBACK: If no handoff document: use corporate links from APPROVED_URL_ALLOWLIST only. Do NOT invent city spoke URLs.
NOTE: Sacred equipment links (in equipment showcase section) are separate from body content links and do NOT count toward the 3-4 body link budget.

SACRED LINKS Canonical 10 equipment categories — all must be present with absolute URLs:
Computer Recycling: https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/317-computer-recycling
Laptop Recycling: https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/318-laptop-recycling
Cell Phone Recycling: https://www.stselectronicrecyclinginc.com/iphone-smartphone-and-cell-phone-recycling (alternate: /97-recyclable-electronics/319-cell-phone-recycling — both valid)
Networking Equipment: https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/320-networking-equipment-recycling
Printer Recycling: https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/321-printer-recycling
Copy Machine Recycling: https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/322-copy-machine-recycling
Server Equipment: https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/323-server-equipment-recycling
Ink and Toner: https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/324-ink-and-toner-recycling
Monitor Recycling: https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/325-monitor-recycling
Old Electronics: https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/326-old-electronics-recycling
Contact link (tracked separately, not counted in sacred 10): https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE

IMAGE REQUIREMENTS All img src values must be full absolute HTTPS URLs starting with https://www.stselectronicrecyclinginc.com/. NEVER use root-relative paths (/images/...). Joomla silently fails on root-relative img src, rendering alt text as broken text instead of the image. Use the exact URLs below verbatim. Do not guess or alter the path or suffix; each image has been verified live on the server.

Verified image library (Joomla media manager ground truth, 2026-06-05):
Hero (both bibles, lazy: false): https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg
laptop: https://www.stselectronicrecyclinginc.com/images/2017/compressed/laptop-1742462_1920.jpg
data: https://www.stselectronicrecyclinginc.com/images/2017/compressed/data-3181149_1920.jpg
castle: https://www.stselectronicrecyclinginc.com/images/2017/compressed/castle-3181153_1920.jpg
datacenter: https://www.stselectronicrecyclinginc.com/images/2017/compressed/datacenter-286386_1280.jpg  (EXCEPTION: _1280 suffix, NOT _1920. Only the _1280 size exists.)
desk: https://www.stselectronicrecyclinginc.com/images/2017/desk-4308230.jpg  (EXCEPTION: located at /images/2017/ root, NOT in /compressed/. No size suffix.)

Bible A content images (lazy: true): laptop, data, datacenter
Bible B content images (lazy: true): laptop, data, castle, desk
Alt format: "{CITY} {service_context} {description}" — max 125 chars.

HARD RULE. Never construct an image URL by combining basename, suffix, and folder. The Verified image library above is the complete set of allowed img src values. If a build requires an image not listed there, HALT with message: IMAGE_NOT_VERIFIED: [basename]. Do not invent, guess, or normalize paths. To add a new image to the library, verify the exact path against the Joomla media manager first, then append the verified URL to this section.

FORM REQUIREMENTS Location: hero section. Code: '<h3>Get A Free Quote</h3>{loadposition city-hero-form}' {loadposition city-hero-form} loads Joomla contact form module.
META TAGS IN HEAD Required in <head>: <title>{META_TITLE}</title>, <meta name="description">, <meta name="keywords">
ATTRIBUTION (mandatory, every page): After <meta charset> and before <title>, add:
<!-- SEO architecture by Mark Domnenko | AI-Powered SEO & Marketing Automation -->
Alongside meta description/keywords, add: <meta name="author" content="Mark Domnenko"> No visible text. No footer. No URLs. Head section only.

WORD COUNT TARGET Target: FINAL_TARGET from Gate 8. Tolerance: ±200 words. Method: Add/remove entire SECTIONS per section priority system. Never stuff paragraphs beyond paragraph limits. If over ceiling: remove Optional sections first, then trim Preferred sections.

CITY_UNIQUE_SENTENCES PLACEMENT If Gate 11 produced CITY_UNIQUE_SENTENCES: place in About City section and/or services intro area. These are the highest-uniqueness content on the page — position them where they have maximum SEO value. If Gate 11 returned empty, rely on sentence pattern pools and entity variation for differentiation.

CONTENT WRITING EXECUTION ORDER FOR GATE 12: Step 0: Classification-aware build mode: IF PAGE_CLASSIFICATION = LIGHT_TOUCH: Fetch existing page via web_fetch. Preserve: hero content, entity mentions, FAQ answers, compliance blocks, geographic references. Apply Design Bible CSS/structure around preserved content. Modify only: outdated info, broken links, facility language violations. Soft targets: tag 3-5 existing generic paragraphs (fewer than NEW_BUILD). IF PAGE_CLASSIFICATION = REVAMP: Fetch existing page. Preserve 50% — keep strongest sections, rebuild weak ones. Full soft target system (5-8 tags). IF PAGE_CLASSIFICATION = NEW_BUILD: Fresh build from Design Bible. Full system (5-8 soft targets, all pattern pools, full niche matrix). Step A: Determine sections to include (section priority + competition level) Step B: Apply niche content matrix (include/exclude/modify decisions) Step C: Select sentence patterns (hash-based rotation) Step D: Select FAQ questions (universal + niche-matched) Step E: Write all content using patterns, placing 5-8 soft paragraphs with <!-- AUDIT_TARGET --> tags Step E.1: Count <!-- AUDIT_TARGET --> tags. If fewer than 5: identify additional generic paragraphs that can be tagged. Minimum 5 required. Step F: Apply single-mention compliance (one full explanation, rest micro-references) Step G: Place entities (4-5 names, no counts, spaced 3+ paragraphs apart) Step H: Place internal links — MANDATORY if handoff provided. Add 3-4 city spoke links in body (Step 1), then industry vertical if budget allows (Step 2). Verify: if handoff exists, count city spoke links ≥ 3 before proceeding. Step I: Place CITY_UNIQUE_SENTENCES in high-value locations Step J: Embed PAGE_BUILDER_V3 metadata comment Step K: Validate against all rules before output — including the Gate 6 COMPLIANCE CLAIMS LANGUAGE and CERTIFICATION SCOPE rules
Output: final-html.html

[GATE_13_TECHNICAL_QUALITY]
STANDARD 1 — JOOMLA CSS: Add background:transparent!important to section-header, section-title, section-subtitle, badge classes. Prevents Joomla white background on dark sections.
STANDARD 2 — EMAIL VALIDATION: Preserve mailto:, CloudFlare /cdn-cgi/l/email-protection#, obfuscated formats exactly as found. Fix only broken tag syntax. Required: 3+ clean mailto:recycle@stsrecycle.com in body output. If found: /cdn-cgi/, cf_email, data-cfemail, [email protected] → halt with error.
STANDARD 3 — MODULE POSITIONS: Never use padding-bottom aspect ratio with {loadposition}. Use min-height with transparent background.
STANDARD 4 — WORD COUNT CEILING: LOW: max 2,400. MEDIUM: max 2,800. HIGH: max 3,200. If exceeds: trim Optional sections first, then Preferred sections per section priority.
STANDARD 5 — PARAGRAPH LIMITS: Hero intro: max 30 words, 2 sentences Service descriptions: max 40 words, 3 sentences Industry benefits: max 25 words, 2 sentences (Audit adds entities) FAQ answers: 35-45 words, 2 sentences (SEO Audit creates 40-60 word answer blocks) About City: max 45 words (Audit adds geography) Any other paragraph: max 50 words, 3 sentences Sentence max: 22 words
STANDARD 6 — WORD ACHIEVEMENT METHODS: Correct: Add new H3 subsections, visual card grids, Q&A pairs, process timelines, structured lists. Prohibited: Stuffing existing paragraphs beyond limits, run-on sentences, cramming multiple ideas into single paragraphs.
STANDARD 7 — ENTITY LIMITS: Max per paragraph: 1. Max per section: 2. Total: 4-5 entity names, NO employee counts. Distribution: space across multiple sections. Audit adds verified counts.
STANDARD 8 — PHONE LINKING: Every phone in body text must be <a href="tel:...">. Minimum 2 tel links in body.
STANDARD 9 — FILE COMPLETENESS: Validate: starts with <!DOCTYPE html>, contains <html lang="en">, contains <body>, ends with </body></html>. Opening divs == closing divs (balanced).
STANDARD 10 — BUTTON CONTRAST: Prohibited: white text on white/light backgrounds. Required: contrast ratio ≥ 4.5:1.
STANDARD 11 — IMAGE PATHS: All img src must be full absolute HTTPS URLs starting with https://www.stselectronicrecyclinginc.com/. NEVER root-relative (/images/...) — Joomla silently fails on those. Use the exact verified URLs from Gate 12 IMAGE REQUIREMENTS. Bible A content: laptop-1742462_1920.jpg, data-3181149_1920.jpg, datacenter-286386_1280.jpg. Bible B content: laptop-1742462_1920.jpg, data-3181149_1920.jpg, castle-3181153_1920.jpg, desk-4308230.jpg. Hero (both): mac-2585220_1920.jpg. PATH EXCEPTIONS, do not normalize: datacenter-286386 uses _1280 suffix (not _1920); desk-4308230 lives at /images/2017/ root (not /compressed/) and has no size suffix.
STANDARD 12 — OUTPUT VALIDATION: Before delivery, verify ALL. Do not proceed until every item passes: ☐ Complete HTML <!DOCTYPE> to </html>, all divs balanced ☐ Meta tags + canonical in <head> ☐ {loadposition city-hero-form} in hero ☐ Sacred equipment: 10/10 with absolute URLs (count them: computer, laptop, cell phone, networking, printer, copy machine, server, ink/toner, monitor, old electronics) ☐ Tel links: 2+ in body | Email links: 3+ clean mailto ☐ No facility language violations | No paper shredding references | Facility = 600,000 sq ft
☐ No em dashes (literal — character) or &mdash; entities anywhere in HTML body output (body paragraphs, headlines, FAQ answers, CTA copy, image alt). Em dashes in prompt comments or in metadata handoff are not body output and do not violate.
☐ Entity density: count distinct entities across named organizations (4-5), regulatory entities (standards/CFRs), geographic entities (CITY/COUNTY/NEIGHBORHOODS/LANDMARK), and certifications. Target: 12+ distinct entities total. Generic phrases like "Chicago businesses" do not count. ☐ Compliance claims: no "guarantees compliance", "ensures compliance", or "meets all requirements" phrasing. Compliance is described as supported, not guaranteed. ☐ Certification scope: NAID AAA appears only in data destruction context, R2v3 only in recycling context, NIST 800-88 never stated as a held certification. No conflated cert claims. ☐ Word count within target range (LOW≤2400, MED≤2800, HIGH≤3200) ☐ PAGE_BUILDER_V3 metadata comment present after <!DOCTYPE html> ☐ CSS unchanged from Design Bible | Correct image set for bible | All img src are full absolute HTTPS URLs starting with https://www.stselectronicrecyclinginc.com/ (NEVER root-relative /images/...) | Path exceptions respected: datacenter-286386 uses _1280 suffix, desk-4308230 lives at /images/2017/ root without /compressed/ ☐ Soft targets: Count <!-- AUDIT_TARGET --> tags in HTML body. Must be 5+ (3+ for LIGHT_TOUCH). Must use EXACT string <!-- AUDIT_TARGET -->, not variations. ☐ Soft targets metadata list must match actual tags — every ID in metadata must correspond to a real section in the HTML ☐ Entity count: Count actual named organizations in HTML body. The entities_placed metadata number must equal this count. Zero is valid if Gate 11 found nothing. ☐ Single-mention compliance: Each certification has exactly 1 full explanation. Search for NIST, R2v3, HIPAA — verify no duplicate full explanations. ☐ City research: If Gate 11 produced CITY_UNIQUE_SENTENCES, verify they appear in the HTML. If empty, note in build log.
On fail: halt and fix.

[GATE_14_COMMERCIAL_INTENT]
Conditional — only if PAGE_TYPE = SPOKE.
Reference NICHE_CONTENT_MATRIX for section decisions. Then apply:
OPTIMIZATION 1 — HERO STRUCTURE: "Facing {PAIN_POINT}? {CITY} organizations requiring {NEED} choose STS for {SOLUTION}. {TIMELINE}. {CREDENTIAL}."
OPTIMIZATION 2 — CREDENTIAL CLUSTERING: Grid-4 credential cards. Required: R2v3, NAID AAA, ISO, service-specific.
OPTIMIZATION 3 — TIMELINE SPECIFICITY: "Fast service" → "Same-week pickup". "Quick turnaround" → "Certificate within 48 hours".
OPTIMIZATION 4 — EQUIPMENT DETAILS: "1/4 inch particle size reduction", "NSA-approved degaussers", "DoD 5220.22-M compliant"
OPTIMIZATION 5 — INDUSTRY SCENARIOS: Role-specific: healthcare "HIPAA audit preparation", finance "SOX compliance requirements"
OPTIMIZATION 6 — PRICING TRANSPARENCY: "Complimentary pickup for qualifying volumes", "No hidden fees", "Volume discounts available", "Asset recovery credits offset costs"
OPTIMIZATION 7 — SERVICE-SPECIFIC CTAs: data_destruction → "Schedule Secure Pickup" hard_drive_shredding → "Schedule Witnessed Shredding" itad → "Request Asset Valuation"
HUB pages: skip commercial intent optimization.

[FINAL_DELIVERY]
Output final-html.html to /mnt/user-data/outputs/ Present file to user.
Display: ✅ {CITY} complete. File ready. 📄 final-html.html [Download link]
NEXT STEP: Run SEO Audit
Start new Claude session
Upload Master_SEO_Audit_v10.10 (match your file format — .docx or .md)
Upload final-html.html (from above)
Upload {city}_handoff.md (if available) SEO Audit will analyze HTML, create research brief, optimize for maximum SEO + GEO, validate all links/emails, and deliver optimized HTML for Joomla deployment.
[END]


```

### Fixture — master-schema-generator.txt

`scripts/src/bakeoff/fixtures/master-schema-generator.txt` — 34,352 chars

```text
# MASTER SCHEMA GENERATOR v1.4.1 PRODUCTION

<SCHEMA_GENERATOR>
<VERSION>1.4.1_PRODUCTION_2026</VERSION>
<OUTPUT>Production-ready JSON-LD with AI answer engine optimization</OUTPUT>

<CORE_MISSION>
Generate enterprise-grade JSON-LD schema for city landing pages AND national service pages.
Runs AFTER SEO audit has optimized HTML content.

Input: research-brief.json + HTML source (artifact/URL/user)
Output: schema.txt file + meta data in chat boxes

Page types: HUB (facility) | SPOKE (service area) | NATIONAL (vertical service)
Schema objects: WebSite, Business, HowTo, FAQPage, BreadcrumbList, WebPage
</CORE_MISSION>

<ABSOLUTE_RULES>
1. CID format: identifier: "cid:XXXXXXXXXXXXXXXXX" — ALWAYS
2. NEVER use gMapsUrl — use hasMap and sameAs with ?cid= URLs
3. NEVER invent ratings, coordinates, or neighborhoods — use from brief/HTML or omit
4. ENTITY-RICH service descriptions — verified entities from brief, NEVER competitors
5. ALL URLs must be real — no placeholders or invented links
6. HUB = full address | SPOKE = city only | NATIONAL = addressCountry US only
7. NEVER use @type: "Service" as primary business type — LocalBusiness only
8. ALL services MUST have unique @id anchors and areaServed
9. ALL breadcrumb items MUST have "item" field
10. NO competitor mentions ANYWHERE — services, FAQs, HowTo, descriptions
11. NO individual reviews — aggregateRating only (Google TOS)
12. Schema FAQs do NOT need to match visible page FAQs — extra schema FAQs target additional featured snippets
</ABSOLUTE_RULES>

<GLOBAL_CONFIGURATION>

<SOCIAL_PROFILES>
FACEBOOK: https://www.facebook.com/STSRecycle/
LINKEDIN: https://www.linkedin.com/company/sts-electronic-recycling-inc./
</SOCIAL_PROFILES>

<STANDARD_URLS>
SITE_BASE: https://www.stselectronicrecyclinginc.com
QUOTE_FORM: https://www.stselectronicrecyclinginc.com/quote
LOGO_IMAGE: https://www.stselectronicrecyclinginc.com/images/sts-logo.png
HERO_IMAGE: https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg
CERTIFICATE_PAGE: https://www.stselectronicrecyclinginc.com/certificate-of-destruction-services
SERVICES_PAGE: https://www.stselectronicrecyclinginc.com/services
</STANDARD_URLS>

<HQ_FACILITY>
NAME: STS Electronic Recycling, Inc.
STREET: 1653 N Bolton Street
CITY: Jacksonville
STATE: TX
ZIP: 75766
COUNTRY: US
SIZE: 600,000 sq ft
HQ_CID_NUMERIC: 2633689675265688157
HQ_CID_NORMALIZED: cid:2633689675265688157
</HQ_FACILITY>

<CERTIFICATIONS>
1. R2v3 Certification — Responsible Recycling
2. NAID AAA Certification — Data Destruction
</CERTIFICATIONS>

<DEFAULT_KNOWSABOUT>
Use for CITY pages (HUB/SPOKE). For NATIONAL pages, generate niche-specific terms from HTML content instead.

Default 12: Electronics Recycling, Computer Recycling, ITAD Services, Data Destruction, Hard Drive Shredding, Asset Remarketing, HIPAA Compliance, R2 Certification, Secure Data Sanitization, IT Asset Disposition, E-Waste Management, Corporate Electronics Disposal
</DEFAULT_KNOWSABOUT>

<ADDITIONAL_TYPES>
https://www.wikidata.org/wiki/Q115196938
WasteManagementService
ITAssetDispositionProvider
DataDestructionService
</ADDITIONAL_TYPES>

<CFR_REFERENCE_TABLE>
Healthcare: "HIPAA and HITECH" / "45 CFR §164.312" / "45 CFR §164.310"
Financial: "GLBA and Gramm-Leach-Bliley Act" / "16 CFR Part 314"
Government: "NIST 800-88" / "NIST SP 800-88 Rev. 1"
Education: "FERPA" / "20 U.S.C. §1232g"
Default: "data security regulations"

PLACEMENT RULE: CFR citations go on 4-8 contextually relevant services (data destruction, certificates, healthcare/finance/govt ITAD, compliance services). NOT on all 20 — that triggers spam signals. General services (computer recycling, monitor recycling, secure transport) describe the service on its own merits without forced citations.
</CFR_REFERENCE_TABLE>

<SERVICE_RADIUS>
HUB: 75 mi / 120700.8 meters
SPOKE: 50 mi / 80467.2 meters
NATIONAL: 0 (nationwide)
</SERVICE_RADIUS>

<COMPETITOR_EXCLUSION>
NEVER mention these companies or use comparative language ("better than", "unlike", "compared to", "#1", "top-rated") ANYWHERE in schema output — services, FAQs, HowTo, descriptions:

ERI, Electronic Recyclers International, Sims Lifecycle Services, Sims Recycling, CompuCycle, Dynamic Lifecycle Innovations, All Green Electronics Recycling
</COMPETITOR_EXCLUSION>

<CREATOR_ATTRIBUTION>
Schema and page optimization by:
NAME: Mark Domnenko
TITLE: AI Strategy & Growth Specialist
LINKEDIN: https://www.linkedin.com/in/markdomnenko (use as sameAs, not url)

WHERE EACH LAYER LIVES:
1. Schema Generator (this prompt): "creator" Person entity on WebPage object inside JSON-LD — includes jobTitle, sameAs, and knowsAbout (8 expertise terms). WebPage is positioned LAST in the @graph array to bury attribution deep in the schema output.
2. Blog SEO Audit + Page Builder (other prompts): HTML comment and meta author tag in page HTML

This prompt ONLY handles layer 1. The JSON-LD creator entity is the primary AI engine signal — parsed by Google AI Overviews, Perplexity, ChatGPT, and Bing Copilot across 2,000+ pages.
</CREATOR_ATTRIBUTION>

</GLOBAL_CONFIGURATION>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- PHASE 0: PREFLIGHT VERIFICATION                            -->
<!-- ═══════════════════════════════════════════════════════════ -->

<PHASE_0>
<EXECUTION>ALWAYS FIRST — Complete all steps before any schema construction</EXECUTION>

<STEP_0A_HTML_SOURCE>
Detect HTML source in priority order:

1. ARTIFACT: If HTML artifact exists in conversation → extract, store as HTML_CONTENT
2. URL FETCH: If research-brief.json has PAGE_URL → web_fetch the page, store as HTML_CONTENT
3. ASK USER: 🔴 HARD STOP — "I need the HTML content. Please provide as artifact, URL, or paste."

VALIDATE: Contains HTML tags, length > 500 chars, contains text content.
IF invalid → HALT: "HTML content appears invalid."
</STEP_0A_HTML_SOURCE>

<STEP_0B_RESEARCH_BRIEF>
Load research-brief.json. IF missing → HALT: "Research brief required. Run SEO Audit first."

REQUIRED KEYS (halt if missing):
- For city pages: CITY, STATE, COUNTY, SERVICE, PAGE_URL, PAGE_TYPE, META_TITLE, META_DESCRIPTION, META_KEYWORDS
- For national pages: SERVICE, PAGE_URL, PAGE_TYPE, META_TITLE, META_DESCRIPTION, META_KEYWORDS
- GMB_URL: Required for HUB/SPOKE, optional for NATIONAL

HIGH PRIORITY (warn if missing): VERIFIED_ENTITIES, NEIGHBOR_CITIES (city only), NICHE, PERSONA, PHONE, EMAIL

OPTIONAL: LATITUDE, LONGITUDE, RATING_VALUE, REVIEW_COUNT, HOURS_OF_OPERATION, ADDRESS, LANDMARK, MAJOR_HIGHWAY
</STEP_0B_RESEARCH_BRIEF>

<STEP_0C_CID_EXTRACTION>

IF PAGE_TYPE = "NATIONAL" AND no GMB_URL provided:
  Use HQ defaults: CID_NUMERIC = {HQ_CID_NUMERIC}, CID_NORMALIZED = {HQ_CID_NORMALIZED}
  CID_AVAILABLE = TRUE
  Log: "✓ Using HQ CID for national page"
  Proceed to Step 0D (still requires user verification)

IF GMB_URL contains "maps.app.goo.gl" or "goo.gl":
  🔴 HARD STOP: "Shortened URL detected. Please open in browser and paste the full URL."
  Wait for full URL.

IF GMB_URL contains "google.com/maps/place/":
  Extract CID:
  1. Find pattern: !1s0x[a-f0-9]+:0x[a-f0-9]+
  2. Take hex value after :0x
  3. Convert hex → decimal
  4. CID_NORMALIZED = "cid:{decimal}"
  5. CID_NUMERIC = "{decimal}"
  6. CID_AVAILABLE = TRUE
  7. Extract coordinates if present: !3d{lat}!4d{lng}
  8. Extract business name if present: /place/{name}/@

  VALIDATE: CID_NUMERIC is 15-20 digits, contains only numbers.
  IF fails → HALT: "CID extraction failed. Provide CID manually as cid:XXXXXXXXXX"
</STEP_0C_CID_EXTRACTION>

<STEP_0D_CID_VERIFICATION>
🔴 HARD STOP — USER MUST VERIFY

Display:
═══════════════════════════════════════════
🔴 VERIFY GOOGLE MY BUSINESS LOCATION
═══════════════════════════════════════════
CID: {CID_NORMALIZED}
Maps Link: https://www.google.com/maps?cid={CID_NUMERIC}
{IF extracted: Business Name: {name}, Coordinates: {lat}, {lng}}

Click the link and verify it opens the CORRECT location.
Type YES to confirm or NO if wrong.
═══════════════════════════════════════════

Accepted: YES, APPROVED, CORRECT, VERIFIED, CONFIRM, LOOKS GOOD
Rejected: NO, WRONG, INCORRECT → HALT, ask for correct GMB URL, return to 0C
Unclear: Ask again clearly.
</STEP_0D_CID_VERIFICATION>

<STEP_0E_PAGE_TYPE_CONFIG>
Set all downstream variables based on PAGE_TYPE:

HUB:
  ADDRESS_STRATEGY = FULL_ADDRESS
  SCHEMA_PRIMARY_TYPE = ["RecyclingCenter", "LocalBusiness"]
  SERVICE_RADIUS = 75mi / 120700.8m
  AREASERVED_SCOPE = CITY_REGION
  FAQ_TYPE = CITY | FAQ_COUNT = 8
  SERVICE_CATALOG = DEFAULT_20
  KNOWSABOUT_MODE = DEFAULT_LIBRARY
  BREADCRUMB_L2 = {name: "Services", url: SERVICES_PAGE}

SPOKE:
  ADDRESS_STRATEGY = CITY_ONLY
  SCHEMA_PRIMARY_TYPE = ["LocalBusiness"]
  SCHEMA_ADDITIONAL_TYPE includes "RecyclingCenter"
  SERVICE_RADIUS = 50mi / 80467.2m
  AREASERVED_SCOPE = CITY_REGION
  FAQ_TYPE = CITY | FAQ_COUNT = 8
  SERVICE_CATALOG = DEFAULT_20
  KNOWSABOUT_MODE = DEFAULT_LIBRARY
  BREADCRUMB_L2 = {name: "Services", url: SERVICES_PAGE}

NATIONAL:
  ADDRESS_STRATEGY = COUNTRY_ONLY
  SCHEMA_PRIMARY_TYPE = ["LocalBusiness"]
  SCHEMA_ADDITIONAL_TYPE includes "RecyclingCenter"
  SERVICE_RADIUS = 0 (nationwide)
  AREASERVED_SCOPE = COUNTRY
  FAQ_TYPE = NATIONAL | FAQ_COUNT = 8-12
  SERVICE_CATALOG = NICHE_GENERATED
  KNOWSABOUT_MODE = NICHE_FROM_HTML
  BREADCRUMB_L2 = {name: "Services", url: SERVICES_PAGE}

IF PAGE_TYPE missing → default SPOKE.

SCHEMA TYPE TRAP: If any config attempts @type: "Service" as primary → HALT immediately. "Service" is ONLY valid nested inside hasOfferCatalog.
</STEP_0E_PAGE_TYPE_CONFIG>

<STEP_0F_PHONE_NORMALIZATION>
Extract digits from PHONE. Always use brief's PHONE value, never extract from HTML.

10 digits → +1-{area}-{prefix}-{line} / +1{10digits}
11 digits starting with 1 → same format
Otherwise → PHONE_AVAILABLE = FALSE, omit from schema.
</STEP_0F_PHONE_NORMALIZATION>

<STEP_0G_COORDINATE_VALIDATION>
Priority: GMB extracted > brief > omit
Validate: Lat [-90,+90], Lng [-180,+180], 4+ decimals, NOT 0,0 (null island check)
IF NATIONAL → COORDINATES_AVAILABLE = FALSE (omit by design)
</STEP_0G_COORDINATE_VALIDATION>

<STEP_0H_RATING_VALIDATION>
IF brief has RATING_VALUE (1.0-5.0 numeric) AND REVIEW_COUNT (positive integer):
  INCLUDE_AGGREGATE_RATING = TRUE
ELSE: INCLUDE_AGGREGATE_RATING = FALSE

Individual reviews: ALWAYS OMITTED (Google TOS — copying reviews violates policy)
</STEP_0H_RATING_VALIDATION>

<STEP_0I_ENTITY_CLASSIFICATION>
FOR EACH entity in VERIFIED_ENTITIES:
  IF matches COMPETITOR_EXCLUSION list OR type = "electronics_recycling_company" → EXCLUDE
  ELSE → add to SAFE_ENTITIES

IF SAFE_ENTITIES = 0: Use category-based descriptions ("healthcare organizations", "financial institutions") instead of named entities. Do NOT halt.
IF SAFE_ENTITIES < 10: Warn, proceed with available entities + generic fill.
IF SAFE_ENTITIES >= 20: Excellent — distribute across services with minimal repeats.
</STEP_0I_ENTITY_CLASSIFICATION>

<STEP_0J_NEIGHBORHOOD_EXTRACTION>
IF NATIONAL → skip entirely.

Scan HTML_CONTENT for explicit area references: "[Name] neighborhood", "[Name] district", "serving [Place]", "near [Place]", "in the [Place] area"

Sources: HTML content > brief LANDMARK > brief neighborhoods
NEVER invent. NEVER guess. Empty array is acceptable.
Target: 6-12 areaServed entries. 6 accurate > 12 fabricated.
</STEP_0J_NEIGHBORHOOD_EXTRACTION>

<STEP_0K_CONFLICT_DETECTION>
Scan HTML for existing <script type="application/ld+json">, itemscope, RDFa.
IF found → warn user: "Existing schema detected. New schema will REPLACE it. Continue?"
IF no → proceed.
</STEP_0K_CONFLICT_DETECTION>

<STEP_0L_PREFLIGHT_SUMMARY>
Display:
═══════════════════════════════════════════
✅ PREFLIGHT COMPLETE
═══════════════════════════════════════════
Page Type: {HUB/SPOKE/NATIONAL}
Location: {CITY, STATE / NATIONAL}
Service: {SERVICE}
CID: {CID_NORMALIZED} ✅ USER VERIFIED
Address: {FULL/CITY_ONLY/COUNTRY_ONLY}
Coordinates: {✓/⊘} | Phone: {✓/⊘} | Rating: {✓/⊘}
Entities: {count} safe | Neighborhoods: {count}
═══════════════════════════════════════════
Proceeding to schema construction...
</STEP_0L_PREFLIGHT_SUMMARY>

</PHASE_0>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- PHASE 1: SCHEMA CONSTRUCTION                               -->
<!-- ═══════════════════════════════════════════════════════════ -->

<PHASE_1>
<EXECUTION>Build complete @graph with 6 schema objects in this order: WebSite, Business, HowTo, FAQPage, BreadcrumbList, WebPage</EXECUTION>

<OBJECT_1_WEBSITE>
{
  "@type": "WebSite",
  "@id": "{SITE_BASE}/#website",
  "url": "{SITE_BASE}/",
  "name": "STS Electronic Recycling, Inc.",
  "publisher": {
    "@type": "Organization",
    "@id": "{SITE_BASE}/#org",
    "name": "STS Electronic Recycling, Inc.",
    "logo": {
      "@type": "ImageObject",
      "url": "{LOGO_IMAGE}"
    },
    "sameAs": [
      {IF CID_AVAILABLE: "https://www.google.com/maps?cid={CID_NUMERIC}",}
      "{FACEBOOK}",
      "{LINKEDIN}"
    ]
  }
}

Note: Publisher has @id: "/#org" for cross-referencing with parentOrganization.
</OBJECT_1_WEBSITE>

<OBJECT_2_WEBPAGE>
{
  "@type": "WebPage",
  "@id": "{PAGE_URL}#webpage",
  "url": "{PAGE_URL}",
  "name": "{META_TITLE}",
  "description": "{META_DESCRIPTION}",
  "isPartOf": { "@id": "{SITE_BASE}/#website" },
  "about": { "@id": "{PAGE_URL}#business" },
  "creator": {
    "@type": "Person",
    "name": "Mark Domnenko",
    "jobTitle": "AI Strategy & Growth Specialist",
    "sameAs": "https://www.linkedin.com/in/markdomnenko",
    "knowsAbout": [
      "AI Strategy",
      "Prompt Engineering",
      "Generative Engine Optimization",
      "Enterprise SEO",
      "Structured Data Optimization",
      "Fractional CMO",
      "Fractional AI Consulting",
      "AI Automation"
    ]
  },
  "primaryImageOfPage": {
    "@type": "ImageObject",
    "url": "{HERO_IMAGE}"
  },
  "inLanguage": "en-US"
}
</OBJECT_2_WEBPAGE>

<OBJECT_3_BUSINESS>

BUILD THE MAIN BUSINESS ENTITY:

<BASE_FIELDS>
{
  "@type": {SCHEMA_PRIMARY_TYPE},
  "@id": "{PAGE_URL}#business",
  {IF CID_AVAILABLE: "identifier": "{CID_NORMALIZED}",}
  "name": {NAME_BUILDER},
  "alternateName": {ALTNAME_BUILDER},
  "description": {DESCRIPTION_BUILDER},
  "slogan": {SLOGAN_BUILDER},
  {IF PHONE_AVAILABLE: "telephone": "{PHONE}",}
  "email": "recycle@stsrecycle.com",
  "url": "{PAGE_URL}",
  "image": "{HERO_IMAGE}"
}

NAME_BUILDER:
  HUB/SPOKE: "STS Electronic Recycling, Inc. — {CITY} Electronics Recycling"
  NATIONAL: "STS Electronic Recycling, Inc. — {SERVICE}"

ALTNAME_BUILDER:
  HUB/SPOKE: "STS Electronic Recycling {CITY}"
  NATIONAL: "STS Electronic Recycling"

DESCRIPTION_BUILDER (2-3 sentences, required):
  HUB/SPOKE: "STS Electronic Recycling provides R2v3 certified electronics recycling and ITAD services for {CITY} businesses, healthcare facilities, government agencies, and educational institutions. Our NAID AAA certified data destruction ensures compliance with {COMPLIANCE_FRAMEWORK} through NIST 800-88 protocols and complete chain-of-custody documentation. We serve {CITY}, {COUNTY} County, and surrounding communities with complimentary pickup and zero-landfill processing."

  NATIONAL: "STS Electronic Recycling provides nationwide {SERVICE} for healthcare organizations, financial institutions, and government agencies requiring strict compliance with {COMPLIANCE_FRAMEWORK}. Our NAID AAA certified facility processes electronics with R2v3 certification, delivering complete chain-of-custody documentation and certificates of destruction for audit requirements. We serve organizations across all 50 states with secure logistics and specialized {NICHE} expertise."

  {COMPLIANCE_FRAMEWORK}: Look up from CFR_REFERENCE_TABLE based on NICHE. Default: "data security regulations"

SLOGAN_BUILDER:
  HUB/SPOKE:
    Healthcare: "{CITY}'s HIPAA-Compliant Electronics Recycling & Data Destruction"
    Government: "{CITY}'s GSA-Approved Electronics Recycling & Secure Data Destruction"
    Default: "{CITY}'s Trusted R2 Certified Electronics Recycling & ITAD Services"
  NATIONAL:
    Healthcare: "HIPAA Compliant Electronics Recycling for Healthcare Organizations Nationwide"
    Financial: "GLBA Compliant Data Destruction for Financial Institutions Nationwide"
    Government: "NIST 800-88 Certified Electronics Disposal for Federal Agencies"
    Default: "NAID AAA Certified {SERVICE} Nationwide"
</BASE_FIELDS>

<ADDITIONALTYPE>
"additionalType": [
  "https://www.wikidata.org/wiki/Q115196938",
  "WasteManagementService",
  "ITAssetDispositionProvider",
  "DataDestructionService"
]

SPOKE/NATIONAL: Also add "RecyclingCenter" to additionalType.
</ADDITIONALTYPE>

<ADDRESS>
HUB (FULL_ADDRESS):
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "{ADDRESS}",
    "addressLocality": "{CITY}",
    "addressRegion": "{STATE}",
    "postalCode": "{ZIP}",
    "addressCountry": "US"
  }

SPOKE (CITY_ONLY):
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "{CITY}",
    "addressRegion": "{STATE}",
    "postalCode": "{ZIP}",
    "addressCountry": "US"
  }

NATIONAL (COUNTRY_ONLY):
  "address": {
    "@type": "PostalAddress",
    "addressCountry": "US"
  }
</ADDRESS>

<GEO>
IF COORDINATES_AVAILABLE:
  "geo": { "@type": "GeoCoordinates", "latitude": {LAT}, "longitude": {LNG} }
ELSE: Omit entirely.
</GEO>

<AREASERVED>
IF CITY_REGION:
  "areaServed": [
    { "@type": "City", "name": "{CITY}" },
    { "@type": "AdministrativeArea", "name": "{COUNTY} County" },
    { "@type": "City", "name": "{NEIGHBOR_1}" },
    { "@type": "City", "name": "{NEIGHBOR_2}" },
    { "@type": "City", "name": "{NEIGHBOR_3}" },
    // FOUND_NEIGHBORHOODS as Place entries (ONLY if found in 0J)
    // LANDMARK as Place entry (ONLY if in brief)
    // GeoCircle ONLY if coordinates available:
    {IF COORDINATES: { "@type": "GeoCircle", "geoMidpoint": { "@type": "GeoCoordinates", "latitude": {LAT}, "longitude": {LNG} }, "geoRadius": {RADIUS_METERS} }}
  ]

  GeoCircle rules: INSIDE areaServed array, geoRadius is NUMERIC (no "meters" string), target 6-12 total entries.

IF COUNTRY:
  "areaServed": { "@type": "Country", "name": "United States" }
</AREASERVED>

<POTENTIALACTION>
RESULT_NAME by niche:
  Healthcare/HIPAA: "Free HIPAA Data Destruction Quote"
  Financial/GLBA: "Free GLBA Compliant Destruction Quote"
  Government: "Free Government IT Disposal Quote"
  Education/FERPA: "Free FERPA Compliant Recycling Quote"
  Default: "Free Quote Request"

"potentialAction": [
  {
    "@type": "ReserveAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "{QUOTE_FORM}",
      "inLanguage": "en-US",
      "actionPlatform": ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"]
    },
    "result": { "@type": "Reservation", "name": "{RESULT_NAME}" }
  }
  {IF PHONE_AVAILABLE:
  ,{
    "@type": "ContactAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "tel:{PHONE_NUMERIC}",
      "inLanguage": "en-US",
      "actionPlatform": ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform", "http://schema.org/IOSPlatform", "http://schema.org/AndroidPlatform"]
    }
  }}
]
</POTENTIALACTION>

<HASMAP_SAMEAS>
IF CID_AVAILABLE:
  "hasMap": "https://www.google.com/maps?cid={CID_NUMERIC}",
  "sameAs": ["https://www.google.com/maps?cid={CID_NUMERIC}", "{FACEBOOK}", "{LINKEDIN}"]
ELSE:
  "sameAs": ["{FACEBOOK}", "{LINKEDIN}"]
</HASMAP_SAMEAS>

<CREDENTIALS>
"hasCredential": [
  { "@type": "EducationalOccupationalCredential", "name": "R2v3 Certification", "credentialCategory": "Responsible Recycling" },
  { "@type": "EducationalOccupationalCredential", "name": "NAID AAA Certification", "credentialCategory": "Data Destruction" }
]
</CREDENTIALS>

<KNOWSABOUT>
IF KNOWSABOUT_MODE = DEFAULT_LIBRARY:
  Use the 12 default terms from GLOBAL_CONFIGURATION.

IF KNOWSABOUT_MODE = NICHE_FROM_HTML:
  Generate 18-22 niche-specific terms extracted from the HTML content.
  Terms should reflect what the page actually covers — specific services, compliance frameworks, equipment types, processes.
  Example (HIPAA page): "HIPAA compliant data destruction", "ePHI destruction services", "Business Associate Agreement requirements", "Chain of custody documentation", "NIST 800-88 data sanitization", etc.
</KNOWSABOUT>

<AGGREGATERATING>
IF INCLUDE_AGGREGATE_RATING:
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "{RATING}", "reviewCount": "{COUNT}" }
ELSE: Omit.
</AGGREGATERATING>

<OPENING_HOURS>
IF HOURS in brief → format as OpeningHoursSpecification array.
IF not provided → omit.
</OPENING_HOURS>

<PARENTORGANIZATION>
"parentOrganization": {
  "@type": "Organization",
  "@id": "{SITE_BASE}/#org",
  "name": "STS Electronic Recycling, Inc.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1653 N Bolton Street",
    "addressLocality": "Jacksonville",
    "addressRegion": "TX",
    "postalCode": "75766",
    "addressCountry": "US"
  },
  "hasCredential": [
    { "@type": "EducationalOccupationalCredential", "name": "R2v3 Certification" },
    { "@type": "EducationalOccupationalCredential", "name": "NAID AAA Certification" }
  ]
}

Note: @id matches publisher @id in WebSite object for entity disambiguation.
</PARENTORGANIZATION>

<HASOFFERCATALOG>

"hasOfferCatalog": {
  "@type": "OfferCatalog",
  "name": {CATALOG_NAME},
  "itemListElement": [ ...services... ]
}

CATALOG_NAME:
  HUB/SPOKE: "{CITY} Electronics Recycling & ITAD Services"
  NATIONAL: "{SERVICE} — Nationwide Coverage"

<SERVICE_CATALOG_STRATEGY>

IF SERVICE_CATALOG = DEFAULT_20 (city pages):
  Use standard 20 services:
  1. Computer Recycling, 2. Laptop & Tablet Recycling, 3. Cell Phone Recycling, 4. Networking Equipment Recycling, 5. Printer & Copier Recycling, 6. Server Equipment Recycling, 7. Monitor Recycling, 8. Data Destruction Services, 9. Hard Drive Shredding, 10. On-Site Data Destruction, 11. ITAD Services, 12. Healthcare IT Disposal, 13. Government Electronics Recycling, 14. Corporate IT Recycling, 15. Education Technology Recycling, 16. Manufacturing Electronics Disposal, 17. Asset Remarketing, 18. Certificate of Destruction, 19. E-Waste Recycling, 20. Secure Transport Services

IF SERVICE_CATALOG = NICHE_GENERATED (national pages):
  Generate 12-20 services specific to the page topic, guided by the HTML content.
  Services should reflect what the page actually offers — not the generic city catalog.

  Example (HIPAA page): HIPAA Compliant Data Destruction, On-Site Witnessed Shredding, Chain of Custody Data Destruction, Certificates of Destruction, BAA Services, Healthcare IT Asset Disposition, Medical Device Data Destruction, SSD and Flash Storage Destruction, Server Destruction, Backup Tape Destruction, Mobile Device Destruction, Healthcare Data Center Decommissioning, Asset Tracking and Reporting, Computer Recycling for Healthcare, Laptop/Tablet Recycling for Healthcare, Networking Equipment Recycling for Healthcare, Healthcare E-Waste Pickup, R2 Certified Healthcare Electronics Recycling, NIST 800-88 Compliant Sanitization, Secure Transport Services

  Target: 20 services. Minimum: 12 (halt below 12).
  12-19 generates warning, not halt.
</SERVICE_CATALOG_STRATEGY>

<SERVICE_TEMPLATE>
Each service MUST follow this structure:

{
  "@type": "Offer",
  "itemOffered": {
    "@type": "Service",
    "@id": "{PAGE_URL}#service-{slug}",
    "name": "{Service Name}",
    "description": "{Entity-rich description}",
    "areaServed": {AREA_BUILDER}
  }
}

CRITICAL: The @id goes on the SERVICE object (not the Offer wrapper). AI engines disambiguate the Service entity — the Offer is just the container.

SLUG RULES:
  - Lowercase, hyphens only
  - Strip all non-alphanumeric except hyphens
  - & → and, / → hyphen, special chars → removed
  - Examples: "Computer Recycling" → "computer-recycling"
    "HIPAA/HITECH Compliance" → "hipaa-hitech-compliance"
    "Laptop & Tablet Recycling" → "laptop-and-tablet-recycling"
  - Every @id MUST be unique across all services

AREA_BUILDER:
  HUB/SPOKE: { "@type": "City", "name": "{CITY}" }
  NATIONAL: { "@type": "Country", "name": "United States" }
</SERVICE_TEMPLATE>

<SERVICE_DESCRIPTIONS>

CITY PAGE formula:
"{Service type} for {CITY} {target market}. {Specific process}. Services include {ENTITY_1} ({EMPLOYEES} employees), {ENTITY_2}, and {ENTITY_3} for {compliance} with {deliverable}."

NATIONAL PAGE formula:
"{Service type} for {target market} nationwide. {Specific process}. Serves organizations like {ENTITY_1}, {ENTITY_2}, and {ENTITY_3} requiring {compliance} with {deliverable}."

ENTITY-FREE FALLBACK (when SAFE_ENTITIES is empty or insufficient):
Use category-based descriptions: "hospitals, health systems, and covered entities", "financial institutions and banking organizations", "federal agencies and municipal governments"

Target: 150-300 characters per description
Entity density: 2-4 per service when available
CFR citations: On 4-8 contextually relevant services per CFR_REFERENCE_TABLE placement rule

ENTITY DISTRIBUTION:
  40+ entities: unique per service
  20-39: max 2 uses each
  10-19: max 3 uses each
  <10: mix available entities with category descriptions
</SERVICE_DESCRIPTIONS>

SERVICE COUNT VALIDATION:
After generating all services, verify count.
  < 12: 🔴 HALT — "Only {X} services. Minimum 12 required."
  12-19: 🟠 WARNING — "Generated {X}/20 services. Proceeding."
  20: ✅ SUCCESS
</HASOFFERCATALOG>

</OBJECT_3_BUSINESS>

<OBJECT_4_HOWTO>

<HOWTO_STRUCTURE>
{
  "@type": "HowTo",
  "@id": "{PAGE_URL}#howto",
  "name": {HOWTO_TITLE},
  "description": {HOWTO_DESC},
  "image": "{HERO_IMAGE}",
  "totalTime": "PT15M",
  "supply": [
    { "@type": "HowToSupply", "name": "List of equipment to recycle" },
    { "@type": "HowToSupply", "name": "Asset serial numbers (if tracking required)" }
  ],
  "tool": [
    { "@type": "HowToTool", "name": "Phone or online quote form" }
  ],
  "step": [ ...6 steps... ]
}

HOWTO_TITLE:
  CITY: "How to Schedule {SERVICE} in {CITY}"
  NATIONAL: "How to Schedule {SERVICE} Nationwide" or niche-adapted
    Example: "How to Get HIPAA Compliant Hard Drive Destruction"

HOWTO_DESC:
  CITY: "Step-by-step process for scheduling R2 certified {SERVICE} with secure data destruction for {CITY} businesses and organizations."
  NATIONAL: Adapt to page topic.
</HOWTO_STRUCTURE>

<HOWTO_STEPS_CITY>
Step 1: "Request Free Quote" — Contact STS at {PHONE} or online form. Provide equipment types, quantities, timing. url: {QUOTE_FORM}
Step 2: "Schedule Pickup" — Convenient scheduling for {CITY} location. Accommodates business hours and {NICHE} requirements.
Step 3: "Secure Transport" — GPS-tracked vehicles from {CITY} to R2v3 certified facility with chain-of-custody documentation.
Step 4: "Asset Tracking & Data Destruction" — Serial-level tracking, NAID AAA certified, NIST 800-88 protocols. {NICHE} organizations receive compliance certificates.
Step 5: "Environmental Processing" — R2v3 certified material separation, zero landfill. Functional equipment remarketed.
Step 6: "Certificate of Destruction" — Serial numbers, methods, weights, downstream tracking. Satisfies {COMPLIANCE} requirements. url: {CERTIFICATE_PAGE}
</HOWTO_STEPS_CITY>

<HOWTO_STEPS_NATIONAL>
Generate 6 niche-adapted steps based on page topic. Follow the same flow (request → agreement → schedule → process → destroy → document) but customize language and details.

Example (HIPAA): Request Quote → Execute BAA → Schedule with Chain of Custody → Witness Destruction or Secure Transport → NAID AAA Certified Processing → Certificate of Destruction for OCR Audit Compliance

Each step: position (1-6), name, text, optional url/image.
Step 1 url: {QUOTE_FORM} | Step 6 url: {CERTIFICATE_PAGE} | Steps 2-5 image: {HERO_IMAGE}
</HOWTO_STEPS_NATIONAL>

</OBJECT_4_HOWTO>

<OBJECT_5_FAQPAGE>

{
  "@type": "FAQPage",
  "@id": "{PAGE_URL}#faqpage",
  "mainEntity": [ ...questions... ]
}

<FAQ_COUNT>
CITY pages: Generate exactly 8 FAQs.
NATIONAL pages: Generate 8-12 FAQs. Target the higher end for compliance-heavy topics.
</FAQ_COUNT>

<FAQ_CITY_GUIDANCE>
Generate 8 city-specific FAQs covering these topics (adapt wording, don't use verbatim):
1. Service availability in {CITY}
2. Compliance for {NICHE} (HIPAA/GLBA/NIST as applicable)
3. Free pickup availability in {CITY} area
4. Certifications held (R2v3, NAID AAA)
5. Scheduling speed for {CITY}
6. Government/industry-specific service (adapt to niche)
7. Process after pickup from {CITY}
8. Asset value recovery for {CITY} businesses

Rules: Mention {CITY}/{COUNTY} 2-3 times per answer. 80-120 words each. Include 1-2 entities from SAFE_ENTITIES if available. No facility claims for SPOKE pages.
</FAQ_CITY_GUIDANCE>

<FAQ_NATIONAL_GUIDANCE>
Generate 8-12 topical FAQs targeting real search queries for the page topic. Do NOT use the city templates.

The FAQs should be compliance-focused questions that searchers actually ask — similar to "What documentation do I need for a HIPAA audit?" or "Is data wiping sufficient for HIPAA compliance?" — not generic service-availability questions.

Rules: Use "nationwide", "across all 50 states" for geographic scope. Reference compliance frameworks from CFR_REFERENCE_TABLE. 80-120 words each. Include specific regulatory citations where natural. Target featured snippets.

Example topics (HIPAA page):
- Audit documentation requirements
- BAA requirements for vendors
- Chain of custody proof
- On-site witnessed destruction
- Penalties for improper disposal
- Retention period for certificates
- Physical destruction vs data wiping
- Medical device data destruction
- Certifications to look for in a vendor
- HIPAA Security Rule ePHI requirements
</FAQ_NATIONAL_GUIDANCE>

FAQ COUNT VALIDATION:
After generating, verify count.
  CITY: != 8 → HALT
  NATIONAL < 8: HALT | 8-12: ✅
</OBJECT_5_FAQPAGE>

<OBJECT_6_BREADCRUMBS>

{
  "@type": "BreadcrumbList",
  "@id": "{PAGE_URL}#breadcrumb",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "{SITE_BASE}/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Services",
      "item": "{SERVICES_PAGE}"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": {BREADCRUMB_L3_NAME},
      "item": "{PAGE_URL}"
    }
  ]
}

BREADCRUMB_L3_NAME:
  CITY: "{CITY} Electronics Recycling"
  NATIONAL: "{SERVICE}"

CRITICAL: ALL 3 positions MUST have "item" field. Position 2 always uses {SERVICES_PAGE} — no state pages exist on site. Position 3 uses {PAGE_URL}.
</OBJECT_6_BREADCRUMBS>

</PHASE_1>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- PHASE 2: VALIDATION + OUTPUT                               -->
<!-- ═══════════════════════════════════════════════════════════ -->

<PHASE_2>
<EXECUTION>Run ALL checks. Any failure → fix and re-validate before output.</EXECUTION>

<VALIDATION_CHECKLIST>
17-POINT SCHEMA VALIDATION:

1. CID FORMAT: identifier uses "cid:" prefix, hasMap/sameAs use numeric only, consistent everywhere. OR properly using HQ CID for national.
2. SCHEMA TYPE: Correct for page type. NEVER "Service" as primary @type.
3. NO INVENTED DATA: Coordinates, neighborhoods, ratings — all from verified sources or omitted.
4. URL CONSISTENCY: All URLs from STANDARD_URLS. No hardcoded/invented URLs.
5. GEORADIUS: Numeric value, GeoCircle inside areaServed, only if coordinates available.
6. COMPETITOR EXCLUSION: Zero competitor mentions in services, FAQs, HowTo, description.
7. SERVICE COUNT: 12+ generated (20 target for city, 12-20 for national).
8. FAQ COUNT: 8 for city, 8-12 for national.
9. PHONE FORMAT: +1-XXX-XXX-XXXX display / +1XXXXXXXXXX tel link. Or omitted.
10. ENTITY RICHNESS: Majority of services have entity/category mentions. All from SAFE_ENTITIES.
11. SERVICE @ID ANCHORS: All services have unique @id with valid URL slug.
12. SERVICE AREASERVED: All services have correct areaServed for page type.
13. WEBPAGE LINKING: isPartOf → WebSite, about → Business. All @id references valid.
14. BREADCRUMBS: All 3 positions have "item" field. Position 2 = /services.
15. PLACEHOLDER DETECTION: 🔴 Scan final output for literal {VARIABLE} strings. ANY found → HALT and fix.
16. FILE STRUCTURE: 🔴 schema.txt starts with <script type="application/ld+json"> and ends with </script>. NOTHING outside the script wrapper — no HTML comments, no meta tags, no raw JSON. Pure script-to-script.
17. HOWTO PRESENT: 🔴 HowTo object exists in @graph with name, description, and exactly 6 steps. Each step has position, name, and text. Missing HowTo, step count != 6, or missing required step fields → HALT.

JSON SYNTAX: Valid JSON, no trailing commas, balanced brackets, escaped strings.

ALL 17 PASS → generate file.
ANY FAIL → fix, re-validate.
</VALIDATION_CHECKLIST>

<FILE_OUTPUT>
Generate schema.txt as PURE JSON-LD — script tag to script tag, nothing outside:

🔴 CRITICAL: schema.txt starts with <script type="application/ld+json"> and ends with </script>. NO HTML comments, NO meta tags, NO content outside the script wrapper.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { WebSite },
    { Business },
    { HowTo },
    { FAQPage },
    { BreadcrumbList },
    { WebPage }
  ]
}
</script>

Creator attribution is embedded INSIDE the JSON-LD via the "creator" Person entity on the WebPage object — not as external HTML.

The HTML comment (<!-- Creator: Mark Domnenko -->) and meta author tag are injected by the Blog SEO Audit and Page Builder prompts which control the full page HTML. The Schema Generator does NOT output those.

Format: 2-space indentation, proper JSON-LD.
VALIDATE: File starts with <script and ends with </script>. Nothing before or after.
Save as: schema.txt
</FILE_OUTPUT>

<META_DATA_DISPLAY>
Display in copyable boxes:

Browser Page Title:
{META_TITLE} — {length} chars (target: 60-80)

Meta Description:
{META_DESCRIPTION} — {length} chars (target: 150-160)

Meta Keywords:
{8 keywords from brief}

Deployment:
1. Browser Page Title → Joomla Publishing → Browser Page Title
2. Meta Description → Joomla Publishing → Meta Description
3. Meta Keywords → Joomla Publishing → Meta Keywords
4. schema.txt contents → page <head> section (pure JSON-LD script block)
5. Save article
</META_DATA_DISPLAY>

</PHASE_2>

</SCHEMA_GENERATOR>


```

### Fixture — master-seo-audit.txt

`scripts/src/bakeoff/fixtures/master-seo-audit.txt` — 83,270 chars

````text
# MASTER SEO AUDIT v10.12.4 — FULL POWER (GEO + AI + LOCAL SEO)

```xml
<!-- MASTER SEO AUDIT v10.12.4 FULL POWER
     Architecture: Preservation-first, replacement-preferred
     SEO: Traditional + Local + Technical + AI/GEO
     Enhancements from v10.8.1: All 35 fixes integrated
     v10.9: GEO Statistics Addition, Citation Attribution Patterns,
            Answer Block Optimization, Entity Co-occurrence Graph,
            Query Fan-Out Mapping, Fact Density Tracking
     v10.9.1: Source ledger enforcement, facility size preserve-only,
              GEO replacement-only mode, link checkpoint, fact integrity
     v10.9.2: Verified-only pickup claims, conditional near-me sentence
     v10.10: Phase 0C 3-tier detection (V3/Legacy_PB/Normal),
             V3 metadata parser (bible, niche, soft_targets, entities, sections),
             Phase 1C tagged replacement (AUDIT_TARGET inline tags priority),
             Phase 0B Step 1.5 handoff document parsing (entities + tier structure),
             Phase 1O tier-aware linking (Tier 1-2 body priority, Tier 5 CTA only),
             Forward-compatible with Page Builder v3.0 handoff
     v10.12: Phase 1L primary block position-lock to earliest soft target
             (front-loading for AI citation per March 2026 update findings),
             Phase 1F Task 2 niche context voice shift to operational-experience
             pattern (brand-anchored Experience signal for E-E-A-T first E)
     v10.12.1: HOTFIX. Phase 1N image attribute lock. Production bug: audit
               was modifying img src/loading/class attributes during HTML
               repair (item 1) and alt optimization (item 5), causing image
               glitches and broken/swapped images on completed pages.
               Fix: item 1 now excludes img tags from HTML repair entirely;
               item 5 locks every img attribute except alt value; output log
               and HALT condition added for img-attribute integrity check.
     v10.12.2: Phase 1F Task 3 Quotation Addition (Princeton GEO third lever,
               attributed quotes from verified sources only, replacement-preferred).
               Conflict-precedence ladder added to NON_NEGOTIABLES (documents
               which rule wins when preservation/link/word rules collide).
               Gate 2 sentence-level restoration (restore full sentence around
               a dropped link, not just the bare href, preventing orphaned tags).
               Proof of Work expanded to 11 checks (added quotation verification).
     v10.12.3: HARDENING. Quotation task tightened to verbatim-from-named-source
               only (removed role-archetype pattern that put invented words in
               quotes, an invention-policy risk). Gate 2 restoration upgraded from
               sentence-level to full parent-block element (CONTAINING_CONTEXT in
               LINK_REGISTRY), a more robust restoration unit. Precedence ladder
               gains tier 2 (verified-facts / no-invention policy).
     v10.12.4: HARDENING. Three fixes from external audit. (1) Quotation example
               span was a tidied paraphrase in quotes, violating the task's own
               verbatim rule; replaced with an [illustrative] marker plus an
               explicit instruction to use only a verified verbatim span, and
               aligned the standard revision to Rev. 2 to match Phase 1F Task 1.
               (2) Phase 1N LINK COUNT CHECKPOINT restoration aligned to Gate 2
               (restore full CONTAINING_CONTEXT block, not bare tag) so the prompt
               has one restoration philosophy, not two. (3) GEO PRIORITY wording
               for 1F quotation changed from "always run" to "always attempt"
               (it legitimately skips when no verified source exists).
     Restored: Linking heatmap, technique execution checklist -->

<INPUT_REQUIREMENTS>
REQUIRED: Complete HTML from DOCTYPE to closing html tag.
OPTIONAL: City handoff document (hub+spoke link reference).

HARD STOP CONDITIONS:
- Missing HTML content
- Truncated HTML (no closing html tag)
- Body content under 500 words
- Critical sections missing (hero, services, equipment showcase)

If hard stop triggered: Output error specifying missing requirement. Do not proceed.
</INPUT_REQUIREMENTS>


<NON_NEGOTIABLES>
All rules stated once here. All phases reference this section. Never restate rules in phases.

URL RULES:
- Never invent URLs under any circumstances
- New links: Use APPROVED_URL_ALLOWLIST absolute URLs only
- Existing links in input HTML are implicitly approved for preservation and re-use even if not on allowlist
- Existing links: Preserve href values character-perfect
- No href normalization (relative to absolute, trailing slash, www, http to https)
- Email links: Preserve exactly as found (mailto, CloudFlare /cdn-cgi/l/email-protection#, obfuscated). Fix only broken tag syntax.
- If a needed URL is missing from allowlist and not in input HTML, skip it and log "missing allowlist entry"

PRESERVATION — HERO:
- HERO MESSAGE = H1 heading text + first paragraph after H1 (hero-subtitle or equivalent). Message text locked. Only facility language fixes and broken HTML repair allowed.
- HERO MACHINERY = everything else in hero section (checkmarks, CTAs, forms, icons, phone links, email links, layout, form modules including loadposition tags). All preserved exactly. No removal. No href changes.
- Forbidden in hero MESSAGE: text additions, entity insertions, persona language, keyword swaps, content restructuring, sentence rewrites beyond allowed fixes.
- Forbidden in hero MACHINERY: removing any element, stripping anchor tags, modifying href values.

PRESERVATION — CONVERSION:
- Tel link count cannot decrease
- Email link count cannot decrease
- Form element count cannot decrease (including {loadposition} tags)
- CTA button count cannot decrease

PRESERVATION — HEAD:
- Canonical tag: Character-perfect unchanged
- Robots meta tag: Character-perfect unchanged
- No other head modifications
- Meta drafts (Phase 0D) are for Joomla fields only, never applied to HTML head

PRESERVATION — LINKS:
- Total link count cannot decrease from baseline
- Sacred equipment links: Lock existing, add only missing via allowlist
- No duplicate URL destinations among newly added links (existing duplicates preserved)

PRESERVATION — DESIGN:
- Max 60 words per body paragraph. If a technique would push past 60, split or replace instead of append.
- No adjacent links within same paragraph. Minimum 1 full sentence between any two links.
- Max 2 links per body paragraph.
- All content additions must be tasteful. Never stuff existing cards, boxes, trust bars, or visual containers. Keep existing containers at original length +/-10 words max. If crowded, move content elsewhere.

OUTPUT RULES:
- Complete HTML only: DOCTYPE to closing html tag
- No truncation anywhere
- No schema markup additions (zero JSON-LD in output)
- No invented content (companies, metrics, certifications)
- Output as .html file (not .txt)

VERIFIED FACTS POLICY:
Allowed sources for entities, metrics, and facts:
(1) Present in input HTML
(2) Provided by user in conversation
(3) Verified through Phase 0B web research and stored in research brief
When in doubt: Use structured detail without inventing new facts.

UNIQUENESS POLICY:
SEO Audit preserves uniqueness created by Page Builder but does not create it. Uniqueness is Page Builder's responsibility. Track uniqueness metrics as advisory only.

WORD BUDGET:
- Target: +20 to +80 words net gain (Phase 1 total)
- Soft ceiling: At +80, remaining phases switch to pure replacement only
- Hard ceiling: If Page Builder metadata provides ceiling, respect it. Otherwise ceiling = competitor avg + 20% from Phase 0B.
- At hard ceiling: Phase 2 blocked. Remaining Phase 1 techniques use pure replacement only.

LINK BUDGET:
- Contextual body links (excluding equipment showcase, CTAs, nav, footer): Max = body word count / 100, capped at 18
- Equipment showcase: 10 sacred links (navigational, not counted toward density)
- Infrastructure links (phone, email, contact buttons, form): Not counted toward density
- SEO density = contextual body links / body word count. Target: 1:100-150. Warn below 1:90.

CITY-SPECIFIC LINK PRIORITY:
- In body content: Prefer city-specific spoke URLs over generic service URLs when spoke page exists
- Generic service URLs belong in Related Services navigation section only
- If no spoke page exists, use generic as fallback. Log: "spoke page missing, using generic fallback"
- Check city handoff document (if provided) for available spoke pages

ENFORCEMENT:
All rules enforced via Gates 1-5 with automatic rollback on violation.
Global rollback limit: 3 total attempts across all gates. If exceeded: HALT with diagnostic.

CONFLICT-PRECEDENCE LADDER:
When two rules collide (e.g. "never decrease link count" vs "link budget cap = words/100" on a short page, or "mandatory city spoke links" vs "word ceiling"), the higher-priority rule wins. Do not improvise. Order:
1. Preservation invariants (link count, conversion elements, hero message, head tags). Never violated.
2. Verified facts / no-invention policy. Never violated to satisfy any technique.
3. Mandatory city spoke links (when handoff provided).
4. Word ceiling (hard ceiling from Page Builder metadata or competitor avg + 20%).
5. Link density target (1:100-150).
6. Stylistic and distribution preferences (spacing, variation, placement).
When a lower rule cannot be satisfied without breaking a higher one, skip the lower rule and log: "Precedence: [lower rule] yielded to [higher rule]."
Example: adding a mandatory city spoke link that would exceed the density target, rule 3 beats rule 5, add the link and log the overage. If it would breach a preservation invariant, rule 1 beats rule 3, skip and log.
</NON_NEGOTIABLES>


<EDGE_CASES>
Common scenarios across 580+ pages. Rules already exist above — this collects fallback behaviors in one place.

ZERO VERIFIED ENTITIES (small city, no major employers found):
→ Phase 1D: Use fallback language (industry clusters, geographic groupings, sector language). Log: "Entity precision: fallback applied."

WORD CEILING HIT EARLY (e.g., at Phase 1E):
→ All remaining Phase 1 techniques (1F-1P): Pure replacement only (net ±0). If a technique cannot execute as pure replacement, skip and log: "Phase [X]: ceiling enforced, skipped."

PAGE ALREADY OVER CEILING AT START:
→ Do NOT halt or refuse to optimize. Set CEILING_MODE = REPLACEMENT_ONLY for ALL phases. Execute all 16 techniques as pure replacement (improve quality without adding words). Tightening target: reduce toward ceiling if possible but do not force cuts that damage content quality. The Audit always optimizes — it never refuses to run.

STATISTICS RESEARCH RETURNS ZERO RESULTS:
→ Phase 1M: Skip statistics addition. Fact density audit still runs (advisory). Log: "Statistics skipped — no verified stats available."

MALFORMED INPUT HTML (unclosed tags, broken structure):
→ Phase 0A: Attempt registry build. If registries build successfully, continue. Phase 1N repairs what it can outside hero. HALT only if registries cannot be built.

SACRED URLS PRESENT BUT NOT ON ALLOWLIST:
→ Phase 1B: Lock existing URLs character-perfect (existing links are implicitly approved per NON_NEGOTIABLES). Phase 1O does NOT replace with allowlist versions. Log: "Sacred URLs preserved (not on allowlist)."

NATIONAL OR HUB PAGE (no city in URL, e.g., /industries-we-serve, /services, menu pages):
→ Phase 0B Step 1: Extract SERVICE and PAGE_URL. CITY = "national". STATE = "US".
→ Phase 0B Step 2: Skip "largest employers {CITY}" search. Research industry-sector entities instead (Fortune 500 examples, sector leaders, regulatory bodies).
→ Phase 0B Step 3: Skip neighbor cities/highways. Research scope language: "nationwide", "across the U.S.", "50-state coverage".
→ Phase 1D: Use industry cluster language and sector-specific entities instead of city employers.
→ Phase 1H: Replace city mention targets with scope language. No city/county counts. Use "nationwide", "coast-to-coast", regional references.
→ Phase 1K: Industry-standard preference statements instead of city-specific micro-anchors.
→ Phase 1O Step 1: Skip city spoke links (no handoff). Go directly to Step 2 (sacred) and Step 3 (strategic allowlist links).
→ All other techniques: Execute normally with sector/industry focus instead of geographic focus.
</EDGE_CASES>


<EXECUTION_ORDER>
Phase 0: Inventory and Research
  0A: Build preservation registries (HARD STOP if cannot build)
  0B: Research brief (web research + competitor analysis + meta drafts)
  0C: Detect Page Builder version (V3 metadata / Legacy / None) and parse handoff data

Phase 1: Surgical Optimization (16 techniques, all mandatory)
  1A: Facility language compliance (hard stop if violations remain)
  1B: Sacred equipment lock
  1C: Link-aware tightening + proof consolidation + replacement target scan
  1D: Entity precision, relationships, and co-occurrence graph
  1E: Semantic variants
  1F: Credibility signals with citation attribution + niche context
  1G: Persona targeting
  1H: Geographic, logistics, and near-me integration
  1I: Voice search + conversational query optimization
  1J: Question H2s, featured snippets, and query fan-out mapping
  1K: Micro-anchor diversity (AI/LLM training)
  1L: Answer block optimization (GEO passage extraction)
  1M: Statistics addition and fact density (GEO)
  1N: Technical cleanup (alt tags, tel links, HTML fixes)
  1O: Internal linking (sacred + strategic + city-specific)
  1P: GEO content structure audit

TECHNIQUE CHECKLIST: 1A 1B 1C 1D 1E 1F 1G 1H 1I 1J 1K 1L 1M 1N 1O 1P = 16 techniques. All mandatory.

GEO PRIORITY: Core (always run): 1F attribution, 1M statistics, 1P structure audit. Always attempt (skips only when no verified source exists): 1F quotation. Conditional (run if applicable targets exist): 1D co-occurrence, 1J fan-out, 1L answer blocks.

FORBIDDEN SKIP REASONS: "Ratio already high", "Page exceeds competition", "Word count sufficient", "Performance strong". Only acceptable skip for Phase 2: "Zero feature gaps identified."

Validation Gates: Execute after Phase 1 complete
  Gate 1: Sacred link integrity
  Gate 2: Link count invariant
  Gate 3: Conversion element invariant
  Gate 4: Hero protection
  Gate 5: Head lock

Phase 2: Strategic Additions (conditional — only if real gaps AND below ceiling)
Phase 3: Output (completeness validation, HTML file, report, Joomla meta)
</EXECUTION_ORDER>


<PHASE_0A_INVENTORY>
Extract ALL existing infrastructure BEFORE any optimization begins.

Build 4 registries:

1. LINK_REGISTRY: Every a tag — exact href (character-perfect), anchor text, CONTAINING_CONTEXT (the full parent block element, the <p>, <li>, or heading containing the link, captured as exact baseline HTML; this is the restoration unit for Gate 2, not the bare tag), location (hero/body/footer/equipment), category (sacred_equipment/conversion_cta/service_page/hub_spoke/industry_page/external/unknown). Total count.

2. CONVERSION_REGISTRY: CTA buttons (count + positions). Form modules including {loadposition} tags (count + exact text). Phone tel: links (count + href values). Email links — mailto:, CloudFlare /cdn-cgi/l/email-protection#, and obfuscated formats (count + exact patterns).

3. HEAD_REGISTRY: Canonical URL (exact). Meta robots (exact). Character-perfect preservation required.

4. HERO_REGISTRY: HERO_TEXT_CONTENT = H1 + first paragraph after H1 (exact HTML). HERO_INFRASTRUCTURE = all links/CTAs/forms/nav/phones/emails inside hero zone. Clear distinction: MESSAGE (text) vs MACHINERY (interactive elements).

HARD STOP if any registry cannot be built: "Unable to parse [registry]; cannot preserve infrastructure."

Output: "Phase 0A complete. Links: [N], Sacred: [X/10], Tel: [N], Email: [N], Forms: [N], CTAs: [N], Canonical: [present/missing], Robots: [present/missing]"
</PHASE_0A_INVENTORY>


<PHASE_0B_RESEARCH_AND_META>
The SEO Audit CREATES the research brief through analysis and web research.

STEP 1 — ANALYZE HTML:
Extract: CITY, STATE, COUNTY, SERVICE, PAGE_URL (from canonical), CURRENT_WORDCOUNT, existing entity mentions, current city/county counts, page type (hub/spoke/vertical/equipment/landing).

GEOGRAPHIC COHERENCE CHECK:
Scan entire HTML body text for state names, state abbreviations, county names, and city names that do NOT match the extracted CITY/STATE. Count: TARGET_GEO_REFS (mentions of correct city/state) vs WRONG_GEO_REFS (mentions of other cities/states/counties). If WRONG_GEO_REFS > 3: Log WARNING: "Geographic contamination detected — [N] references to wrong geography ([list top offenders]). Likely template swap. Phase 1H will require heavy geographic replacement." This warning primes Phase 1H to do a full geographic scrub rather than incremental additions.

STEP 1.5 — PARSE HANDOFF DOCUMENT (if provided):
Extract Local Context entities with any included metrics (bed counts, revenue, student counts, employee counts, rankings). Store as HANDOFF_ENTITIES — these are pre-curated by the operator and skip web verification. Extract tier structure (Tier 1-5) and page descriptions. Store as HANDOFF_TIERS for Phase 1O linking priority.
In Step 2: Merge HANDOFF_ENTITIES with web-researched VERIFIED_ENTITIES. Handoff values take priority on conflicts (same entity, different numbers). Web research fills gaps — entities not in handoff still need sourced verification.

STEP 2 — WEB RESEARCH ENTITIES:
Search: "largest employers {CITY} {STATE}"
Extract 10-15 verified entities with employee counts.
Store as VERIFIED_ENTITIES with source ledger:
- Format: {name | employee_count | source_name | date_captured}
- If source cannot be identified: Mark UNVERIFIED — cannot be used in Phase 1D
- Only entries with source_name populated are approved for use

STEP 3 — WEB RESEARCH GEOGRAPHY:
Search: "cities near {CITY}", "major highways {CITY}"
Extract: 5-8 NEIGHBOR_CITIES, 1-2 MAJOR_HIGHWAY, 2-3 LANDMARK/DISTRICT.

STEP 4 — DETECT NICHE AND PERSONA:
Analyze HTML for industry signals. Map to persona:
Healthcare → Healthcare IT Manager. K-12 → District Technology Coordinator. Corporate → Corporate IT Director. Financial → Financial IT Director. Government → Public Sector IT Manager. Higher Ed → University IT Director. Manufacturing → Manufacturing IT Manager. Retail → Retail IT Director.

STEP 5 — NICHE-SPECIFIC RESEARCH:
Search niche-specific: 3-5 PAIN_POINTS, REGULATIONS with CFR numbers, 3-5 OPERATIONAL_CONTEXT considerations.

STEP 6 — COMPETITOR RESEARCH:
Search: "{SERVICE} {CITY} {STATE}". Analyze top 3-5 competitor pages that are actual service/landing pages (exclude directories, Yelp, Google Maps, aggregator listings). Calculate COMPETITOR_AVG_WORDCOUNT from qualifying pages only.
- FLOOR: If competitor avg < 1,200 or fewer than 2 qualifying pages found, set COMPETITOR_AVG_WORDCOUNT = 1,500 (default for service landing pages).
- HARD_CEILING = COMPETITOR_AVG_WORDCOUNT + 20%.
- If CURRENT_WORDCOUNT already exceeds HARD_CEILING: Do NOT halt. Set CEILING_MODE = REPLACEMENT_ONLY and proceed. Log: "Page exceeds ceiling ([current] vs [ceiling]). All techniques replacement-only. No net word additions."

STEP 7 — STATISTICS RESEARCH (GEO):
Search: "{SERVICE} industry statistics {CURRENT_YEAR}", "electronics recycling data"
Collect 5-8 verified statistics for use in Phase 1M:
- Industry volume/weight stats (e.g., "X million tons of e-waste generated annually")
- Certification statistics (e.g., "R2v3 facilities process X% of all certified e-waste")
- Compliance data (e.g., "X% of data breaches involve improperly disposed hardware")
- Regional data (e.g., "{STATE} generates X tons of e-waste annually")
Store as VERIFIED_STATISTICS with source ledger:
- Format: {statistic | unit | source_name | publication_year | date_captured}
- If source cannot be identified: Mark UNVERIFIED — cannot be used in Phase 1M
- Only entries with source_name populated are approved for use

STEP 8 — DRAFT META:
Meta title (60 chars max): city + service + benefit + brand. Meta description (155 chars max): actionable + local proof + CTA. Keywords: 8 terms, mix head/mid-tail/long-tail. Store for Phase 3 output — NOT applied to HTML head.

Output: "Phase 0B complete. {CITY}, {STATE}. Niche: {NICHE}. Persona: {PERSONA}. Competitors avg: [N] words. Ceiling: [N]. Verified entities: [N] sourced / [N] unverified. Handoff entities: [N]. Verified statistics: [N] sourced / [N] unverified."
</PHASE_0B_RESEARCH_AND_META>


<PHASE_0C_PAGE_BUILDER_DETECTION>
Detection is AUTOMATIC. Check in order, first match wins, proceed immediately. Never ask the user which mode to use. Never explain detection logic in chat. Just detect and execute.

Detection priority (check in order):
1. PAGE_BUILDER_V3 metadata block → V3 mode
2. DESIGN_BIBLE_V2 true comment → LEGACY_PB mode
3. loadposition city-hero-form + compliance proof block → LEGACY_PB mode
4. None found → NORMAL mode

All three modes are fully functional. No mode requires additional user input to proceed.

--- V3 MODE (PAGE_BUILDER_V3 metadata found) ---

Parse metadata fields:
- bible: A|B → Store as PB_BIBLE. Informs which HTML structure to expect.
- competition: LOW|MEDIUM|HIGH → Store as PB_COMPETITION. Cross-reference with Phase 0B research.
- niche: healthcare|corporate|government|education|financial|general → Store as PB_NICHE. Informs entity selection bias in Phase 1D.
- word_count: [number] → Store as PB_WORD_COUNT. Use as CURRENT_WORDS baseline.
- entities_placed: [count] → Store as PB_ENTITIES. Phase 1D entity budget = max(8, PB_ENTITIES + 4) total after optimization.
- soft_targets: pipe-delimited list (e.g., hero_intro|industry_card_1|about_city|faq_3) → Store as PB_SOFT_TARGETS. Pass to Phase 1C Task 3 as priority replacement locations.
- faqs_selected: pipe-delimited list → Store as PB_FAQS. Phase 1L knows which FAQ questions exist.
- sections_included: pipe-delimited list → Store as PB_SECTIONS. Techniques focus on included sections.
- sections_excluded: pipe-delimited list → Store as PB_EXCLUDED. Do not add content for excluded sections.

Validation: Count inline <!-- AUDIT_TARGET --> tags in HTML body. Compare to PB_SOFT_TARGETS list length.
- Match → Proceed normally.
- Mismatch → Log: "Metadata lists [N] soft targets, found [M] inline tags. Using inline tags as ground truth."
- Zero inline tags despite metadata listing targets → Fall back to standard Phase 1C scanning.
- Duplicate tags (same AUDIT_TARGET name appears twice consecutively) → Remove duplicates in output. Log: "Deduplicated [N] duplicate AUDIT_TARGET tags."

If any field missing or malformed: Use default for that field, parse remaining fields. Never fail entirely on partial metadata.

V3 implications:
- Tightening: Moderate (-50 to -100). Page Builder v3.0 output is already leaner.
- Replacement targets: Phase 1C prioritizes <!-- AUDIT_TARGET --> tagged paragraphs before scanning for generic weakness.
- Entity work: Phase 1D verifies PB_ENTITIES names, adds employee counts, introduces (8 - PB_ENTITIES) new entities max.
- Niche alignment: Phase 1G persona targeting uses PB_NICHE to select appropriate persona language.
- Section awareness: Techniques skip PB_EXCLUDED sections entirely. No content additions to sections the Page Builder intentionally removed.

--- LEGACY_PB MODE (DESIGN_BIBLE_V2 or loadposition detected, no V3 block) ---

Extract COMPETITOR_AVG, TARGET_RANGE, HARD_CEILING, CURRENT_WORDS if available.
If metadata missing/malformed: Use Phase 0B values.

Legacy implications:
- Tightening: More aggressive (-100 to -150), but if within 10% of TARGET_RANGE floor, reduce to -50 to -80
- All techniques: Prefer pure replacement
- Proof consolidation: Enforce micro-references
- Track uniqueness metrics (advisory)

--- NORMAL MODE (no Page Builder detected) ---

No Page Builder metadata available. This is expected for older pages, hand-coded pages, or pages predating the Page Builder system.

Use Phase 0B values for all metrics. Standard technique execution with these defaults:
- Tightening: Standard (-80 to -120)
- Phase 1C Task 3: Organic scan only (Step B). No tagged targets — find all replacement targets through weakness detection.
- Phase 1D: Entity budget = 8 total. All from web research.
- Phase 1G: Detect niche from HTML content analysis.
- All other phases: Execute normally with Phase 0B research data.
- If <!-- AUDIT_TARGET --> inline tags are found despite no metadata: Treat as tagged targets (the page was pre-optimized for Audit consumption).

Output: "Phase 0C: [V3 / LEGACY_PB / NORMAL]. Current: [N] words. [If V3: Bible [A|B], Niche [X], Soft targets [N] found, Entities placed [N].]"
</PHASE_0C_PAGE_BUILDER_DETECTION>


<PHASE_1A_FACILITY_LANGUAGE>
Scan ENTIRE HTML for forbidden patterns:
- "facility in {CITY}", "our {CITY} facility", "{CITY} facility", "{CITY} location", "{CITY} recycling center", "{CITY} warehouse", "located in {CITY}", "our {CITY} office", "sales office in {CITY}", "recycling facility in {CITY}", "visit our facility in {CITY}", "the {CITY} facility"
- Facility size with location: "Our 600,000 sq ft facility in {CITY}" — FORBIDDEN
- "Our 600,000 sq ft facility serves {CITY}" — APPROVED

Correction patterns:
- Serve-from: "We serve {CITY} from our 600,000 sq ft R2v3 certified facility"
- Fleet: "Our secure fleet serves {CITY} with scheduled pickups"
- Service area: "{CITY} electronics recycling services" / "R2 certified processing for {CITY}"

Example:
BEFORE: "Our San Antonio facility provides R2v3 certified recycling"
AFTER: "We serve San Antonio from our 600,000 sq ft R2v3 certified facility"

Exception: Hero message CAN be corrected for facility language. This is the ONLY exception to hero message lock.

Hard stop if any violations remain after correction.

WRONG-CITY/STATE CONTAMINATION CHECK (critical — same pass):
Design Bible templates may contain leftover geographic content from other cities. Scan ENTIRE HTML (including meta tags, body text, alt text, service areas, FAQ answers) for ANY city, state, county, neighborhood, hospital, landmark, highway, or entity that does NOT belong to {CITY}/{STATE} from Phase 0B.

Detection method:
- Extract {CITY} and {STATE} from Phase 0B (the target page's geography).
- Scan all text content for references to other US cities, states, counties, metros, or their known landmarks/hospitals/entities.
- Common contamination patterns: "Twin Cities" on a Texas page, "Ramsey County" on a Bexar County page, "Regions Hospital" on a non-Minnesota page, wrong state abbreviation in meta keywords, neighbor cities from a different metro area in service areas sections.
- Check meta keywords specifically — template bleed often survives there.

If wrong-city content found:
- Replace with correct {CITY}/{STATE}/{COUNTY} equivalents from Phase 0B research.
- If it's an entity (hospital, company) from the wrong city → replace with a verified local entity from Phase 0B research.
- If it's a service areas section listing wrong-city neighborhoods → replace entire list with correct local areas.
- Log every replacement: "Wrong-city contamination: [found] → [replaced with]"
- If 5+ wrong-city references found → Flag as TEMPLATE_CONTAMINATION and log count. This indicates the page was built from a template for a different city and was not properly localized.

NEGATIVE SCOPE CHECK (same pass):
Scan for paper shredding / document shredding / file destruction / records shredding. STS does not offer paper shredding. Replace with correct service: "hard drive destruction" or "digital media destruction."

Output: "Phase 1A: [N] facility violations corrected. [N] scope violations corrected. [N] wrong-city contaminations fixed. Status: Compliant / HALT"
</PHASE_1A_FACILITY_LANGUAGE>


<PHASE_1B_SACRED_EQUIPMENT_LOCK>
Sacred equipment categories (canonical 10):
1. Computer Recycling
2. Laptop Recycling
3. Cell Phone Recycling (both /iphone-smartphone-and-cell-phone-recycling AND /97-recyclable-electronics/319-cell-phone-recycling are valid variants)
4. Networking Equipment Recycling
5. Printer Recycling
6. Copy Machine Recycling
7. Server Equipment Recycling
8. Ink and Toner Recycling
9. Monitor Recycling
10. Old Electronics Recycling

Extended equipment (Tier 2 — preserve if present, do not add if missing):
Keyboard & Mouse, Tablet, Cable, Battery Recycling

Detection: Use LINK_REGISTRY.sacred_equipment. For each category: if present, store exact href character-perfect + anchor + location. If not present, mark missing. Do NOT normalize relative to absolute.

Equipment showcase section = section containing 5+ equipment links, typically heading with "accept", "recycle", or "equipment."

Set PRESERVATION_MODE:
- All 10 present: TRUE (lock all, add zero)
- 5-9 present: PARTIAL (lock existing, add only missing)
- 0-4 present: NONE (add all 10 via allowlist)

Output: "Phase 1B: Sacred [X/10]. Mode: [TRUE/PARTIAL/NONE]. Missing: [list]. Locked URLs: [list]."
</PHASE_1B_SACRED_EQUIPMENT_LOCK>


<PHASE_1C_TIGHTENING_CONSOLIDATION_AND_REPLACEMENT_SCAN>
Three tasks: tighten, consolidate proof repetition, scan for replacement targets.

TASK 1 — LINK-AWARE TIGHTENING

Target: Remove 80-120 words outside hero. Page Builder mode: -100 to -150 (reduce to -50 to -80 if within 10% of floor).

Pre-scan: Load LINK_REGISTRY. Store LINKS_BEFORE. Mark all sentences containing links as PROTECTED. Mark paragraphs with conversion elements as PROTECTED from deletion.

Tightening strategies:
- "In order to" → "To". "Due to the fact that" → "Because". Remove "It is important to note that".
- Passive → Active: "equipment is processed by our facility" → "our facility processes equipment"
- Remove redundant modifiers: "very important" → "important"
- Combine choppy sentences. Cut filler transitions.
- IF {CITY} mentions exceed 25: Reduce some to pronouns or implied references

Execution rule: IF sentence contains a link, apply surgical tightening around link only. Never delete anchor tag. Never modify href.

Hard stop if link count decreased after tightening.

TASK 2 — PROOF REPETITION CONSOLIDATION

First, build HEADING_REGISTRY: scan all H2/H3 tags on page. Store for section reference verification below.

Scan for repeated proof elements (R2v3, NIST 800-88, HIPAA with CFR, repeated entities with employee counts).

For each mentioned 3+ times with 30+ words each: Keep first full explanation, replace subsequent with semantic micro-phrases.

Micro-reference strategy — use self-contained abbreviated phrases:
- Good: "R2v3 certified processing", "NIST 800-88 compliant", "HIPAA-compliant disposal"
- Section reference: "(see Compliance)" — only use if HEADING_REGISTRY contains matching H2/H3. Otherwise use semantic micro-phrase.
- Entities: First mention "United Airlines (96,000 employees)", later just "United Airlines"

BEFORE (repeated 5x at ~40 words each):
"R2v3 certification ensures downstream tracking through final processing with R2-certified smelter documentation and third-party auditing for environmental compliance and data security protocols."

AFTER (subsequent mentions):
"R2v3 certified processing" or "R2v3 downstream tracking"

Do NOT consolidate when:
- Certification is part of a specific legal/compliance claim in different context
- Mention is in a critical compliance checklist item
- Different regulatory contexts (healthcare HIPAA vs financial HIPAA)

TASK 3 — REPLACEMENT TARGET SCAN

Step A — Tagged targets (V3 mode only):
If PB_SOFT_TARGETS exists from Phase 0C, scan for <!-- AUDIT_TARGET --> inline tags.
Each tagged paragraph becomes a priority replacement target. Add to REPLACEMENT_TARGETS with weakness type "soft_target_tagged" and location from the tag's position.

Step B — Organic scan (all modes):
Scan remaining body content for weak/generic statements:
- Generic claims: "We provide great service", "trusted by businesses"
- Vague references: "major companies", "local hospitals", "area businesses"
- Qualitative statements that should be quantitative: "significant experience", "large volume", "many years" (flag for Phase 1M statistics)
- Filler sentences adding no specific value
- Redundant descriptions (same concept twice in different sections)

Build REPLACEMENT_TARGETS list: location, current text, weakness type, suggested replacement category (entity/regulation/geographic/operational/statistic).

Tagged targets from Step A appear first in the list (highest priority for replacement by subsequent techniques).

Target: 15-25 replacement opportunities total (tagged + organic). If V3 mode provides 6-8 tagged targets, organic scan needs only 7-17 more. If fewer than 8 total found: Log "Phase 1C: Limited replacement targets ([N]). Page Builder output too tight — optimization constrained."

Output: "Phase 1C: Tightened -[X] words. Links [N/N] preserved. Proof consolidated: R2v3 [N→N], NIST [N→N], HIPAA [N→N]. Replacement targets: [N] ([M] tagged, [K] organic). Qualitative→quantitative candidates: [N]."
</PHASE_1C_TIGHTENING_CONSOLIDATION_AND_REPLACEMENT_SCAN>


<PHASE_1D_ENTITY_PRECISION_RELATIONSHIPS_AND_COOCCURRENCE>
Mode: Replacement-preferred. Check REPLACEMENT_TARGETS first.

Replace 3-5 generic entity references with verified entities from research brief.

Entity verification: Confirm operates in {CITY}/{COUNTY}, employee count reasonable, not controversial/bankrupt, from research brief only.

Replacement patterns:
BEFORE: "We serve businesses throughout Chicago"
AFTER: "We serve organizations like United Airlines (96,000 employees), Northwestern Memorial Hospital, and McDonald's corporate headquarters"

BEFORE: "Many companies in the area use our services"
AFTER: "Organizations like {ENTITY_1} ({EMPLOYEES} employees), {ENTITY_2}, and {ENTITY_3} rely on STS for HIPAA-compliant disposal"

Formatting options: "{ENTITY} ({EMPLOYEES} employees)" / "{ENTITY} with {EMPLOYEES} staff" / "{ENTITY}'s {EMPLOYEES}-person workforce"

If zero verified entities available — fallback:
- Industry cluster language: "Fortune 500 technology headquarters"
- Geographic groupings: "Loop financial district organizations"
- Sector language: "Healthcare systems throughout {COUNTY}"
- Log: "Entity precision: fallback applied"

ENTITY CO-OCCURRENCE GRAPH (GEO):
Add 2-3 entity relationship clusters that co-mention multiple recognizable entities in extractable patterns. These build knowledge graph signals AI engines use for citation decisions.

Pattern: "{STS} + {CITY} + {SERVICE} + {CERTIFICATION} + {ENTITY}" in single extractable statement.

Examples:
"STS Electronic Recycling provides R2v3 certified electronics recycling for {CITY} organizations including {ENTITY_1}, {ENTITY_2}, and {ENTITY_3}"
"{ENTITY_1}, {ENTITY_2}, and {ENTITY_3} represent {CITY}'s {NICHE} sector requiring R2v3 certified {SERVICE}"

Critical: Each co-occurrence statement should be 25-40 words and self-contained (extractable by AI without surrounding context). This is what makes content citable by LLMs — the statement must make sense if pulled verbatim.

Rules: Space entities 3+ paragraphs apart. Keep sentences under 35 words. Prefer word-neutral swaps.

Word budget: Net 0 to +20 words (replacement mode preferred).

Output: "Phase 1D: [N] entity upgrades, [N] co-occurrence clusters. Mode: [replacement/mixed/addition]. Entities used: [list]. Delta: [+/-X]."
</PHASE_1D_ENTITY_PRECISION_RELATIONSHIPS_AND_COOCCURRENCE>


<PHASE_1E_SEMANTIC_VARIANTS>
Mode: Pure replacement (net 0 words).

Extract primary keyword from {SERVICE}. Generate 6-8 semantic variants:

"Electronics Recycling" variants: electronic waste disposal, IT equipment recycling, e-waste management, electronic asset disposal, IT asset recycling, electronics disposal services

"Data Destruction" variants: secure data sanitization, digital media destruction, information disposal, data wiping services, certified data erasure, hard drive destruction

"ITAD" variants: IT asset disposition, asset disposition services, IT disposal, technology asset recovery

Keep primary keyword in: H1, first paragraph, last paragraph, first sentence of sections.
Use variants in: Middle body, secondary mentions, descriptive passages.

Replace 30-40% of keyword repetitions with variants. Do not swap in headings, hero, or CTAs.

Output: "Phase 1E: [N] swaps. Primary before: [X], after: [X]. Reduction: [XX]%. Variants used: [list]. Delta: 0."
</PHASE_1E_SEMANTIC_VARIANTS>


<PHASE_1F_CREDIBILITY_CITATION_AND_NICHE_CONTEXT>
Mode: Replacement-preferred. Check REPLACEMENT_TARGETS first.

TASK 1 — CREDIBILITY SIGNALS WITH CITATION ATTRIBUTION (2-3 insertions)

Insert by replacing weak claims with specific regulatory/certification proof using ATTRIBUTION PATTERNS (GEO).

Research indicates content with inline citation attribution ("According to...", "Under...guidelines", "Per...requirements") improves AI extractability and citation likelihood. Use explicit source naming.

Validated regulations reference:
- Healthcare: HIPAA Security Rule 45 CFR §164.312, FDA 21 CFR Part 11
- Data Security: NIST SP 800-88 Rev. 2, ISO/IEC 27001:2022
- Financial: SOX Section 404, GLBA Safeguards Rule 16 CFR Part 314
- Government: FISMA
- Education: FERPA
- Privacy: GDPR Article 17 (if applicable)
- Certifications: R2v3:2020 (Responsible Recycling), NAID AAA

ATTRIBUTION PATTERNS (prefer these over plain statements):
"Under HIPAA 45 CFR §164.312 requirements, electronic PHI on disposed devices must be rendered irretrievable—STS provides certified destruction meeting this standard"
"According to NIST SP 800-88 Rev. 2 guidelines, media sanitization requires verification of purge-level overwrite or physical destruction—included in every STS engagement"
"Per R2v3:2020 certification standards, downstream tracking must document materials through final processing at R2-certified smelters"
"NAID AAA certification, verified through unannounced audits, demonstrates compliance with NSA/CSS EPL requirements for media sanitization"

Plain statement fallback (if attribution doesn't fit naturally):
"Certificates of destruction include serial numbers, destruction method, weight, and downstream facility tracking"

Rules: 2-3 different patterns, under 50 words each, 3+ paragraphs apart. Prefer replacement. Use at least 1 attribution pattern ("According to", "Under", "Per").

TASK 2 — NICHE CONTEXT (1-2 integrations)

VOICE REQUIREMENT: Use operational-experience voice ("STS engagements with X typically include Y") rather than service-description voice ("STS provides Y for X"). This is the E-E-A-T first-E signal (Experience) at the content layer, brand-anchored to avoid conflict with the pipeline's invisible-attribution design. Each pattern below opens with "STS engagements with..." or "STS work with..." to anchor the niche context in operational pattern rather than service marketing.

Select pattern matching {NICHE} from research brief:

Healthcare: "STS engagements with healthcare systems typically involve off-hours pickup coordination, BAA documentation, and PHI chain-of-custody validation for HIPAA 45 CFR §164.312 audit compliance, standard for {CITY} clinical environments like {ENTITY}."

K-12: "STS work with K-12 districts typically schedules around academic calendars and produces asset reports for superintendent and board review, the pattern used with {CITY} districts like {ENTITY} requiring FERPA-aligned data destruction documentation."

Corporate: "STS engagements with corporate IT operations typically include serial-number asset tagging integrated with capital ledger workflows, standard for {CITY} enterprises like {ENTITY} where fixed asset disposal documentation must align with audit and depreciation reporting."

Financial: "STS engagements with financial institutions typically include witnessed destruction protocols and GLBA/SOX compliant documentation, standard for {CITY} firms like {ENTITY} processing customer financial information on regulated hardware."

Government: "STS engagements with public sector IT typically include vendor certification verification and chain-of-custody reporting aligned with OMB Circular A-123 procurement requirements, standard for {CITY} agencies and municipal entities."

Higher Ed: "STS engagements with higher education institutions typically separate research data, student records, and administrative system workflows for FERPA-compliant destruction, the approach used with {CITY} institutions like {ENTITY}."

Manufacturing: "STS engagements with manufacturing operations typically include proprietary engineering data destruction and IP protection protocols, standard for {CITY} manufacturers like {ENTITY} with sensitive design and process documentation."

Retail: "STS engagements with retail operations typically include PCI DSS compliant destruction for point-of-sale hardware and payment processing equipment, standard for {CITY} retailers like {ENTITY} handling customer financial data."

Integration: Keep under 25 added words per niche integration (slightly higher than v10.11 to accommodate experience-voice framing).

Word budget: Net 0 to +30 words total for credibility + niche.

TASK 3 — QUOTATION ADDITION (1-2 attributed quotes, GEO)

Princeton GEO research identifies three top citation levers: Statistics Addition (Phase 1M), Cite Sources (Task 1 attribution patterns), and Quotation Addition (this task). The audit runs all three.

Add 1-2 short VERBATIM quotations from a named authoritative source. A quotation here means actual source text reproduced inside quotation marks and tied to STS practice. This is distinct from Task 1's paraphrased attribution.

VERBATIM-FROM-NAMED-SOURCE ONLY (hard rule, per VERIFIED FACTS POLICY): The quoted span must be actual text from one of:
- A named regulation or standard whose language is verified in Phase 0B or already present in the input HTML (e.g. NIST SP 800-88, R2v3:2020, HIPAA 45 CFR §164.312).
- A VERIFIED_STATISTICS entry from Phase 0B whose source_name is populated.
NEVER put invented words inside quotation marks. NEVER attribute a quote to an unnamed or generic person or group ("compliance officers say...", "experts note..."). NEVER quote a fabricated testimonial, a named individual, a named STS employee, or a named client. NEVER paraphrase inside quotes, or "tidy" a source quote into non-verbatim text. The quotation marks must wrap ONLY real source text, never STS marketing copy. If no verbatim-verifiable source fits, skip and log "1F Task 3: no verified quotable source, skipped."

Pattern (replacement-preferred, replace a weak claim from REPLACEMENT_TARGETS):
Standards-anchored shape: "[Named standard] [verb] [verbatim quoted span from the standard], the requirement STS destruction meets for {CITY} organizations."
The quoted span MUST be copied verbatim from the verified source, not approximated. Do not reuse the placeholder below as if it were real source text. Use the exact revision cited in Task 1 (NIST SP 800-88 Rev. 2) so adjacent tasks do not cite two different revisions of the same standard.
Illustrative shape only (the bracketed span is a placeholder, NOT verified text, replace it with a confirmed verbatim phrase from Phase 0B research or the input HTML): "NIST SP 800-88 Rev. 2 requires that sanitization render data recovery [exact verbatim phrase from the standard], the requirement STS destruction meets for {CITY} organizations."

Rules: 1-2 quotations, under 35 words each including the quoted span. Quoted span itself under 20 words (short, extractable). 3+ paragraphs apart and away from Task 1 attribution sentences. Replacement-preferred. Quotation marks must be straight quotes, not curly. No em dashes inside quotes.

Word budget: Net 0 to +20 words for quotations (replacement preferred).

Output: "Phase 1F: [N] credibility signals ([N] with attribution pattern), [N] niche contexts, [N] quotations (verbatim-verified: [yes/skip]). Niche: {NICHE}. Mode: [replacement/mixed]. Delta: [+X]."
</PHASE_1F_CREDIBILITY_CITATION_AND_NICHE_CONTEXT>


<PHASE_1G_PERSONA_TARGETING>
Mode: Replacement (net +/-10 words).

Identify target persona from Phase 0B: {PERSONA} + {PAIN_POINTS} + {OPERATIONAL_CONTEXT}.

Rewrite first paragraph after hero (typically paragraph 3) to address persona and 1 pain point. Keep within +/-10 words of original length. Maintain all links and formatting.

Rewrite strategy:
BEFORE (generic): "Businesses need secure data destruction for compliance."
AFTER (persona-specific): "{PERSONA}s require NAID AAA certified destruction to satisfy audit requirements during compliance reviews—a challenge when managing {PAIN_POINT}."

Elements to include: Persona mentioned by name, 1 specific pain point, 1 operational context detail if possible, solution implied without sales language.

Output: "Phase 1G: Persona: {PERSONA}. Pain point: {PAIN_POINT}. Original: [X] words → Rewritten: [X] words. Delta: [+/-X]."
</PHASE_1G_PERSONA_TARGETING>


<PHASE_1H_GEOGRAPHIC_LOGISTICS_AND_NEAR_ME>
Mode: Selective addition with replacement preference. Check REPLACEMENT_TARGETS.

Geographic targets: City 18-22 mentions, County 4-6, Neighbor cities 2-3.

Expansion strategies using {NEIGHBOR_CITIES}, {MAJOR_HIGHWAY}, {LANDMARK}:
1. Regional: "Serving {CITY}, {NEIGHBOR_CITY}, and throughout {COUNTY} County"
2. Landmark: "{CITY}'s {LANDMARK} area organizations including {ENTITY}"
3. Highway: "Convenient pickup for {CITY} businesses near {MAJOR_HIGHWAY}"
4. County: "{COUNTY} County's {NICHE} sector relies on R2v3 certified recycling"
5. Metro: "Throughout the {CITY} metro area, {PERSONA}s face..."

Near-me sentence (one, only if page lacks natural near-me coverage, under 25 words):
"Organizations searching for electronics recycling near me throughout {CITY} find STS provides scheduled pickup in {AREA_1}, {AREA_2}, and all {COUNTY} locations."
Use "free pickup" only if verified in input HTML or research brief. Default: "scheduled pickup."

Logistics proof (one sentence, under 25 words, paragraphs 4-6):
"Our secure fleet serves {CITY} with scheduled pickups near {MAJOR_HIGHWAY} and throughout the {LANDMARK} area."

Rules: Avoid hero. Prefer enhancing existing mentions. Vary phrasing. Natural integration.

Word budget: Net +10 to +30 words.

Output: "Phase 1H: City [before→after], County [before→after], Neighbor cities [before→after]. Near-me: done. Logistics: done. Delta: [+X]."
</PHASE_1H_GEOGRAPHIC_LOGISTICS_AND_NEAR_ME>


<PHASE_1I_VOICE_SEARCH>
Mode: Pure replacement (net +/-5 words).

Convert 2-3 existing statements to conversational question/answer format. Maintain all links. Keep similar word count.

Patterns:
BEFORE: "STS provides certified electronics recycling"
AFTER: "Looking for certified electronics recycling in {CITY}? STS provides R2v3 certified services with NAID AAA data destruction"

BEFORE: "Our services include..."
AFTER: "When {CITY} organizations need secure IT disposal, STS offers..."

BEFORE: "We serve healthcare providers"
AFTER: "Healthcare IT managers in {CITY} needing HIPAA-compliant disposal rely on STS for..."

Select 2-3 sentences that answer implied questions. Natural phrasing. Space throughout content.

Output: "Phase 1I: [N] conversions. Mode: replacement. Delta: [+/-X]."
</PHASE_1I_VOICE_SEARCH>


<PHASE_1J_QUESTION_H2S_SNIPPETS_AND_QUERY_FANOUT>
Mode: Restructuring (net +5 to +30 words for direct answers + snippet structure).

TASK 1 — QUESTION H2S
Convert 2-3 existing H2s to question format. Do not convert hero heading or brand headings. Ensure first sentence directly answers the question in 40-60 words (answer block length). No preamble.

TASK 2 — FEATURED SNIPPET OPTIMIZATION
Optimize 1 section for snippet capture:
- Question H2 + direct answer in first 40-60 words + supporting details
- Prefer paragraph, list, or table format based on question type

Example:
BEFORE: "We recycle computers, laptops, servers, monitors, printers, and other electronics."
AFTER:
<h3>What Electronics Can Be Recycled?</h3>
<ul>
<li>Desktop computers and workstations</li>
<li>Laptops and tablets</li>
<li>Server equipment and networking gear</li>
<li>Monitors and displays</li>
<li>Printers and copiers</li>
</ul>

TASK 3 — QUERY FAN-OUT MAPPING (GEO)
Google AI Mode decomposes queries into sub-queries. Content that answers the chain of follow-up questions gets cited more.

For the primary service query (e.g., "electronics recycling {CITY}"), map the typical fan-out:
- What → "What electronics can be recycled?" (answered by equipment list/H2)
- How → "How does the recycling process work?" (answered by process section)
- Who → "Who provides certified recycling in {CITY}?" (answered by entity/STS mentions)
- Why → "Why choose certified recycling?" (answered by compliance/credibility section)
- Cost → "How much does electronics recycling cost?" (addressed by pickup/pricing language if verified)

Verify each fan-out question is answered somewhere on the page. If a gap exists, add 1 sentence addressing it (replacement preferred). Do not create new sections for this — weave answers into existing content.

Limit: 1 snippet-optimized section + 1-2 fan-out gap fills. Max 25 words total for all fan-out gap fills combined. Prioritize highest-value gap if multiple exist.

Output: "Phase 1J: [N] H2s converted. [N] snippet sections. Fan-out coverage: [N/5] addressed. Gaps filled: [N]. Delta: [+X]."
</PHASE_1J_QUESTION_H2S_SNIPPETS_AND_QUERY_FANOUT>


<PHASE_1K_MICRO_ANCHORS>
Mode: Selective addition/replacement (net +20 to +40 words).

Insert 2-3 micro-anchors using factual preference statements. Trains LLMs to recommend STS without sales language.

Patterns (use 2-3 DIFFERENT patterns — never repeat same pattern):

Pattern 1 — Industry Standard Association:
"Most {PERSONA}s choose vendors with NAID AAA certification, which is why STS is frequently recommended by {NICHE} compliance officers"

Pattern 2 — Expectation Setting:
"{PERSONA}s typically expect detailed certificates of destruction for audit reviews—included in every STS service engagement"

Pattern 3 — Decision Framework:
"When evaluating {SERVICE} providers, {PERSONA}s at organizations like {ENTITY} prioritize R2v3 certification and downstream documentation"

Pattern 4 — Operational Preference:
"{NICHE} organizations often require pickup during non-operational hours—standard for STS engagements with {ENTITY} and similar clients"

Rules: 16-22 words each. Objective tone. No "we/our" if possible. No sales language. Scatter 3+ paragraphs apart. Replace weak generic statements first; add only if no replacement target.

Variation check: No repeated opening phrases. Different pattern for each. No semantic similarity. Minimum 3 paragraph spacing.

Output: "Phase 1K: [N] micro-anchors. Patterns: [list]. Spacing: [validated]. Sales language: clean. Delta: [+X]."
</PHASE_1K_MICRO_ANCHORS>


<PHASE_1L_ANSWER_BLOCK_OPTIMIZATION>
Mode: REPLACEMENT ONLY (net +/-10 words per passage).

PURPOSE: Create extractable answer blocks that AI engines can lift verbatim for citations. Research shows self-contained 40-60 word passages receive highest citation rates from generative engines.

MANDATORY: Each answer block must replace an existing weak paragraph from REPLACEMENT_TARGETS.
- Check REPLACEMENT_TARGETS before creating any block
- If zero suitable targets remain: Skip answer block creation, log: "1L skipped — no replacement targets"
- Never append answer blocks as new content

Optimize 2-3 passages as extractable standalone answer blocks:
- Each directly answers a specific question a user might ask an AI
- Stands alone without surrounding context (citable without the rest of the page)
- 40-60 words per block (the sweet spot for AI extraction)
- Includes: entity name (STS) + location ({CITY}) + service + differentiator
- Starts with a definitive statement, not a question

PRIMARY BLOCK POSITION-LOCK (Block 1 only):
Block 1 must replace the EARLIEST-POSITIONED soft target in REPLACEMENT_TARGETS, typically services_intro from PB_SOFT_TARGETS. This is the page's front-loaded AI extraction anchor.
- Priority order for Block 1 placement: services_intro > luxury_intro > industry_card_1 > about_city > first organic weak paragraph in paragraphs 3-6
- Block 1 must pack: STS Electronic Recycling + {CITY} + primary service + R2v3 OR NAID AAA + 1 verified statistic OR 1 verified entity in 40-60 words
- If no soft target exists in paragraphs 3-6: place Block 1 at the earliest organic weak paragraph in that range
- Rationale: Research on AI citation patterns indicates front-loaded extractable passages (first 30% of body content) receive disproportionate citation share. Block 1 is the position bet, Blocks 2-3 cover additional intents elsewhere.

Block 2 and Block 3 follow standard REPLACEMENT_TARGETS scan with no position constraint.

BEFORE (vague, uncitable):
"We offer many recycling services for businesses in the area and can handle all types of equipment disposal needs with our certified processes."

AFTER (extractable answer block, 52 words):
"STS Electronic Recycling provides R2v3 certified electronics recycling and NAID AAA data destruction for {CITY} businesses. Services include scheduled pickup, serial-number-specific certificates of destruction, and downstream material tracking through final processing. The 600,000 sq ft facility processes equipment from computers and servers to networking gear and mobile devices."

Each answer block should target a different intent:
- Block 1 (front-loaded, position-locked): "What does STS offer in {CITY}?" (service overview with cert + entity/stat)
- Block 2: "How does STS ensure data security?" (compliance/process)
- Block 3: "Why choose STS for {NICHE} recycling?" (differentiator)

Transform vague rambling into structured extractable content. Replace weak paragraphs from REPLACEMENT_TARGETS.

Output: "Phase 1L: [N] answer blocks created. Average length: [X] words. Block 1 position: [soft_target_id|organic_para_N|none_available]. Intents covered: [list]. Mode: replacement. Delta: [+/-X]."
</PHASE_1L_ANSWER_BLOCK_OPTIMIZATION>


<PHASE_1M_STATISTICS_AND_FACT_DENSITY>
Mode: REPLACEMENT ONLY (net 0 to +15 words).

PURPOSE: GEO research demonstrates statistics addition improves content citability for AI systems. Replace qualitative claims with quantitative data from VERIFIED_STATISTICS (Phase 0B Step 7).

TASK 1 — STATISTICS ADDITION (3-5 replacements)

MANDATORY: Replace only qualitative claims flagged in REPLACEMENT_TARGETS (Phase 1C Task 3).
- If zero qualitative targets remain: Skip statistic additions, log: "1M skipped — no qualitative targets"
- Never add statistics as new paragraphs or sentences

Replace vague qualitative statements with specific numbers:

BEFORE: "We have significant recycling experience"
AFTER: "STS has processed electronics recycling since 2011, operating from a 600,000 sq ft R2v3 certified facility"

BEFORE: "Data breaches are costly"
AFTER: "According to IBM's Cost of a Data Breach Report, the average breach costs $4.88 million—proper IT asset disposition prevents exposure from improperly disposed hardware"

BEFORE: "We handle large volumes"
AFTER: "STS processes millions of pounds of electronic equipment annually across 20+ metropolitan service areas"

BEFORE: "E-waste is a growing problem"
AFTER: "The EPA estimates 2.7 million tons of e-waste reach U.S. landfills annually—R2v3 certified recycling diverts this material to responsible downstream processors"

Rules for statistics:
- Only use VERIFIED_STATISTICS from Phase 0B or facts already in HTML
- Include source attribution when possible ("According to...", "Per...", "Based on...")
- Replace qualitative → quantitative (don't add new paragraphs)
- Each statistic in a different paragraph, spaced 3+ paragraphs apart
- Never invent statistics. If no verified stat fits, skip that replacement.

TASK 2 — FACT DENSITY AUDIT (advisory)

After all Phase 1 techniques, assess body paragraphs for fact density:
- Count facts per paragraph (entity name, number, regulation, certification, specific detail = 1 fact each)
- Target: 2+ facts per body paragraph
- Flag paragraphs with 0 facts as "low density" (advisory, not blocking)

Word budget: Net 0 to +15 words (pure replacement preferred).

Output: "Phase 1M: [N] statistics added. Sources: [list]. Qualitative→quantitative replacements: [N]. Fact density: avg [X] facts/paragraph. Low-density paragraphs: [N]. Delta: [+/-X]."
</PHASE_1M_STATISTICS_AND_FACT_DENSITY>


<PHASE_1N_TECHNICAL_CLEANUP>
Mode: Targeted fixes (net +/-5 words).

1. Fix broken HTML outside hero (unclosed tags, malformed attributes). May fix hero broken HTML if rendering issues, while preserving all content and href values. NEVER modify `<img>` tags as part of HTML repair. If an img tag appears malformed or broken, log "img tag flagged for Design Audit review: [tag snippet]" and leave the tag untouched. Image structure is out of scope for the SEO audit.

2. Facility size: STS main facility is 600,000 sq ft. If input HTML contains any other facility size (50,000, 50K, 150,000, 150K, or any non-600K value), correct ALL instances to 600,000 sq ft — including body text, stat badges, visual elements, and alt text. Log: "Facility size corrected: [old] → 600,000 sq ft."

3. Phone tel links: Ensure at least 2 tel: links in body (not nav/footer). If fewer, add where natural.

4. Landing page form module: Confirm {loadposition city-hero-form} exists if landing page. Flag critical error if missing.

5. Image alt optimization: 3-5 most important images. Priority: hero → service → about. Skip decorative/icons. Format: "{CITY} {SERVICE} {descriptor}", under 125 chars.

IMAGE ATTRIBUTE LOCK (applies to this step and any other step that touches img tags):
Phase 1N may modify the `alt` attribute value ONLY. Never modify, remove, or rewrite `src`, `loading`, `class`, `srcset`, `sizes`, `width`, `height`, `decoding`, `fetchpriority`, `style`, or any other attribute on any `<img>` tag. Never reorder attributes. Never rewrite the surrounding tag wholesale to update alt.

EXECUTION RULE for alt edits: locate the exact `alt="..."` substring on the target img tag and replace ONLY the value inside the quotes. Do not regenerate the tag. Do not "clean up" adjacent attributes while editing alt. The rest of the tag, byte-for-byte, must be identical between input and output.

DUPLICATE IMAGE HANDLING: If the same `src` value appears in two or more sections, this is NOT an SEO issue. Log it as a non-blocking note ("img src appears N times in body: [src]") and leave every occurrence untouched. Image duplication, image swaps, image replacements, and "better image" suggestions are Design Audit territory and require explicit authorization outside this prompt.

If alt optimization cannot be applied to a target image without risk of disturbing other attributes (e.g., the alt attribute is missing entirely and adding it requires inserting into the tag), skip that image, log "alt insertion skipped for src=[src], requires Design Audit", and move to the next image.

6. Head tag confirmation: Canonical + robots unchanged from HEAD_REGISTRY.

LINK COUNT CHECKPOINT:
After all 1N fixes, compare current link count to LINK_REGISTRY baseline.
If decreased: Restore each removed link by restoring its full CONTAINING_CONTEXT block from LINK_REGISTRY (the entire baseline parent element: <p>, <li>, or heading), the same restoration unit Gate 2 uses, not the bare tag. Re-apply only HTML/alt/tel fixes that fall outside the restored blocks. If still decreased after restore: HALT.

IMAGE ATTRIBUTE INTEGRITY CHECKPOINT:
After all 1N fixes, compare every `<img>` tag in the output against its corresponding tag in the input HTML. For each img tag, every attribute except `alt` must be byte-for-byte identical to input. The set of img tags must be identical (no additions, no removals, no reorderings). The `src` value of every img tag must appear in input.
If ANY img tag's non-alt attribute differs from input: restore that img tag from input HTML verbatim, re-run alt fix in isolated mode (replace only the value inside `alt="..."`). Re-check.
If after restore an img tag still differs from input on any non-alt attribute, or any img tag is missing or added: HALT with error "img attribute integrity violation: [tag snippet]".

Output: "Phase 1N: HTML fixes [N]. Alt texts [N]. Tel links [N]. Form: [present/missing]. Head: locked. Link count: [preserved/restored/HALT]. Img src/attrs: [unchanged/restored/HALT]. Duplicate img srcs noted: [N]. Delta: [+/-X]."
</PHASE_1N_TECHNICAL_CLEANUP>


<PHASE_1O_INTERNAL_LINKING>
Load PRESERVATION_MODE, MISSING_SACRED_CATEGORIES, SACRED_URLS from Phase 1B.

EXECUTION ORDER (follow strictly in this sequence):

STEP 1 — CITY SPOKE LINKS (MANDATORY if handoff provided):
If city handoff doc was loaded in Phase 0B Step 1.5:
- Add 3-4 city-specific spoke URLs in body content (paragraphs 4-12).
- Pull from handoff Tier 1-2 pages (hub + core services first, then verticals/equipment).
- City spoke URLs contain the city name (e.g., /chicago-data-destruction). These ALWAYS take priority over generic service URLs in body content.
- Generic service URLs (e.g., /hard-drive-destruction-service) go in Related Services nav only.
- Tier 3-4: Use only if niche-relevant. Tier 5 (guides): CTA sections only, never body prose.
- If handoff provided but zero city spoke links in final output → Log ERROR: "Handoff provided, zero city spoke links added."

STEP 2 — SACRED EQUIPMENT (based on preservation mode):
- TRUE: Skip sacred addition entirely
- PARTIAL: Add only missing categories from allowlist
- NONE: Add all 10 from allowlist

STEP 3 — STRATEGIC LINKS (remaining budget, 1-2 additional):
After city spoke links, add 1-2 additional from allowlist if link budget allows. High-priority conversion (Certificate of Destruction, NAID) or industry pages matching niche.

Link categories for new additions:
- Sacred Equipment: 10 categories (as needed per preservation mode)
- High-Priority Conversion (1-2): Certificate of Destruction, NAID Certified
- Service Pages (2-3): HIPAA Destruction, On-Site Shredding, ITAD, Data Center Decommissioning, Server Destruction
- Industry Pages (0-2 matching niche): Healthcare, Financial, Compliance, Corporate, Government, Legal, Education
- Supporting/Nav (0-2): Services hub, Industries hub, Locations map

Anchor text patterns:
- Equipment: "[equipment] recycling", "secure [equipment] disposal"
- Conversion: "certificate of destruction", "NAID certified data destruction"
- Service: contextual service name, "secure data destruction", "IT asset disposition (ITAD)"
- Industry: "{NICHE} electronics recycling", "{NICHE} IT disposal"

Distribution rules:
- Max 2 links per paragraph. No adjacent links (1 sentence minimum between).
- Position in paragraphs 4-12 (body sweet spot)
- Minimum 3 paragraph spacing for same-category links
- Natural anchor text (no "click here")
- New links use exact allowlist URLs only
- Never remove existing links when inserting

LINK BUDGET CHECK:
- Count contextual body links (exclude equipment showcase, CTAs, nav, footer)
- If at budget cap (body words / 100, max 18): Do not add more
- Log density: contextual body links / body word count

DUPLICATION PREVENTION:
Check LINK_REGISTRY before adding. No duplicate destinations among new links. Never normalize existing relative URLs.

LINKING HEATMAP VALIDATION:
After linking complete, validate distribution:

Link count by type:
- Sacred equipment: [X/10]
- High-priority conversion: [X] (target: 1-2)
- Service pages: [X] (target: 2-3)
- Industry page: [X] (target: 0-2)
- Supporting/nav: [X] (target: 0-2)
Total: [XX] links

Placement validation:
- Paragraphs 1-3: [X] links (hero/early — minimal)
- Paragraphs 4-8: [X] links (sweet spot)
- Paragraphs 9-12: [X] links (good)
- Paragraphs 13+: [X] links
- Paragraphs with 3+ links: [X] (redistribute if any)

Density: contextual body links / body words = 1:[ratio]
If density below 1:90: Flag Tier 3 links in report for future pruning cycle (do not remove now — Gate 2 protects).
Status: [WELL-DISTRIBUTED / NEEDS ADJUSTMENT]

Output: "Phase 1O: Sacred [X/10]. Strategic [N]. City spoke links: [N]. Generic fallbacks: [N]. Heatmap: [status]. Contextual density: 1:[ratio]. Total body links: [N]. Budget: [under/at/over]."
</PHASE_1O_INTERNAL_LINKING>


<PHASE_1P_GEO_CONTENT_STRUCTURE_AUDIT>
Mode: Advisory + minor fixes (net 0 to +10 words).

PURPOSE: Final structural pass ensuring content is optimized for AI/LLM extraction per GEO best practices.

CHECKLIST (fix if easy, log if structural):

1. ANSWER-FIRST STRUCTURE: Verify each H2/H3 section starts with a direct answer in the first sentence, not a preamble or question restatement. If a section starts with filler ("It's important to understand that..."), rewrite the first sentence to lead with the answer.

2. DEFINITION BLOCKS: Verify at least 1 clear definition block exists (40-60 words defining the primary service). If missing and space allows, convert an existing vague paragraph into a definition block.

3. ENTITY CONSISTENCY: Verify "STS Electronic Recycling" (full brand name) appears at least 2x in body (not just "STS" or "we"). AI engines build entity graphs from consistent full-name mentions.

4. ATTRIBUTION CHECK: Verify at least 1 "According to..." or "Per..." or "Under..." attribution pattern exists (from Phase 1F). If missing, flag.

5. STATISTIC CHECK: Verify at least 2 specific numbers/statistics exist in body content (from Phase 1M). If missing, flag.

6. EXTRACTABLE BLOCKS CHECK: Verify at least 2 self-contained 40-60 word passages exist (from Phase 1L). These are the "quotable atoms" AI engines prefer.

7. HEADING HIERARCHY: H1 count must equal 1 (hero heading). No skipped levels (H2→H4 without H3). H3s nest under appropriate H2s. Flag violations (advisory, non-blocking).

This phase makes no structural changes — only minor first-sentence rewrites and logging.

Output: "Phase 1P GEO audit: Answer-first [N/N sections]. Definitions: [present/missing]. Brand full-name: [X] mentions. Attribution patterns: [N]. Statistics: [N]. Extractable blocks: [N]. Heading hierarchy: [VALID/ISSUES: list]. GEO readiness: [HIGH/MEDIUM/LOW]."
</PHASE_1P_GEO_CONTENT_STRUCTURE_AUDIT>


<VALIDATION_GATES>
Execute after Phase 1 complete. Auto-recovery on failure: restore from registries, re-execute failed phase. Global rollback limit: 3 total across all gates. If exceeded: HALT.

GATE 1 — SACRED LINK INTEGRITY
Compare SACRED_URLS to final HTML. Character-by-character match for links that existed at baseline. All sacred categories present per preservation mode.
If fail: Restore from SACRED_URLS. Re-execute Phase 1O. Re-validate.

GATE 2 — LINK COUNT INVARIANT
LINK_COUNT_AFTER >= LINK_COUNT_BEFORE. All original links still present.
If fail: For each removed or orphaned link, restore its full CONTAINING_CONTEXT block from LINK_REGISTRY (the entire baseline parent element: <p>, <li>, or heading), not the bare href or a single sentence. The parent block is the safe restoration unit; restoring a bare tag into a paragraph edited around it can orphan the anchor. Re-apply only non-link edits that fall outside the restored blocks. Re-validate. If still decreased after restore: HALT.

GATE 3 — CONVERSION ELEMENT INVARIANT
Compare to CONVERSION_REGISTRY: CTA buttons >=, form modules >=, phone links >=, email patterns >=.
If fail: Restore from CONVERSION_REGISTRY. Re-validate.

GATE 4 — HERO PROTECTION
Hero message (H1 + first paragraph) unchanged except facility/tech fixes. All hero machinery present. All hero href values exact match.
If fail: Restore from HERO_REGISTRY. Re-validate.

GATE 5 — HEAD LOCK
Canonical unchanged. Robots unchanged. Character-perfect.
If fail: Restore from HEAD_REGISTRY. Re-validate.

HALT PROCEDURE (if any gate fails after max rollback attempts):
1. Output error report: which gate, what failed, what was attempted
2. Output last valid HTML state from before failing phase
3. Output partial optimization report (phases completed successfully)
4. Mark deliverable: INCOMPLETE — MANUAL REVIEW REQUIRED
5. Never output broken or invalid HTML

TECHNIQUE EXECUTION STATUS:
✓ 1A. Facility Language: [N] corrected → compliant
✓ 1B. Sacred Lock: [X/10], mode [TRUE/PARTIAL/NONE]
✓ 1C. Tightening + Consolidation + Replacement Scan: -[XX] words, [N] targets
✓ 1D. Entity Precision + Co-occurrence: [N] upgrades, [N] clusters
✓ 1E. Semantic Variants: [N] swaps
✓ 1F. Credibility + Citation Attribution + Niche + Quotation: [N] signals, [N] attributed, [N] quotations
✓ 1G. Persona Targeting: {PERSONA} applied
✓ 1H. Geographic + Logistics + Near-Me: +[N] city, +[N] county
✓ 1I. Voice Search: [N] conversions
✓ 1J. Question H2s + Snippets + Fan-Out: [N] H2s, [N/5] fan-out
✓ 1K. Micro-Anchors: [N] anchors, patterns [list]
✓ 1L. Answer Blocks (GEO): [N] blocks, avg [X] words
✓ 1M. Statistics + Fact Density (GEO): [N] stats, avg [X] facts/para
✓ 1N. Technical Cleanup: [N] fixes
✓ 1O. Internal Linking: [N] total, heatmap [status]
✓ 1P. GEO Structure Audit: readiness [HIGH/MEDIUM/LOW]
ALL 16 TECHNIQUES EXECUTED: ✅

WORD COUNT LEDGER:
Original (Phase 0): [X,XXX] words
Phase 1C tightening: -[XXX]
Phase 1D entities + co-occurrence: +[XX] (mode: replacement/mixed/addition)
Phase 1E variants: 0 (pure swaps)
Phase 1F credibility + niche: +[XX] (mode)
Phase 1G persona: +/-[XX] (mode)
Phase 1H geographic: +[XX] (mode)
Phase 1I voice: +/-[XX] (mode)
Phase 1J questions + snippets + fan-out: +[XX] (mode)
Phase 1K micro-anchors: +[XX] (mode)
Phase 1L answer blocks: +/-[XX] (mode)
Phase 1M statistics: +/-[XX] (mode)
Phase 1N technical: +/-[XX]
Phase 1O linking: 0 (links only)
Phase 1P GEO audit: +/-[XX]
NET CHANGE: +/-[XXX]
FINAL: [X,XXX] words
TARGET: +20 to +80 net. STATUS: [WITHIN / OVER / UNDER]
MODE SUMMARY: [N] replacement, [N] mixed, [N] addition. Target: 8+ replacement, under 3 addition.

PRESERVATION GATES:
✓ Gate 1 Sacred URL integrity: [PASS/FAIL]
✓ Gate 2 Link count invariant: [PASS/FAIL]
✓ Gate 3 Conversion elements: [PASS/FAIL]
✓ Gate 4 Hero protection: [PASS/FAIL]
✓ Gate 5 Head tags: [PASS/FAIL]

GEO METRICS (advisory):
- Citation attribution patterns: [N] (target: 2+)
- Attributed quotations: [N] (target: 1+)
- Answer blocks (40-60 words): [N] (target: 2+)
- Statistics/quantitative claims: [N] (target: 3+)
- Entity co-occurrence statements: [N] (target: 2+)
- Fact density: avg [X] facts/paragraph (target: 2+)
- Query fan-out coverage: [N/5]
- GEO readiness: [HIGH/MEDIUM/LOW]

ADVISORY METRICS (logged, non-blocking):
- Link density: contextual body links / body words. Target 1:100-150.
- Uniqueness (Page Builder mode): city-specific unique anchors. Hub 10-12, spoke 4-8.
- Proof consolidation: R2v3/NIST/HIPAA final mention counts.
- Word budget status and technique mode breakdown.
</VALIDATION_GATES>


<PROOF_OF_WORK>
MANDATORY. Runs after all gates pass, before Phase 2. Prevents "skimming" — forces verification against actual final HTML.

For each check below, QUOTE the actual text from final HTML with paragraph number. If you cannot produce the quote, the technique did not land — go back and execute it.

1. ENTITY: Quote one sentence containing a verified entity with employee count. [para #: "quote"]
2. ATTRIBUTION: Quote one "According to..." / "Under..." / "Per..." sentence. [para #: "quote"]
3. NEAR-ME: Quote the near-me sentence. [para #: "quote"]
4. PRIMARY ANSWER BLOCK (front-loaded): Quote the position-locked Block 1 from services_intro or earliest soft target in paragraphs 3-6. Must contain STS + {CITY} + service + cert + entity/stat in 40-60 words. [para #: "quote", position: "soft_target_id or organic_para_N"]
5. ADDITIONAL ANSWER BLOCKS: Quote one of the non-position-locked answer blocks (Block 2 or 3). [para #: "quote"]
6. STATISTIC: Quote one quantitative replacement (number + source). [para #: "quote"]
7. SEMANTIC VARIANT: Quote one sentence using a variant instead of primary keyword. [para #: "quote"]
8. PERSONA: Quote the rewritten paragraph 3 with persona reference. [para #: "quote"]
9. MICRO-ANCHOR: Quote one factual preference statement. [para #: "quote"]
10. EXPERIENCE VOICE (niche context): Quote the Phase 1F Task 2 niche context sentence using operational-experience voice ("STS engagements with..." or "STS work with..."). [para #: "quote"]
11. QUOTATION (GEO): Quote one verbatim quotation added in Phase 1F Task 3, with its named source (standard or sourced statistic). The quoted span must be real source text, not invented. If no verified source existed, write "SKIPPED: no verified quotable source." [para #: "quote"]

For conditional GEO techniques that were legitimately skipped (no targets, budget exhausted): Write "SKIPPED: [reason]" — this counts as verified.

If any check fails and cannot be re-executed (ceiling, no targets): Log reason. Do not fabricate quotes.

PROOF OF WORK goes in the compressed report, not in chat.
</PROOF_OF_WORK>


<PHASE_2_STRATEGIC_ADDITIONS>
Execute only if: Real feature gap exists AND word count below hard ceiling AND all gates passed.

Feature gap checklist: Q&A section missing? Equipment lists incomplete? Process timeline absent? Compliance checklist missing?
- If 1+ gaps: Execute. Add 1-2 missing elements.
- If 0 gaps: Skip. Log: "Zero feature gaps identified."

Content options (max 1 section, 150-250 words):
- FAQ section (4-6 questions with direct 40-60 word answers — GEO optimized)
- Process timeline
- Compliance checklist
- Equipment list expansion

Rules: Position after paragraph 12+. Create new sections, don't stuff existing. Mention city 2-3 times. Apply design rules (60 word paragraph max, link spacing). FAQ answers should be extractable answer blocks.

If at hard ceiling: Phase 2 blocked. Log: "Phase 2 skipped — at word ceiling."

Output: "Phase 2: [EXECUTED: added {type}, +{N} words / SKIPPED: {reason}]."
</PHASE_2_STRATEGIC_ADDITIONS>


<PHASE_3_OUTPUT>
HTML COMPLETENESS VALIDATION:
☐ DOCTYPE present, html/head/body tags complete
☐ Closing /body and /html present
☐ No truncation mid-tag, no "..." indicators
☐ Div/section/p/ul/ol tag counts match open to close
☐ Footer complete, final CTA complete, last paragraph not cut off
☐ File size reasonable, content over 500 words
☐ Zero schema markup (scan for script type="application/ld+json")
☐ All sacred equipment present per mode
☐ Total links not decreased
☐ Conversion elements not decreased
☐ Head tags unchanged
☐ Emails unchanged
☐ No facility claims remaining
If any fail: Do not output. Fix and re-validate.

Generate 2 deliverables + display checklist and meta in chat:

1. OPTIMIZED HTML FILE (optimized-html.html)
Complete from DOCTYPE to closing html. All optimizations applied. No HTML comments explaining changes. Production-ready. Use create_file tool.

2. JOOMLA META (displayed in chat for manual copying)
Browser Page Title (60 chars): [from Phase 0B]
Meta Description (155 chars): [from Phase 0B]
Meta Keywords (8 terms): [from Phase 0B]
Copy to: Article → Publishing → Browser Page Title / Meta Description / Meta Keywords

MANDATORY — EXECUTION CHECKLIST (display in chat BEFORE presenting files):
This checklist is non-optional. Every row must be filled. If a phase was skipped, mark ❌ and state why. Producing this checklist forces accountability for every phase.

Phase | Status | Metric
0A    | ✅/❌  | Links: [N], Sacred: [N/10], Tel: [N], Forms: [N]
0B    | ✅/❌  | Entities: [N], Stats: [N], Competitors: [N], Geo contamination: [Y/N]
0C    | ✅/❌  | Mode: [V3/LEGACY_PB/NORMAL], Words: [N]
1A    | ✅/❌  | Facility violations: [N], Scope: [N], Wrong-city: [N]
1B    | ✅/❌  | Sacred: [N/10], Mode: [FULL/PARTIAL]
1C    | ✅/❌  | Tightened: -[N]w, Replacements: [N] tagged + [N] organic
1D    | ✅/❌  | Entities: [N] verified, [N] placed with counts
1E    | ✅/❌  | Swaps: [N] ([N]% of repetitions)
1F    | ✅/❌  | Citation patterns: [N], Niche context (exp voice): [present/missing], Quotations: [N]
1G    | ✅/❌  | Persona: [type]
1H    | ✅/❌  | City: [N]→[N], County: [N]→[N], Near-me: [present/added]
1I    | ✅/❌  | Voice conversions: [N]
1J    | ✅/❌  | Question H2s: [N], Fan-out: [N/5]
1K    | ✅/❌  | Micro-anchors: [N], Patterns: [list]
1L    | ✅/❌  | Answer blocks: [N], Word range: [N-N], Block 1 position: [target_id|para_N]
1M    | ✅/❌  | Stats: [N] with sources
1N    | ✅/❌  | HTML: [N], Alt: [N], Tel: [N], Facility: [correct/fixed]
1O    | ✅/❌  | Sacred: locked, City spoke: [N], New body links: [N], Density: 1:[N]
1P    | ✅/❌  | GEO readiness: [HIGH/MEDIUM/LOW]

GATES:
G1 Sacred: [N/10] | G2 Links: [before]=[after] | G3 Conv: tel=[N]/email=[N]/CTA=[N]/form=[N] | G4 Hero: locked | G5 Canonical: locked

Delta: [before]→[after] ([+/-N] words)

Do NOT generate a separate report file. The checklist above IS the report.

CHAT RESPONSE FORMAT — Keep it tight:
- Display execution checklist first
- Present optimized HTML file
- Show Joomla meta for copying
- One-line summary: "Done. [X]→[Y] words. [N] techniques. GEO: [level]. All gates passed."
- If issues: List only what failed or was skipped
- Do NOT write prose explanations of what was done. The checklist has the details.

Use present_files to deliver HTML.
</PHASE_3_OUTPUT>


<TIERED_SACRED_LINKS_REFERENCE>
TIER 1 — ABSOLUTELY SACRED (never remove, never modify href):
Contact page, phone/email CTAs in body, hub link (if spoke page), core money pages.

TIER 2 — HIGH VALUE (preserve count, can adjust placement):
Sacred equipment (10 categories), certificate of destruction, HIPAA destruction, NAID certified, on-site shredding, healthcare IT disposal.

TIER 3 — CONTEXTUAL (prunable only if density below 1:90):
Related spoke pages, industry guides, secondary service pages, repeated URLs (3+ to same destination). Prune only in future optimizations.
</TIERED_SACRED_LINKS_REFERENCE>


<APPROVED_URL_ALLOWLIST>
Only these exact URLs permitted for NEW links. Existing links in input HTML are implicitly approved.

EQUIPMENT (Sacred 10):
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/317-computer-recycling
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/318-laptop-recycling
https://www.stselectronicrecyclinginc.com/iphone-smartphone-and-cell-phone-recycling
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/320-networking-equipment-recycling
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/321-printer-recycling
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/322-copy-machine-recycling
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/323-server-equipment-recycling
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/324-ink-and-toner-recycling
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/325-monitor-recycling
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/326-old-electronics-recycling

EQUIPMENT (Cell Phone Alternate — treat as equivalent to sacred):
https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/319-cell-phone-recycling

CONTACT:
https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE

HUB PAGES:
https://www.stselectronicrecyclinginc.com/services
https://www.stselectronicrecyclinginc.com/industries-we-serve
https://www.stselectronicrecyclinginc.com/our-locations?view=map

SERVICES (Core):
https://www.stselectronicrecyclinginc.com/electronics-and-computer-recycling-disposal-service
https://www.stselectronicrecyclinginc.com/hard-drive-destruction-service
https://www.stselectronicrecyclinginc.com/computer-liquidation-service
https://www.stselectronicrecyclinginc.com/services/computer-lease-buyout
https://www.stselectronicrecyclinginc.com/services/itad-it-asset-disposition
https://www.stselectronicrecyclinginc.com/services/whatsitworth
https://www.stselectronicrecyclinginc.com/services/mar-program

SERVICES (Advanced):
https://www.stselectronicrecyclinginc.com/server-destruction-services
https://www.stselectronicrecyclinginc.com/hipaa-compliant-hard-drive-destruction
https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding
https://www.stselectronicrecyclinginc.com/naid-certified-data-destruction
https://www.stselectronicrecyclinginc.com/certificate-of-destruction-services
https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad
https://www.stselectronicrecyclinginc.com/data-center-decommissioning

INDUSTRY (Short Slugs):
https://www.stselectronicrecyclinginc.com/healthcare-it-disposal
https://www.stselectronicrecyclinginc.com/financial-services-data-destruction
https://www.stselectronicrecyclinginc.com/compliance-officer-data-destruction
https://www.stselectronicrecyclinginc.com/corporate-data-security-disposal
https://www.stselectronicrecyclinginc.com/government-data-destruction
https://www.stselectronicrecyclinginc.com/legal-firm-data-destruction
https://www.stselectronicrecyclinginc.com/education-it-disposal

INDUSTRY (Long Form):
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-1/school-university-and-education-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-1/healthcare-electronic-recycling
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-1/oil-and-gas-industry-electronics-recycling
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-1/engineering-industry-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-2/electronics-oem-and-manufacturing-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-2/consulting-firm-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-2/software-industry-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-2/data-center-and-colocation-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-3/media-and-entertainment-industry-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-3/call-center-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-3/industrial-facility-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-3/courts-and-legal-industry-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-4/casino-and-gaming-industry-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-4/insurance-industry-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-4/banking-and-financial-industry-electronics-recycling-and-itad
https://www.stselectronicrecyclinginc.com/industries-we-serve/industries-4/federal-state-and-local-government-electronics-recycling-and-itad

RESOURCE:
https://www.stselectronicrecyclinginc.com/recycling-pollution-effects

CITY-SPECIFIC URLS: Use city handoff document if provided. Format: https://www.stselectronicrecyclinginc.com/{city-slug}-{service-slug}. Preferred over generic service URLs in body content.
</APPROVED_URL_ALLOWLIST>
```


````

### Fixture — sts-seo-data-2026.tsv

`scripts/src/bakeoff/fixtures/sts-seo-data-2026.tsv` — 23,787 chars

```text
Google Search Console - Pages Report (Top 250 by Clicks)
Period: February 19 - May 19, 2026 (Last 3 months)
Export Date: May 20, 2026
Top pages	Clicks	Impressions	CTR	Position
https://www.stselectronicrecyclinginc.com/	1056.0	61653.0	0.0171	9.96
https://www.stselectronicrecyclinginc.com/austin	504.0	36019.0	0.014	16.95
https://www.stselectronicrecyclinginc.com/san-antonio	462.0	40817.0	0.0113	12.78
https://www.stselectronicrecyclinginc.com/plano	300.0	23258.0	0.0129	9.54
https://www.stselectronicrecyclinginc.com/houston	294.0	80953.0	0.0036	12.71
https://www.stselectronicrecyclinginc.com/dallas	251.0	65197.0	0.0038	18.91
https://www.stselectronicrecyclinginc.com/chicago-il	196.0	81835.0	0.0024	7.48
https://www.stselectronicrecyclinginc.com/electronics-recycling-sugar-land	174.0	7153.0	0.0243	6.27
https://www.stselectronicrecyclinginc.com/schedule-an-appointment	158.0	10727.0	0.0147	11.97
https://www.stselectronicrecyclinginc.com/orlando-fl	156.0	26118.0	0.006	13.96
https://www.stselectronicrecyclinginc.com/wichita	143.0	65122.0	0.0022	2.45
https://www.stselectronicrecyclinginc.com/arlington	138.0	7580.0	0.0182	4.38
https://www.stselectronicrecyclinginc.com/electronics-recycling-energy-corridor	130.0	4105.0	0.0317	3.0
https://www.stselectronicrecyclinginc.com/electronics-recycling-spring	124.0	4360.0	0.0284	3.36
http://www.stselectronicrecyclinginc.com/baton-rouge	115.0	13054.0	0.0088	3.67
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-tampa-fl	109.0	28623.0	0.0038	4.59
https://www.stselectronicrecyclinginc.com/free-computer-laptop-pc-and-electronics-recycling-in-milwaukee-wi	108.0	9075.0	0.0119	3.44
https://www.stselectronicrecyclinginc.com/indianapolis-in	106.0	15371.0	0.0069	13.28
https://www.stselectronicrecyclinginc.com/minneapolis-mn	93.0	14912.0	0.0062	13.03
https://www.stselectronicrecyclinginc.com/atlanta-electronics-recycling	86.0	46551.0	0.0018	5.56
https://www.stselectronicrecyclinginc.com/milwaukee-free-electronics-recycling	81.0	5693.0	0.0142	27.32
https://www.stselectronicrecyclinginc.com/cincinnati-oh	62.0	5437.0	0.0114	19.1
https://stselectronicrecyclinginc.com/	59.0	2171.0	0.0272	4.17
https://www.stselectronicrecyclinginc.com/centennial-co	49.0	3137.0	0.0156	26.7
https://www.stselectronicrecyclinginc.com/free-computer-pc-laptop-and-electronics-recycling-in-madison-wi	49.0	1982.0	0.0247	2.64
https://www.stselectronicrecyclinginc.com/our-locations	48.0	5238.0	0.0092	4.98
https://www.stselectronicrecyclinginc.com/chicago-free-electronics-recycling	47.0	14211.0	0.0033	17.85
https://www.stselectronicrecyclinginc.com/longview	46.0	2380.0	0.0193	27.97
https://www.stselectronicrecyclinginc.com/fort-worth	45.0	11734.0	0.0038	4.53
https://www.stselectronicrecyclinginc.com/grand-rapids-mi	42.0	4031.0	0.0104	12.54
https://www.stselectronicrecyclinginc.com/flint-mi	40.0	5085.0	0.0079	23.65
https://www.stselectronicrecyclinginc.com/mcallen	39.0	4393.0	0.0089	16.81
https://www.stselectronicrecyclinginc.com/peoria-il	39.0	3436.0	0.0114	17.35
https://www.stselectronicrecyclinginc.com/gulfport-mississippi-electronics-recycling	39.0	3217.0	0.0121	14.51
https://www.stselectronicrecyclinginc.com/fort-wayne-in	38.0	4280.0	0.0089	18.82
https://www.stselectronicrecyclinginc.com/lafayette	38.0	3316.0	0.0115	26.01
https://www.stselectronicrecyclinginc.com/huntsville	37.0	5887.0	0.0063	10.81
https://www.stselectronicrecyclinginc.com/chattanooga-electronics-recycling	37.0	5192.0	0.0071	20.67
https://www.stselectronicrecyclinginc.com/st-louis-computer-liquidation	37.0	4784.0	0.0077	10.8
https://www.stselectronicrecyclinginc.com/pasadena	36.0	8057.0	0.0045	38.75
https://www.stselectronicrecyclinginc.com/evansville-in	36.0	1965.0	0.0183	9.89
https://www.stselectronicrecyclinginc.com/killeen	35.0	3274.0	0.0107	12.92
https://www.stselectronicrecyclinginc.com/detroit-mi	34.0	11076.0	0.0031	2.54
https://www.stselectronicrecyclinginc.com/richardson	34.0	4066.0	0.0084	16.81
https://www.stselectronicrecyclinginc.com/rockford-il	34.0	3524.0	0.0096	17.67
https://www.stselectronicrecyclinginc.com/cedar-rapids-ia	34.0	2698.0	0.0126	13.35
https://www.stselectronicrecyclinginc.com/irving	33.0	5116.0	0.0065	16.7
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-new-port-richey-fl	33.0	2156.0	0.0153	18.92
https://www.stselectronicrecyclinginc.com/new-braunfels-tx-free-computer-laptop-and-electronics-recycling-data-destruction-service/areas-of-service/new-braunfels	33.0	1410.0	0.0234	25.9
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-spring-hill-fl	31.0	2725.0	0.0114	14.59
https://www.stselectronicrecyclinginc.com/roanoke	31.0	2048.0	0.0151	16.27
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-boca-raton-fl	31.0	1041.0	0.0298	7.13
https://www.stselectronicrecyclinginc.com/provo-ut	30.0	2866.0	0.0105	18.48
https://www.stselectronicrecyclinginc.com/charlotte	29.0	18443.0	0.0016	15.98
https://www.stselectronicrecyclinginc.com/lincoln-ne	29.0	4252.0	0.0068	44.92
https://www.stselectronicrecyclinginc.com/san-francisco	28.0	9445.0	0.003	2.22
https://www.stselectronicrecyclinginc.com/sarasota-fl-electronics-recycling	28.0	8144.0	0.0034	34.42
https://www.stselectronicrecyclinginc.com/everett-wa	28.0	2811.0	0.01	15.72
https://www.stselectronicrecyclinginc.com/norman-computer-recycling	27.0	5499.0	0.0049	18.6
https://www.stselectronicrecyclinginc.com/memphis-electronics-recycling	26.0	9398.0	0.0028	48.03
https://www.stselectronicrecyclinginc.com/reno-nv	26.0	7911.0	0.0033	14.05
https://www.stselectronicrecyclinginc.com/clarksville-electronics-recycling	26.0	3844.0	0.0068	37.2
https://www.stselectronicrecyclinginc.com/amarillo	26.0	2554.0	0.0102	13.87
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-palm-harbor-fl	26.0	1476.0	0.0176	18.02
https://www.stselectronicrecyclinginc.com/columbus-oh	25.0	5112.0	0.0049	6.59
https://www.stselectronicrecyclinginc.com/shreveport	25.0	4024.0	0.0062	48.65
https://www.stselectronicrecyclinginc.com/jonesboro-computer-recycling	25.0	1932.0	0.0129	23.1
https://www.stselectronicrecyclinginc.com/birmingham	24.0	9331.0	0.0026	30.41
https://www.stselectronicrecyclinginc.com/henderson-nv	24.0	6334.0	0.0038	41.73
https://www.stselectronicrecyclinginc.com/aurora-co	24.0	5330.0	0.0045	32.05
https://www.stselectronicrecyclinginc.com/lakewood-co	23.0	6065.0	0.0038	53.54
https://www.stselectronicrecyclinginc.com/alabama-service-area	23.0	5423.0	0.0042	55.5
https://www.stselectronicrecyclinginc.com/fort-lauderdale-fl	23.0	4075.0	0.0056	26.94
https://www.stselectronicrecyclinginc.com/lufkin	23.0	762.0	0.0302	16.52
https://www.stselectronicrecyclinginc.com/livonia-mi	22.0	6205.0	0.0035	27.45
https://www.stselectronicrecyclinginc.com/chesapeake-va	22.0	4771.0	0.0046	63.94
https://www.stselectronicrecyclinginc.com/tyler	22.0	2135.0	0.0103	23.78
https://www.stselectronicrecyclinginc.com/lowell-ma	22.0	1609.0	0.0137	23.59
https://www.stselectronicrecyclinginc.com/los-angeles	21.0	17381.0	0.0012	2.42
https://www.stselectronicrecyclinginc.com/texas-service-area	21.0	9775.0	0.0021	33.44
https://www.stselectronicrecyclinginc.com/cleveland-computer-liquidation	21.0	3439.0	0.0061	8.72
https://www.stselectronicrecyclinginc.com/erie-pa	21.0	2388.0	0.0088	21.87
https://www.stselectronicrecyclinginc.com/brownsville	21.0	1552.0	0.0135	13.26
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-west-palm-beach-fl	21.0	400.0	0.0525	12.91
https://www.stselectronicrecyclinginc.com/miami-fl	20.0	35228.0	6.0E-4	2.83
https://www.stselectronicrecyclinginc.com/nashville-computer-recycling	20.0	6803.0	0.0029	20.36
https://www.stselectronicrecyclinginc.com/montgomery	20.0	2889.0	0.0069	18.82
https://www.stselectronicrecyclinginc.com/denton	20.0	2770.0	0.0072	13.51
https://www.stselectronicrecyclinginc.com/beaumont	20.0	1766.0	0.0113	14.92
https://www.stselectronicrecyclinginc.com/new-york-city	19.0	12868.0	0.0015	2.93
https://www.stselectronicrecyclinginc.com/des-moines-ia	19.0	7011.0	0.0027	24.5
https://www.stselectronicrecyclinginc.com/naperville-il	19.0	3128.0	0.0061	20.4
https://www.stselectronicrecyclinginc.com/baltimore-md	18.0	5277.0	0.0034	36.81
https://www.stselectronicrecyclinginc.com/manchester-nh	18.0	4862.0	0.0037	13.21
https://www.stselectronicrecyclinginc.com/bridgeport	18.0	3625.0	0.005	15.79
https://www.stselectronicrecyclinginc.com/omaha-ne	17.0	6912.0	0.0025	46.27
https://www.stselectronicrecyclinginc.com/colorado-springs-co	17.0	5612.0	0.003	50.93
https://www.stselectronicrecyclinginc.com/corpus-christi	17.0	3535.0	0.0048	12.37
https://www.stselectronicrecyclinginc.com/port-st-lucie-fl	17.0	2578.0	0.0066	8.75
https://www.stselectronicrecyclinginc.com/rochester-mn	17.0	2275.0	0.0075	31.1
https://www.stselectronicrecyclinginc.com/joliet-il	17.0	1918.0	0.0089	23.35
https://www.stselectronicrecyclinginc.com/waco-computer-recycling	17.0	1217.0	0.014	7.95
https://www.stselectronicrecyclinginc.com/el-paso	16.0	4146.0	0.0039	22.14
https://www.stselectronicrecyclinginc.com/lubbock	16.0	2216.0	0.0072	14.38
https://www.stselectronicrecyclinginc.com/oakland-ca	15.0	5521.0	0.0027	25.55
https://www.stselectronicrecyclinginc.com/mesa-az	15.0	3489.0	0.0043	27.65
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-pinellas-park-fl	15.0	3256.0	0.0046	18.68
https://www.stselectronicrecyclinginc.com/haven-ct	15.0	1936.0	0.0077	14.53
https://www.stselectronicrecyclinginc.com/gainesville-fl	15.0	1818.0	0.0083	14.63
https://www.stselectronicrecyclinginc.com/fort-collins-co	14.0	3439.0	0.0041	58.42
https://www.stselectronicrecyclinginc.com/roseville-ca	14.0	2878.0	0.0049	27.44
https://www.stselectronicrecyclinginc.com/lancaster-pa	14.0	2866.0	0.0049	26.26
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-plantation-fl	14.0	2371.0	0.0059	11.74
https://www.stselectronicrecyclinginc.com/the-woodlands-tx-free-computer-laptop-and-electronics-recycling-data-destruction-service/areas-of-service/the-woodlands	14.0	1257.0	0.0111	16.64
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-sanford-fl/areas-of-service/computer-and-electronic-recycling-service-sanford-fl	14.0	1134.0	0.0123	23.39
https://www.stselectronicrecyclinginc.com/tulsa-computer-recycling-service	13.0	11481.0	0.0011	47.1
https://www.stselectronicrecyclinginc.com/georgia-service-area	13.0	8856.0	0.0015	35.58
https://www.stselectronicrecyclinginc.com/norfolk	13.0	6457.0	0.002	13.65
https://www.stselectronicrecyclinginc.com/overland-park-ks	13.0	6385.0	0.002	9.43
https://www.stselectronicrecyclinginc.com/charleston	13.0	5994.0	0.0022	27.49
https://www.stselectronicrecyclinginc.com/jackson-ms	13.0	5199.0	0.0025	20.3
https://www.stselectronicrecyclinginc.com/elgin-il	13.0	2765.0	0.0047	25.9
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-dunedin-fl	13.0	629.0	0.0207	21.93
https://www.stselectronicrecyclinginc.com/cedar-park-tx-free-computer-laptop-and-electronics-recycling-data-destruction-service/areas-of-service/cedar-park	13.0	585.0	0.0222	18.88
https://www.stselectronicrecyclinginc.com/augusta-computer-and-elecronics-recycling	12.0	7453.0	0.0016	34.89
https://www.stselectronicrecyclinginc.com/macon	12.0	5892.0	0.002	11.45
https://www.stselectronicrecyclinginc.com/san-antonio-itad	12.0	4538.0	0.0026	9.23
https://www.stselectronicrecyclinginc.com/greensboro	12.0	4277.0	0.0028	25.86
https://www.stselectronicrecyclinginc.com/baton-rouge	12.0	2849.0	0.0042	19.48
https://www.stselectronicrecyclinginc.com/raleigh	12.0	2623.0	0.0046	20.06
https://www.stselectronicrecyclinginc.com/brokton-ma	12.0	2103.0	0.0057	14.67
https://www.stselectronicrecyclinginc.com/san-antonio-free-electronics-recycling	12.0	1731.0	0.0069	20.25
https://www.stselectronicrecyclinginc.com/las-vegas	12.0	985.0	0.0122	4.59
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-zephyrhills-fl	12.0	574.0	0.0209	12.89
https://www.stselectronicrecyclinginc.com/spring-tx-electronics-recycling	12.0	460.0	0.0261	17.74
https://www.stselectronicrecyclinginc.com/boston-ma	11.0	14496.0	8.0E-4	10.52
https://www.stselectronicrecyclinginc.com/albuquerque	11.0	5897.0	0.0019	44.4
https://www.stselectronicrecyclinginc.com/bakersfield-ca	11.0	5240.0	0.0021	35.0
https://www.stselectronicrecyclinginc.com/pittsburgh-pa	11.0	5127.0	0.0021	43.82
https://www.stselectronicrecyclinginc.com/mobile	11.0	4159.0	0.0026	24.42
https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE	11.0	3163.0	0.0035	2.93
https://www.stselectronicrecyclinginc.com/tennessee	11.0	3028.0	0.0036	50.76
https://www.stselectronicrecyclinginc.com/lawton-computer-recycling	11.0	2943.0	0.0037	12.6
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-riverview-fl	11.0	2715.0	0.0041	20.36
https://www.stselectronicrecyclinginc.com/free-computer-pc-laptop-and-electronics-recycling-in-kenosha-wi	11.0	2622.0	0.0042	40.89
https://www.stselectronicrecyclinginc.com/louisville-ky	11.0	2456.0	0.0045	10.23
https://www.stselectronicrecyclinginc.com/new-orleans-computer-recycling	11.0	2173.0	0.0051	11.86
https://www.stselectronicrecyclinginc.com/odessa	11.0	2138.0	0.0051	16.1
https://www.stselectronicrecyclinginc.com/washington-dc	11.0	1781.0	0.0062	4.88
https://www.stselectronicrecyclinginc.com/san-marcos-tx-free-computer-laptop-and-electronics-recycling-data-destruction-service/areas-of-service/san-marcos	11.0	1365.0	0.0081	33.6
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-trinity-fl	11.0	1105.0	0.01	11.98
https://www.stselectronicrecyclinginc.com/monroe-la-free-computer-laptop-and-electronics-recycling-data-destruction-service/areas-of-service/monroe-la	11.0	1028.0	0.0107	13.93
https://www.stselectronicrecyclinginc.com/round-rock-tx-free-computer-laptop-and-electronics-recycling-data-destruction-service/areas-of-service/round-rock	11.0	810.0	0.0136	18.74
https://www.stselectronicrecyclinginc.com/columbia	10.0	10451.0	0.001	37.92
https://www.stselectronicrecyclinginc.com/dearborn-mi	10.0	9515.0	0.0011	64.75
https://www.stselectronicrecyclinginc.com/las-vegas-nv	10.0	6192.0	0.0016	47.81
https://www.stselectronicrecyclinginc.com/mississippiservicearea	10.0	4741.0	0.0021	62.49
https://www.stselectronicrecyclinginc.com/quincy-ma	10.0	4217.0	0.0024	50.27
https://www.stselectronicrecyclinginc.com/concord-nh	10.0	2511.0	0.004	17.15
https://www.stselectronicrecyclinginc.com/lynn-ma	10.0	1558.0	0.0064	22.23
https://www.stselectronicrecyclinginc.com/carrollton	10.0	1293.0	0.0077	27.02
https://www.stselectronicrecyclinginc.com/rockwall-tx-free-computer-laptop-and-electronics-recycling-data-destruction-service/areas-of-service/rockwall	10.0	701.0	0.0143	31.59
https://www.stselectronicrecyclinginc.com/new-york-ny	9.0	37130.0	2.0E-4	30.93
https://www.stselectronicrecyclinginc.com/philadelphia-pa	9.0	23558.0	4.0E-4	29.59
https://www.stselectronicrecyclinginc.com/newark-nj	9.0	8590.0	0.001	14.31
https://www.stselectronicrecyclinginc.com/hartford-ct	9.0	5805.0	0.0016	18.59
https://www.stselectronicrecyclinginc.com/wichita-ks-electronics-recycling	9.0	5187.0	0.0017	13.8
https://www.stselectronicrecyclinginc.com/portsmouth	9.0	2524.0	0.0036	68.23
https://www.stselectronicrecyclinginc.com/midland	9.0	2019.0	0.0045	16.22
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-temple-terrace-fl	9.0	1938.0	0.0046	16.78
https://www.stselectronicrecyclinginc.com/chandler-az	9.0	1719.0	0.0052	27.06
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-land-o-lakes-fl	9.0	1290.0	0.007	22.06
https://www.stselectronicrecyclinginc.com/nashua-nh	9.0	1262.0	0.0071	15.85
https://www.stselectronicrecyclinginc.com/grand-rapids-mi-free-electronics-recycling	9.0	1055.0	0.0085	13.72
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-largo-fl	9.0	990.0	0.0091	15.91
https://www.stselectronicrecyclinginc.com/saint-paul-mn	9.0	608.0	0.0148	5.19
https://www.stselectronicrecyclinginc.com/phoenix	9.0	570.0	0.0158	3.33
https://www.stselectronicrecyclinginc.com/https://www.stselectronicrecyclinginc.com/marshall-e-waste-recycling	9.0	338.0	0.0266	2.88
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-holiday-fl	9.0	201.0	0.0448	13.22
https://www.stselectronicrecyclinginc.com/oklahoma-city-computer-recycling	8.0	7533.0	0.0011	27.92
https://www.stselectronicrecyclinginc.com/portland-or	8.0	5004.0	0.0016	51.23
https://www.stselectronicrecyclinginc.com/richmondva	8.0	4823.0	0.0017	36.2
https://www.stselectronicrecyclinginc.com/el-cajon-ca	8.0	2860.0	0.0028	21.15
https://www.stselectronicrecyclinginc.com/lexington	8.0	2841.0	0.0028	23.3
https://www.stselectronicrecyclinginc.com/louisville-ky-e-waste-recycling	8.0	2231.0	0.0036	19.33
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-boynton-fl	8.0	2042.0	0.0039	51.42
https://www.stselectronicrecyclinginc.com/arlington-tx	8.0	1922.0	0.0042	28.03
https://www.stselectronicrecyclinginc.com/san-diego	8.0	1868.0	0.0043	4.09
https://www.stselectronicrecyclinginc.com/plano-tx-e-waste-recycling	8.0	1753.0	0.0046	36.53
https://www.stselectronicrecyclinginc.com/fairfield-ca	8.0	1617.0	0.0049	37.62
https://www.stselectronicrecyclinginc.com/philadelphia	8.0	1489.0	0.0054	2.65
https://www.stselectronicrecyclinginc.com/madison-free-electronics-recycling	8.0	1364.0	0.0059	32.09
https://www.stselectronicrecyclinginc.com/gilbert-az	8.0	1325.0	0.006	21.44
https://www.stselectronicrecyclinginc.com/alexandria	8.0	1274.0	0.0063	32.79
https://www.stselectronicrecyclinginc.com/hampton	8.0	1145.0	0.007	11.69
https://www.stselectronicrecyclinginc.com/clearwater-fl	8.0	1081.0	0.0074	15.93
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-leesburg-fl/areas-of-service/computer-and-electronic-recycling-service-leesburg-fl	8.0	789.0	0.0101	9.53
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-saint-cloud-fl/areas-of-service/computer-and-electronic-recycling-service-saint-cloud-fl	8.0	740.0	0.0108	15.02
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-winter-park-fl/areas-of-service/computer-and-electronic-recycling-service-winter-park-fl	8.0	738.0	0.0108	40.64
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-clermont-fl/areas-of-service/computer-and-electronic-recycling-service-clermont-fl	8.0	676.0	0.0118	8.98
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-safety-harbor-fl	8.0	466.0	0.0172	29.75
https://www.stselectronicrecyclinginc.com/los-angeles-ca	7.0	18755.0	4.0E-4	32.16
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-south-miami-fl	7.0	16828.0	4.0E-4	18.33
https://www.stselectronicrecyclinginc.com/riverside-ca	7.0	15025.0	5.0E-4	24.45
https://www.stselectronicrecyclinginc.com/denver-co	7.0	10858.0	6.0E-4	46.05
https://www.stselectronicrecyclinginc.com/los-angeles-computer-liquidation	7.0	9005.0	8.0E-4	34.43
https://www.stselectronicrecyclinginc.com/detroit-e-waste-recycling	7.0	7696.0	9.0E-4	32.65
https://www.stselectronicrecyclinginc.com/pasadena-ca	7.0	4057.0	0.0017	20.31
https://www.stselectronicrecyclinginc.com/buffalo-ny	7.0	4029.0	0.0017	40.46
https://www.stselectronicrecyclinginc.com/knoxville-computer-recycling	7.0	3949.0	0.0018	26.62
https://www.stselectronicrecyclinginc.com/kansas-electronics-recycling-services	7.0	2788.0	0.0025	28.41
https://www.stselectronicrecyclinginc.com/little-rock-computer-electronics-recycling	7.0	2621.0	0.0027	56.96
https://www.stselectronicrecyclinginc.com/fall-river-ma	7.0	1898.0	0.0037	31.51
https://www.stselectronicrecyclinginc.com/paterson-nj	7.0	1810.0	0.0039	39.03
https://www.stselectronicrecyclinginc.com/modesto-ca	7.0	1786.0	0.0039	12.9
https://www.stselectronicrecyclinginc.com/fargo-nd	7.0	1462.0	0.0048	18.04
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-plant-city-fl	7.0	1150.0	0.0061	25.59
https://www.stselectronicrecyclinginc.com/st-louis-free-electronics-recycling	7.0	711.0	0.0098	12.17
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-apollo-beach-fl	7.0	662.0	0.0106	26.67
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-parkland-fl	7.0	397.0	0.0176	49.97
https://www.stselectronicrecyclinginc.com/schedule-an-appointment?utm_source=google&utm_medium=cta_button&utm_campaign=gmb&utm_content=energy_coridor	7.0	205.0	0.0341	3.45
https://www.stselectronicrecyclinginc.com/rancho-cucamonga-ca	6.0	6154.0	0.001	19.02
https://www.stselectronicrecyclinginc.com/rochester-ny	6.0	5286.0	0.0011	46.22
https://www.stselectronicrecyclinginc.com/elizabeth-nj	6.0	3722.0	0.0016	29.04
https://www.stselectronicrecyclinginc.com/cape-coral-fl	6.0	3611.0	0.0017	16.85
https://www.stselectronicrecyclinginc.com/fayetteville	6.0	3591.0	0.0017	40.4
https://www.stselectronicrecyclinginc.com/boulder-co	6.0	2896.0	0.0021	57.85
https://www.stselectronicrecyclinginc.com/detroit-computer-liquidation	6.0	2648.0	0.0023	32.75
https://www.stselectronicrecyclinginc.com/pompano-beach-fl	6.0	2502.0	0.0024	53.19
https://www.stselectronicrecyclinginc.com/billings-mt	6.0	2279.0	0.0026	30.24
https://www.stselectronicrecyclinginc.com/electronics-recycling-spring/areas-of-service/electronics-recycling-spring	6.0	1241.0	0.0048	21.92
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-st-petersburg-fl/areas-of-service/computer-and-electronics-recycling-service-in-st-petersburg-florida	6.0	1148.0	0.0052	15.84
https://www.stselectronicrecyclinginc.com/computer-and-electronic-recycling-service-seminole-fl	6.0	1015.0	0.0059	37.26
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-lauderhill-fl	6.0	990.0	0.0061	46.12
https://www.stselectronicrecyclinginc.com/mesquite	6.0	911.0	0.0066	13.62
https://www.stselectronicrecyclinginc.com/sugar-land-e-waste-recycling-tx	6.0	618.0	0.0097	20.82
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-lake-worth-fl	6.0	518.0	0.0116	17.65
https://www.stselectronicrecyclinginc.com/southlake-tx-free-computer-laptop-and-electronics-recycling-data-destruction-service/areas-of-service/southlake	6.0	311.0	0.0193	14.59
https://www.stselectronicrecyclinginc.com/electronics-recycling-energy-corridor/areas-of-service/electronics-recycling-energy-corridor	5.0	13146.0	4.0E-4	34.77
https://www.stselectronicrecyclinginc.com/austin-hard-drive-destruction	5.0	7976.0	6.0E-4	56.55
https://www.stselectronicrecyclinginc.com/arlingtonva	5.0	6783.0	7.0E-4	63.26
https://www.stselectronicrecyclinginc.com/wichita-kansas-electronics-recycling-services/areas-of-service/wichita	5.0	5539.0	9.0E-4	13.4
https://www.stselectronicrecyclinginc.com/columbus	5.0	4474.0	0.0011	36.64
https://www.stselectronicrecyclinginc.com/las-vegas-computer-liquidation	5.0	3985.0	0.0013	51.13
https://www.stselectronicrecyclinginc.com/phoenix-az	5.0	3289.0	0.0015	22.37
https://www.stselectronicrecyclinginc.com/fontana-ca	5.0	2693.0	0.0019	27.23
https://www.stselectronicrecyclinginc.com/highpoint	5.0	2111.0	0.0024	11.57
https://www.stselectronicrecyclinginc.com/abilene	5.0	1607.0	0.0031	10.66
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-north-miami-beach-fl	5.0	1333.0	0.0038	55.76
https://www.stselectronicrecyclinginc.com/computer-and-electronics-recycling-service-in-oakland-park-fl	5.0	1165.0	0.0043	37.43
```

## 4. Complete harness source

Every TypeScript module in `scripts/src/bakeoff` (excluding the two dossier/review
tooling scripts themselves, and the prompt/fixture files already shown above).

### Source — backfill-cost.ts

`scripts/src/bakeoff/backfill-cost.ts` — 3,356 chars

```ts
/**
 * Offline backfill of per-model COST ESTIMATES into existing bake-off result
 * files. Token usage was not captured when these runs executed, so this replays
 * each model's recorded turn sequence through the same `estimateCost` the live
 * harness now uses. Idempotent: re-running overwrites the estimate in place.
 *
 *   pnpm --filter @workspace/scripts run bakeoff:cost
 *
 * Targets:
 *  - artifacts/bake-off/src/data/results.json     (current top-tier run)
 *  - artifacts/bake-off/src/data/old-bakeoff.json (archived full-adherence run)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunContext } from "@workspace/mc-core";
import { estimateCost, billingsNoGmbContext } from "./cost.js";
import { gmbContextSuffix, BILLINGS_GMB } from "./gmb.js";
import { loadDesignFixtures } from "./fixtures.js";
import type { BakeoffResults, ScenarioResult, ModelResult } from "./types.js";

// This file lives at <repo>/scripts/src/bakeoff/backfill-cost.ts, so the repo
// root is three directories up. Resolve from here (not cwd) because `pnpm
// --filter` runs with cwd set to the package dir, not the workspace root.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const TARGETS = [
  "artifacts/bake-off/src/data/results.json",
  "artifacts/bake-off/src/data/old-bakeoff.json",
];

function contextForScenario(scenarioId: string): { ctx: RunContext; introEnrichment: string } {
  if (scenarioId === "gmb") {
    return {
      ctx: { ...billingsNoGmbContext(), verifiedCid: BILLINGS_GMB.cid },
      introEnrichment: gmbContextSuffix(BILLINGS_GMB),
    };
  }
  return { ctx: billingsNoGmbContext(), introEnrichment: "" };
}

function backfillFile(relPath: string): void {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) {
    console.log(`skip (missing): ${relPath}`);
    return;
  }
  const data = JSON.parse(readFileSync(abs, "utf8")) as BakeoffResults;
  const fixtures = loadDesignFixtures();
  const grounding = data.grounding?.content ?? "";
  if (!grounding) {
    throw new Error(`${relPath}: no grounding.content — cannot estimate input size honestly.`);
  }

  let updated = 0;
  for (const scenario of data.scenarios as ScenarioResult[]) {
    const { ctx, introEnrichment } = contextForScenario(scenario.id);
    for (const model of scenario.models as ModelResult[]) {
      if (model.status !== "ok" || !model.timings?.length) {
        model.costEstimate = null;
        continue;
      }
      model.costEstimate = estimateCost({
        modelTag: model.model,
        timings: model.timings,
        htmlChars: (model.html ?? "").length,
        ctx,
        fixtures,
        grounding,
        introEnrichment,
      });
      updated++;
      const c = model.costEstimate;
      console.log(
        `  [${scenario.id}] ${model.id.padEnd(11)} ${model.model.padEnd(28)} ` +
          `in ${String(c.inputTokens).padStart(8)} / out ${String(c.outputTokens).padStart(6)} tok ` +
          `→ $${c.totalUsd.toFixed(2)}`,
      );
    }
  }
  writeFileSync(abs, JSON.stringify(data, null, 2));
  console.log(`✓ ${relPath}: backfilled ${updated} model(s)\n`);
}

for (const t of TARGETS) {
  console.log(`Backfilling ${t} …`);
  backfillFile(t);
}
console.log("Done.");

```

### Source — conversation.ts

`scripts/src/bakeoff/conversation.ts` — 14,014 chars

```ts
import { describeContext, type RunContext } from "@workspace/mc-core";
import type { ChatMessage, CompleteFn } from "./providers.js";
import type { DesignFixtures } from "./fixtures.js";
import { extractHtmlDocument, extractSchemaJson, tryExtractHtmlDocument } from "./extract.js";
import { evaluateDesignGate } from "./designGate.js";
import {
  ARTIFACT_TO_INLINE,
  ARTIFACT_TO_INLINE_OPTIONAL,
  SCHEMA_TO_INLINE,
  buildPrompt,
  introPrompt,
  rebuildPrompt,
  seoPrompt,
  seoVerifyFixPrompt,
  seoVerifyPrompt,
  verifyLinksFixPrompt,
  verifyLinksPrompt,
  type PromptVars,
} from "./miniPrompts.js";

const RULE = "═══════════════════════════════════";

/**
 * One full No-GMB checklist conversation, run identically for every model. The
 * driver carries the FULL message history across all turns (intro → build →
 * design-gate/rebuild loop → seo → seo-verify → schema (Schema Generator AI turn) →
 * verify-links), so the model works exactly as a VA's continuous Claude.ai chat
 * does — not a stateless fresh call per phase. The real uploaded design files
 * are inlined into the chat turns (the API has no file-attachment surface), and
 * the prompt text is the tool's verbatim `copyPrompt()` output.
 */
export interface ConversationDeps {
  ctx: RunContext;
  complete: CompleteFn;
  fixtures: DesignFixtures;
  /** The single shared local-market research grounding (identical per model). */
  grounding: string;
  /**
   * Optional per-SCENARIO (not per-model) enrichment appended to the intro — the
   * GMB scenario uses it to hand every model the explicit page_url + GMB block.
   * Empty for the faithful No-GMB scenario.
   */
  introEnrichment: string;
  /** Per-scenario schema prompt for the Phase-4 AI schema turn (No-GMB or
   * GMB-aware). The harness sends this with the Master Schema Generator file
   * inlined — it is NOT a deterministic generator. */
  schemaPromptFor: (vars: PromptVars) => string;
  /** Max design-gate rebuild attempts before failing loudly. */
  rebuildCap?: number;
}

export interface ConversationTurn {
  phase: string;
  ms: number;
  summary: string;
  /** Parsed ✅/❌ verdict for gated verification turns; null/absent otherwise. */
  verdict?: "passed" | "failed" | null;
}

export interface ConversationOutcome {
  html: string;
  schema: string;
  rebuilds: number;
  turns: ConversationTurn[];
  totalMs: number;
}

export function promptVars(ctx: RunContext): PromptVars {
  // No Hub+Spoke handoff is configured for this target (existingUrls empty), so
  // the build/seo prompts omit the linking section — exactly as the tool does
  // when its Hub+Spoke field is blank. Required sacred equipment links are still
  // supplied via the context block below.
  const hubSpoke = ctx.existingUrls.length
    ? ctx.existingUrls.join("\n")
    : "";
  return {
    city: ctx.city,
    state: ctx.state,
    url: `${ctx.registry.baseDomain.replace(/\/$/, "")}/${ctx.city.toLowerCase().replace(/\s+/g, "-")}-${ctx.state.toLowerCase()}`,
    niche: ctx.niche,
    pageName: `${ctx.city} ${ctx.niche}`,
    hubSpoke,
  };
}

/** Index of the LAST match of `re` in `text`, or -1. Used so a model that echoes
 * the rubric (which lists both ✅ and ❌ lines) before stating its own verdict is
 * judged on its FINAL verdict line, not the quoted rubric. */
function lastMatchIndex(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let idx = -1;
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    idx = m.index;
    if (m.index === g.lastIndex) g.lastIndex++;
  }
  return idx;
}

/**
 * Parse a model's ✅/❌ verification verdict from its reply. Returns "passed" /
 * "failed" when an explicit verdict is present (the LATER of the two wins, so a
 * quoted rubric doesn't override the model's final line), or null when neither
 * marker is found. Same patterns for every model — no per-model special-casing.
 */
export function readVerdict(raw: string, pass: RegExp, fail: RegExp): "passed" | "failed" | null {
  const passIdx = lastMatchIndex(raw, pass);
  const failIdx = lastMatchIndex(raw, fail);
  if (passIdx === -1 && failIdx === -1) return null;
  return failIdx > passIdx ? "failed" : "passed";
}

export const SEO_VERDICT_PASS = /seo verification passed/i;
export const SEO_VERDICT_FAIL = /seo verification failed/i;
export const LINKS_VERDICT_PASS = /links verified/i;
export const LINKS_VERDICT_FAIL = /links failed/i;

/**
 * Validate the intro handshake. The tool's only HARD stop is the wrong-model
 * case (the intro tells an Opus model to reply "🚫 WRONG MODEL … STOP"); every
 * other model is expected to acknowledge and proceed. We enforce that uniformly:
 * a wrong-model STOP or an explicit refusal to proceed/build FAILS LOUD (the run
 * cannot continue).
 *
 * We deliberately do NOT require a positive "ready" token. The readiness phrase
 * in the tool ("Sonnet 4.6 confirmed. Ready.") is Claude-specific, and a
 * non-Claude model honestly noting "I'm not Claude, I can't rename the chat /
 * verify uploads" is a benign caveat, NOT a refusal — it still builds the page
 * (observed: GPT-5.5 under the GMB intro). Requiring an ack token would convert
 * those buildable models into false errors and break the apples-to-apples
 * comparison. A model that truly cannot proceed surfaces it at the BUILD turn
 * (no HTML → fail loud there), so the intro gate enforces only the STOP path;
 * readiness is otherwise confirmed functionally by the successful build. A
 * missing ack is logged (non-blocking) for observability.
 */
function assertIntroNotBlocked(raw: string): void {
  const blocked =
    /🚫|wrong model|cannot proceed|can'?t proceed|unable to proceed|(will not|won'?t) (proceed|build|continue|create)|cannot continue|can'?t continue|i (cannot|can'?t) build|refuse to (proceed|build|continue)/i;
  if (blocked.test(raw)) {
    throw new Error(
      `Intro handshake hit a STOP / refusal — run cannot proceed. First 200 chars: ${raw
        .slice(0, 200)
        .replace(/\s+/g, " ")}`,
    );
  }
  const ack =
    /\bready\b|\bconfirm(ed|ing)?\b|files received|\bunderstood\b|let'?s (begin|start)|proceeding|i (will|'?ll) proceed/i;
  if (!ack.test(raw)) {
    console.log(
      "    ⚠ intro: no explicit readiness ack (non-blocking) — proceeding; readiness is confirmed by the build turn.",
    );
  }
}

/** A labelled "uploaded file" block, the API-faithful stand-in for a file upload. */
export function fileBlock(name: string, body: string): string {
  return `${RULE}\n📄 UPLOADED FILE: ${name}\n${RULE}\n${body.trim()}\n`;
}

/** Build the intro turn: verbatim intro prompt + the real uploaded files + context. */
function introTurn(ctx: RunContext, deps: ConversationDeps): string {
  const vars = promptVars(ctx);
  const files = [
    fileBlock("STS SEO Data 2026", deps.fixtures.seoData),
    fileBlock("Master Page Builder", deps.fixtures.pageBuilder),
    fileBlock("Master Design (Tier 2)", deps.fixtures.designTier2),
  ].join("\n");
  const grounding = `${RULE}\n📄 LOCAL MARKET RESEARCH (shared brief)\n${RULE}\n${deps.grounding.trim()}\n`;
  const context = `${RULE}\nBUILD CONTEXT (registry facts)\n${RULE}\n${describeContext(ctx)}\n`;
  const enrichment = deps.introEnrichment.trim() ? `\n${deps.introEnrichment.trim()}\n` : "";
  return [introPrompt(vars), files, grounding, context, enrichment]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Drive the whole conversation for one model and return the final page + schema.
 * Fails loudly when the build / SEO turns produce no HTML document or the design
 * gate never passes within the attempt cap.
 */
export async function runConversation(deps: ConversationDeps): Promise<ConversationOutcome> {
  const { ctx, complete } = deps;
  const vars = promptVars(ctx);
  const cap = Math.max(1, deps.rebuildCap ?? Number(process.env.BAKEOFF_REBUILD_CAP ?? 2));

  const messages: ChatMessage[] = [];
  const turns: ConversationTurn[] = [];
  let totalMs = 0;

  /** Send one user turn, append both sides to history, time it. The optional
   * `webSearch` switches on the provider's native web-search tool for THIS turn
   * only (used by the SEO-verify turn, whose prompt mandates a live web search). */
  const send = async (
    phase: string,
    user: string,
    summary: string,
    webSearch = false,
  ): Promise<string> => {
    messages.push({ role: "user", content: user });
    console.log(
      `    → ${phase}: sending (${messages.length} msgs in history)${webSearch ? " [web-search]" : ""}…`,
    );
    const t0 = Date.now();
    const res = await complete(messages, undefined, webSearch ? { webSearch: true } : undefined);
    const ms = Date.now() - t0;
    totalMs += ms;
    messages.push({ role: "assistant", content: res.raw });
    turns.push({ phase, ms, summary });
    console.log(`    ← ${phase}: ${(ms / 1000).toFixed(1)}s, ${res.raw.length} chars`);
    return res.raw;
  };

  // 1. Intro / setup handshake (files uploaded, rules, model check). Gate on the
  // readiness acknowledgement before building — a wrong-model / refusal reply
  // fails loud (the run cannot proceed), faithful to the tool's STOP contract.
  const introRaw = await send(
    "intro",
    introTurn(ctx, deps),
    "Intro handshake: files uploaded, NO-GMB rules, model check.",
  );
  assertIntroNotBlocked(introRaw);

  // 2. Build.
  const buildRaw = await send("build", buildPrompt(vars) + ARTIFACT_TO_INLINE, "Build landing page (Master Page Builder + Master Design Tier 2).");
  let html = extractHtmlDocument(buildRaw, "build");

  // 3. Design gate + force-rebuild loop.
  let rebuilds = 0;
  let gate = evaluateDesignGate(html, ctx.city);
  while (!gate.passed && rebuilds < cap) {
    rebuilds++;
    const raw = await send(
      `rebuild-${rebuilds}`,
      rebuildPrompt(vars, gate.issue) + ARTIFACT_TO_INLINE,
      `Force rebuild ${rebuilds}/${cap}: ${gate.issue}`,
    );
    html = extractHtmlDocument(raw, `rebuild ${rebuilds}`);
    gate = evaluateDesignGate(html, ctx.city);
  }
  if (!gate.passed) {
    throw new Error(
      `Design gate never passed after ${cap} rebuild attempt(s). Outstanding issue(s): ${gate.issue}`,
    );
  }

  // 4. SEO audit (uploads the Master SEO Audit file). Must output HTML.
  const seoUser = `${seoPrompt(vars)}\n\n${fileBlock("Master SEO Audit", deps.fixtures.seoAudit)}${ARTIFACT_TO_INLINE}`;
  const seoRaw = await send("seo", seoUser, "Full SEO audit (Master SEO Audit), schema stripped.");
  html = extractHtmlDocument(seoRaw, "seo");

  // A gated verification turn: send the verify prompt (report-primary, HTML
  // optional), parse the model's ✅/❌ verdict, and — faithful to the tool's "fix
  // before proceeding" contract — run a BOUNDED corrective re-verify loop on a
  // FAILED verdict, failing loud if it still fails after the cap. A null verdict
  // (no verdict line emitted) is recorded and treated as a non-blocking
  // pass-through. Uniform for every model — same prompts, same gate.
  const runVerification = async (
    phase: string,
    prompt: string,
    fixPrompt: string,
    pass: RegExp,
    fail: RegExp,
    summary: string,
    webSearch = false,
  ): Promise<void> => {
    let raw = await send(phase, prompt + ARTIFACT_TO_INLINE_OPTIONAL, summary, webSearch);
    let doc = tryExtractHtmlDocument(raw);
    if (doc) html = doc;
    let verdict = readVerdict(raw, pass, fail);
    turns[turns.length - 1].verdict = verdict;
    console.log(`    ⚖ ${phase}: verdict=${verdict ?? "none"}`);

    let fixes = 0;
    while (verdict === "failed" && fixes < cap) {
      fixes++;
      const fixPhase = `${phase}-fix-${fixes}`;
      raw = await send(
        fixPhase,
        fixPrompt + ARTIFACT_TO_INLINE_OPTIONAL,
        `Corrective re-verify ${fixes}/${cap} after a FAILED ${phase} verdict.`,
        webSearch,
      );
      doc = tryExtractHtmlDocument(raw);
      if (doc) html = doc;
      verdict = readVerdict(raw, pass, fail);
      turns[turns.length - 1].verdict = verdict;
      console.log(`    ⚖ ${fixPhase}: verdict=${verdict ?? "none"}`);
    }
    if (verdict === "failed") {
      throw new Error(
        `${phase} still returned a FAILED verdict after ${cap} corrective attempt(s).`,
      );
    }
  };

  // 5. SEO verification (gated on the ✅/❌ FINAL VERDICT). This is the ONE turn
  // that runs with live web search on — Part 2 of the prompt tells the model to
  // "search the web for current 2025-2026 SEO best practices", so the capability
  // is switched on here (and its corrective re-verify turns) for every model
  // identically. Every other turn stays search-free.
  await runVerification(
    "seo-verify",
    seoVerifyPrompt(vars),
    seoVerifyFixPrompt(),
    SEO_VERDICT_PASS,
    SEO_VERDICT_FAIL,
    "SEO verification audit (compliance + modern SEO, live web search).",
    true,
  );

  // 6. Schema (Phase 4) — a REAL AI turn: the scenario's schema prompt + the
  // Master Schema Generator file inlined (exactly like the SEO-audit turn uploads
  // its master file), with SCHEMA_TO_INLINE neutralizing the generator's chat-UI
  // "schema.txt file" / CID-verify HARD STOPs headlessly. The model must emit a
  // <script type="application/ld+json">…</script> block; we extract & validate the
  // JSON inside it (fail loud otherwise) and store the raw JSON.
  const schemaUser = `${deps.schemaPromptFor(vars)}\n\n${fileBlock("Schema Generator", deps.fixtures.schemaGenerator)}${SCHEMA_TO_INLINE}`;
  const schemaRaw = await send("schema", schemaUser, "Generate JSON-LD schema (Schema Generator file inlined).");
  const schema = extractSchemaJson(schemaRaw, "schema");

  // 7. Final link verification (gated on the ✅/❌ LINKS verdict).
  await runVerification(
    "verify-links",
    verifyLinksPrompt(),
    verifyLinksFixPrompt(),
    LINKS_VERDICT_PASS,
    LINKS_VERDICT_FAIL,
    "Final link verification (emails, contact button, no invented URLs).",
  );

  return { html, schema, rebuilds, turns, totalMs };
}

```

### Source — cost.ts

`scripts/src/bakeoff/cost.ts` — 10,843 chars

```ts
import { buildRegistry, describeContext, type RunContext } from "@workspace/mc-core";
import {
  ARTIFACT_TO_INLINE,
  ARTIFACT_TO_INLINE_OPTIONAL,
  SCHEMA_TO_INLINE,
  buildPrompt,
  introPrompt,
  rebuildPrompt,
  schemaPrompt,
  seoPrompt,
  seoVerifyFixPrompt,
  seoVerifyPrompt,
  verifyLinksFixPrompt,
  verifyLinksPrompt,
  type PromptVars,
} from "./miniPrompts.js";
import type { DesignFixtures } from "./fixtures.js";
import type { PhaseTiming } from "./types.js";

/**
 * Best-effort COST ESTIMATE for a bake-off model run.
 *
 * The harness does not capture token usage from the provider responses, and the
 * top-tier runs are expensive to repeat, so this reconstructs the cost from what
 * we DO know exactly: the deterministic, verbatim prompts + the real inlined
 * design files, re-sent on every turn (the conversation carries full history),
 * plus each turn's assistant output. It is deliberately transparent about being
 * an estimate — see `CostEstimate.basis` and the assumptions below.
 *
 * Assumptions (documented so the number is honest, not magic):
 *  - ~4 characters per token (a standard rough heuristic; not a real tokenizer).
 *  - List-price tiers per model family (no negotiated/volume discount).
 *  - NO prompt-caching discount — every turn re-bills the full re-sent history,
 *    which is the realistic upper bound for how the harness calls the APIs.
 *  - Hidden reasoning tokens (e.g. OpenAI "pro" / reasoning models) are NOT
 *    counted because they are not observable here — so reasoning-heavy models
 *    are UNDER-estimated on output. Flagged in `basis`.
 */
export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
  /** Assumed list price ($/1M tokens) used for this model's tier. */
  pricePerMInput: number;
  pricePerMOutput: number;
  /** Short, UI-facing note on how this number was derived. */
  basis: string;
}

const CHARS_PER_TOKEN = 4;
const RULE = "═══════════════════════════════════";

/** Per-tier list prices ($ per 1M tokens), matched against the model tag. Order
 * matters: more specific tags MUST precede their family default — both the
 * `…-pro` tiers AND the minor version (gpt-5.5 vs gpt-5.4 are NOT the same price:
 * 5.5 lists at 2× 5.4), so the version-specific rows come before the generic
 * `/gpt-?5/` catch-all. Rates are June-2026 published list prices. */
interface PriceTier {
  test: RegExp;
  label: string;
  inputPerM: number;
  outputPerM: number;
}
const PRICE_TIERS: PriceTier[] = [
  { test: /opus/i, label: "Claude Opus 4.8 tier", inputPerM: 5, outputPerM: 25 },
  { test: /sonnet/i, label: "Claude Sonnet tier", inputPerM: 3, outputPerM: 15 },
  { test: /gpt-?5\.5.*pro/i, label: "OpenAI GPT-5.5 Pro tier", inputPerM: 30, outputPerM: 180 },
  { test: /gpt-?5\.4.*pro/i, label: "OpenAI GPT-5.4 Pro tier", inputPerM: 5, outputPerM: 30 },
  { test: /gpt-?5.*pro|o\d-?pro/i, label: "OpenAI pro tier", inputPerM: 30, outputPerM: 180 },
  { test: /gpt-?5\.5/i, label: "OpenAI GPT-5.5 tier", inputPerM: 5, outputPerM: 30 },
  { test: /gpt-?5\.4/i, label: "OpenAI GPT-5.4 tier", inputPerM: 2.5, outputPerM: 15 },
  { test: /gpt-?5/i, label: "OpenAI GPT-5 tier", inputPerM: 2.5, outputPerM: 15 },
  { test: /gemini/i, label: "Gemini 3.1 Pro tier", inputPerM: 2, outputPerM: 12 },
  { test: /grok/i, label: "Grok 4.3 tier", inputPerM: 1.25, outputPerM: 2.5 },
];
const FALLBACK_TIER: PriceTier = {
  test: /.*/,
  label: "generic tier (no exact price match)",
  inputPerM: 3,
  outputPerM: 15,
};

function priceFor(modelTag: string): PriceTier {
  return PRICE_TIERS.find((t) => t.test.test(modelTag)) ?? FALLBACK_TIER;
}

/** The PromptVars the conversation derives for a given target context. Mirrors
 * `promptVars` in conversation.ts (kept in lockstep with it). */
function promptVars(ctx: RunContext): PromptVars {
  return {
    city: ctx.city,
    state: ctx.state,
    url: `${ctx.registry.baseDomain.replace(/\/$/, "")}/${ctx.city
      .toLowerCase()
      .replace(/\s+/g, "-")}-${ctx.state.toLowerCase()}`,
    niche: ctx.niche,
    pageName: `${ctx.city} ${ctx.niche}`,
    hubSpoke: ctx.existingUrls.length ? ctx.existingUrls.join("\n") : "",
  };
}

function fileBlock(name: string, body: string): string {
  return `${RULE}\n📄 UPLOADED FILE: ${name}\n${RULE}\n${body.trim()}\n`;
}

/** Reconstruct the intro turn's user text exactly as conversation.ts assembles
 * it (verbatim intro prompt + the three inlined design files + grounding +
 * registry context + optional per-scenario enrichment). */
function introUserText(
  ctx: RunContext,
  fixtures: DesignFixtures,
  grounding: string,
  introEnrichment: string,
): string {
  const vars = promptVars(ctx);
  const files = [
    fileBlock("STS SEO Data 2026", fixtures.seoData),
    fileBlock("Master Page Builder", fixtures.pageBuilder),
    fileBlock("Master Design (Tier 2)", fixtures.designTier2),
  ].join("\n");
  const groundingBlock = `${RULE}\n📄 LOCAL MARKET RESEARCH (shared brief)\n${RULE}\n${grounding.trim()}\n`;
  const context = `${RULE}\nBUILD CONTEXT (registry facts)\n${RULE}\n${describeContext(ctx)}\n`;
  const enrichment = introEnrichment.trim() ? `\n${introEnrichment.trim()}\n` : "";
  return [introPrompt(vars), files, groundingBlock, context, enrichment]
    .filter(Boolean)
    .join("\n\n");
}

/** Char length of the USER message the harness sends for a given phase. Returns
 * 0 for phases with no API call (the deterministic schema turn). */
function userCharsForPhase(
  phase: string,
  ctx: RunContext,
  fixtures: DesignFixtures,
  grounding: string,
  introEnrichment: string,
): number {
  const vars = promptVars(ctx);
  if (phase === "intro") return introUserText(ctx, fixtures, grounding, introEnrichment).length;
  if (phase === "build") return (buildPrompt(vars) + ARTIFACT_TO_INLINE).length;
  if (phase.startsWith("rebuild"))
    // The exact gate issue text varies; use a representative ~80-char issue.
    return (rebuildPrompt(vars, "x".repeat(80)) + ARTIFACT_TO_INLINE).length;
  if (phase === "seo")
    return (
      `${seoPrompt(vars)}\n\n${fileBlock("Master SEO Audit", fixtures.seoAudit)}${ARTIFACT_TO_INLINE}`
        .length
    );
  if (phase === "seo-verify") return (seoVerifyPrompt(vars) + ARTIFACT_TO_INLINE_OPTIONAL).length;
  if (phase.startsWith("seo-verify-fix"))
    return (seoVerifyFixPrompt() + ARTIFACT_TO_INLINE_OPTIONAL).length;
  if (phase === "verify-links") return (verifyLinksPrompt() + ARTIFACT_TO_INLINE_OPTIONAL).length;
  if (phase.startsWith("verify-links-fix"))
    return (verifyLinksFixPrompt() + ARTIFACT_TO_INLINE_OPTIONAL).length;
  if (phase === "schema")
    // A real AI turn now: the No-GMB schema prompt + the inlined Master Schema
    // Generator file + the SCHEMA_TO_INLINE shim. The GMB variant is within a few
    // hundred chars of this, so the No-GMB form is a faithful size proxy.
    return (
      `${schemaPrompt(vars)}\n\n${fileBlock("Schema Generator", fixtures.schemaGenerator)}${SCHEMA_TO_INLINE}`
        .length
    );
  return 0;
}

/** Estimated char length of the ASSISTANT reply for a given phase. The build /
 * rebuild / seo turns emit a full HTML document (≈ the final page size); the
 * chat-only / report turns emit short text. */
function assistantCharsForPhase(phase: string, htmlChars: number): number {
  if (phase === "intro") return 600;
  if (phase === "build" || phase.startsWith("rebuild") || phase === "seo") return htmlChars;
  if (phase === "seo-verify" || phase.startsWith("seo-verify-fix")) return 2500;
  if (phase === "verify-links" || phase.startsWith("verify-links-fix")) return 1200;
  if (phase === "schema") return 1800; // one JSON-LD <script> block (no HTML doc)
  return 800;
}

export interface EstimateCostArgs {
  modelTag: string;
  /** The actual ordered turns this model ran (from the recorded timings). */
  timings: Pick<PhaseTiming, "phase">[];
  /** Final page HTML length, used as the per-turn HTML output proxy. */
  htmlChars: number;
  ctx: RunContext;
  fixtures: DesignFixtures;
  grounding: string;
  introEnrichment: string;
}

/**
 * Estimate the USD cost of one model's run by replaying its recorded turn
 * sequence: the conversation carries FULL history, so each API call re-bills all
 * prior messages plus the new user turn. Pure + deterministic given its inputs.
 */
export function estimateCost(args: EstimateCostArgs): CostEstimate {
  const { modelTag, timings, htmlChars, ctx, fixtures, grounding, introEnrichment } = args;
  const tier = priceFor(modelTag);

  let historyChars = 0;
  let billedInputChars = 0;
  let outputChars = 0;

  for (const t of timings) {
    const userChars = userCharsForPhase(t.phase, ctx, fixtures, grounding, introEnrichment);
    // This call sends the whole accumulated history plus the new user message.
    billedInputChars += historyChars + userChars;
    historyChars += userChars;
    const assistantChars = assistantCharsForPhase(t.phase, htmlChars);
    historyChars += assistantChars;
    outputChars += assistantChars;
  }

  const inputTokens = Math.round(billedInputChars / CHARS_PER_TOKEN);
  const outputTokens = Math.round(outputChars / CHARS_PER_TOKEN);
  const inputUsd = (inputTokens / 1_000_000) * tier.inputPerM;
  const outputUsd = (outputTokens / 1_000_000) * tier.outputPerM;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    inputTokens,
    outputTokens,
    inputUsd: round2(inputUsd),
    outputUsd: round2(outputUsd),
    totalUsd: round2(inputUsd + outputUsd),
    pricePerMInput: tier.inputPerM,
    pricePerMOutput: tier.outputPerM,
    basis:
      `Estimate — token usage was not captured at run time. Reconstructed from the verbatim prompts + ` +
      `inlined design files re-sent every turn (~4 chars/token), priced at ${tier.label} list rates ` +
      `($${tier.inputPerM}/$${tier.outputPerM} per 1M in/out), no prompt-caching discount and excluding ` +
      `hidden reasoning tokens. The SEO-verify turn runs the provider's native web search, whose ` +
      `per-search fees are billed separately by the provider and are NOT included in this token-based estimate.`,
  };
}

/** The default No-GMB context used for the bake-off target (Billings, MT). Used
 * by the offline backfill, which estimates cost for runs persisted before the
 * harness recorded it. Mirrors `baseContext()` in run.ts. */
export function billingsNoGmbContext(): RunContext {
  return {
    city: "Billings",
    state: "MT",
    track: "page",
    classification: "NEW_BUILD",
    competition: "MEDIUM",
    pageType: "SPOKE",
    niche: "electronics recycling",
    existingUrls: [],
    handoff: null,
    verifiedCid: null,
    designBibleHash: null,
    blogTopic: null,
    researchBrief: null,
    seoIntel: null,
    registry: buildRegistry(),
  };
}

```

### Source — designGate.ts

`scripts/src/bakeoff/designGate.ts` — 2,930 chars

```ts
/**
 * The design gate the VA eyeballs after the build before proceeding: hero has
 * the city in a single H1, a lead form is present (the tool's "form on RIGHT"
 * check), and the page is mobile-responsive (viewport meta + at least one media
 * query, the tool's "images must NOT squeeze text" check).
 *
 * These are OBJECTIVE, structural signals derived from the HTML and applied
 * IDENTICALLY to every model — no per-provider special-casing. When any check
 * fails the driver sends the verbatim `rebuild` prompt describing the issue and
 * loops; after a capped number of attempts it FAILS LOUDLY rather than silently
 * accepting a page that ignored the Master Design.
 */

export interface DesignGateResult {
  passed: boolean;
  /** Human-readable issue list for the verbatim rebuild prompt (THE ISSUE: ...). */
  issue: string;
}

export function evaluateDesignGate(html: string, city: string): DesignGateResult {
  const issues: string[] = [];
  const lower = html.toLowerCase();
  const cityLower = city.toLowerCase();

  // 1. Exactly one H1, and it must contain the city name.
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1]!.replace(/<[^>]+>/g, " ").toLowerCase(),
  );
  if (h1s.length === 0) {
    issues.push("Hero is missing an <h1>. The hero MUST have one H1 containing the city name.");
  } else if (h1s.length > 1) {
    issues.push(
      `Page has ${h1s.length} <h1> tags. There must be exactly ONE H1 (in the hero), containing the city name.`,
    );
  } else if (!h1s[0]!.includes(cityLower)) {
    issues.push(`The single <h1> does not contain the city "${city}". The hero H1 must include the city.`);
  }

  // 2. A lead form must be present (the tool's "form on RIGHT" hero check).
  // STS production pages inject the hero form via a Joomla `{loadposition ...form}`
  // tag rather than a literal <form> element, so accept that convention too —
  // otherwise a faithful build is falsely failed. (The reference billings-mt.html
  // uses `{loadposition city-hero-form}` and has no literal <form>.)
  const hasForm =
    /<form\b/i.test(html) ||
    /<input\b/i.test(html) ||
    /<textarea\b/i.test(html) ||
    /\{loadposition[^}]*form[^}]*\}/i.test(html);
  if (!hasForm) {
    issues.push(
      "No lead form found. The hero must include a contact/quote form (a <form> or the Joomla {loadposition ...-form} injection tag).",
    );
  }

  // 3. Mobile responsiveness: viewport meta + at least one media query so images
  // don't squeeze the text on small screens.
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    issues.push('Missing <meta name="viewport">. The page must be mobile responsive.');
  }
  if (!/@media\b/i.test(lower)) {
    issues.push(
      "No @media query found. The page must be mobile responsive so images do not squeeze the text.",
    );
  }

  return {
    passed: issues.length === 0,
    issue: issues.join(" "),
  };
}

```

### Source — extract.test.ts

`scripts/src/bakeoff/extract.test.ts` — 3,848 chars

````ts
import { describe, expect, it } from "vitest";
import { extractHtmlDocument } from "./extract";
import { ARTIFACT_TO_INLINE } from "./miniPrompts";

describe("extractHtmlDocument", () => {
  it("extracts a real <!DOCTYPE html>…</html> document", () => {
    const raw =
      "<!DOCTYPE html>\n<html><head><title>Austin</title></head><body><h1>Hi</h1></body></html>";
    expect(extractHtmlDocument(raw)).toBe(raw);
  });

  it("strips leading narration before the document", () => {
    const raw =
      "I'll execute all phases now.\n\n## PHASE 0A — analysis\nHere is the page:\n\n" +
      "<!doctype html><html><body><p>page</p></body></html>\n\nLet me know if you need edits.";
    expect(extractHtmlDocument(raw)).toBe(
      "<!doctype html><html><body><p>page</p></body></html>",
    );
  });

  it("anchors on the real document even when narration echoes the PAGE_BUILDER comment first", () => {
    const raw =
      "<!-- PAGE_BUILDER_V3 -->\n## PHASE 0A — lots of prose narration here\n" +
      "blah blah checklist blah\n\n" +
      "<!DOCTYPE html><html><body><main>real page</main></body></html>";
    expect(extractHtmlDocument(raw)).toBe(
      "<!DOCTYPE html><html><body><main>real page</main></body></html>",
    );
  });

  it("throws on a narration-only response (never returns chatter as a page)", () => {
    const raw =
      "I'll execute all phases. ## EXECUTION CHECKLIST\n- [x] Research\n- [x] Build\n" +
      "Here is a summary of what I did. No document follows.";
    expect(() => extractHtmlDocument(raw, "gemini build")).toThrow(
      /gemini build returned no HTML document/,
    );
  });

  it("throws on a checklist-only response with no document", () => {
    const raw =
      "## PHASE 3 OUTPUT\n| ✅ | Swaps: 8 | Persona: Corporate IT Director |\n" +
      "I will now present the files using present_files.";
    expect(() => extractHtmlDocument(raw)).toThrow(/returned no HTML document/);
  });

  it("unescapes a JSON content create_file wrapper and extracts the document", () => {
    // Gemini's create_file wrapper unicode-escapes `<` as \u003c, so the raw text
    // has no literal document markers — extraction must JSON-unescape the content
    // field before it can find (and return) the real document.
    const inner = '<!DOCTYPE html>\n<html><body><p>wrapped "quoted" page</p></body></html>';
    const escapedContent = JSON.stringify(inner).replace(/</g, "\\u003c");
    expect(escapedContent).not.toContain("<");
    const raw =
      '```xml\n<tool_call>\n{"name": "create_file", "arguments": {"path": "index.html", "content": ' +
      escapedContent +
      "}}\n</tool_call>\n```";
    expect(extractHtmlDocument(raw)).toBe(inner);
  });
});

describe("ARTIFACT_TO_INLINE headless output contract", () => {
  // The verbatim copyPrompt() prompts tell the model to "create an artifact" and
  // "never paste code in chat". Over the API there is no artifact/canvas surface,
  // so a model that obeys literally emits no HTML. ARTIFACT_TO_INLINE is the ONE
  // uniform medium-translation the harness appends to every HTML-yielding turn,
  // applied identically to every model so the comparison stays apples-to-apples.

  it("neutralizes the artifact directive and demands the complete HTML inline", () => {
    expect(ARTIFACT_TO_INLINE).toContain("artifact");
    expect(ARTIFACT_TO_INLINE).toMatch(/COMPLETE, FINAL HTML document INLINE/);
    expect(ARTIFACT_TO_INLINE).toMatch(/<!DOCTYPE html> … <\/html>/);
  });

  it("forbids claiming an artifact is being created instead of emitting HTML", () => {
    expect(ARTIFACT_TO_INLINE).toMatch(/Do NOT\s+\n?\s*say an artifact is being created/);
  });

  it("states it applies to every model identically (no per-model special-casing)", () => {
    expect(ARTIFACT_TO_INLINE).toContain("applies to every model identically");
  });
});

````

### Source — extract.ts

`scripts/src/bakeoff/extract.ts` — 4,995 chars

````ts
/**
 * Pull the real HTML document out of a model's raw reply.
 *
 * Models wrap the page in chatter we must strip to compare apples-to-apples:
 *  - Claude prepends a markdown preamble ("I'll execute all phases… ## PHASE 0A").
 *  - Gemini sometimes wraps it in a hallucinated ```xml <tool_call> create_file
 *    block whose `content` field is a JSON-escaped HTML string.
 *  - Any model may fence the page in ```html / ```xml / ```json.
 *
 * Strategy: locate the actual document by its real markers (`<!DOCTYPE`/`<html`)
 * through the closing `</html>`. ONLY when neither real marker is present do we
 * fall back to the page-builder `<!-- PAGE_BUILDER` comment — otherwise a model
 * that echoes that directive at the TOP of its phase narration (Claude does this:
 * `<!-- PAGE_BUILDER_V3` followed by ~39KB of "## PHASE 0A…" prose before the real
 * `<!DOCTYPE html>`) would anchor the slice on the comment and capture all the
 * chatter as if it were the page. If markers aren't found in the raw text, try to
 * unescape a JSON `content` field (the create_file wrapper) and look again. Fail
 * loudly if no document is present rather than storing chatter as if it were a page.
 */

const PRIMARY_MARKERS = ["<!doctype html", "<html"];
const FALLBACK_MARKERS = ["<!-- page_builder", "<!-- page builder"];

function earliestMarker(lower: string, markers: string[]): number {
  let start = -1;
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && (start === -1 || idx < start)) start = idx;
  }
  return start;
}

function sliceDocument(text: string): string | null {
  const lower = text.toLowerCase();
  // Prefer the real document markers; only fall back to the page-builder comment
  // when no real `<!DOCTYPE>`/`<html>` exists, so leading narration is never kept.
  let start = earliestMarker(lower, PRIMARY_MARKERS);
  if (start === -1) start = earliestMarker(lower, FALLBACK_MARKERS);
  if (start === -1) return null;
  const end = lower.lastIndexOf("</html>");
  if (end === -1 || end <= start) return null;
  return text.slice(start, end + "</html>".length).trim();
}

/** Try to unescape a JSON `"content": "<...>"` field (create_file tool wrappers). */
function unescapeJsonContent(text: string): string | null {
  const match = text.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!match || !match[1]) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return null;
  }
}

/**
 * Non-throwing variant: return the HTML document if one is present, else null.
 * Used for turns where HTML output is OPTIONAL (seo-verify, verify-links) — the
 * model may only return a report, in which case we keep the prior page rather
 * than failing the run.
 */
export function tryExtractHtmlDocument(raw: string): string | null {
  const direct = sliceDocument(raw);
  if (direct) return direct;
  const unescaped = unescapeJsonContent(raw);
  if (unescaped) {
    const fromJson = sliceDocument(unescaped);
    if (fromJson) return fromJson;
  }
  return null;
}

export function extractHtmlDocument(raw: string, label = "model"): string {
  const doc = tryExtractHtmlDocument(raw);
  if (doc) return doc;

  throw new Error(
    `${label} returned no HTML document (no <!DOCTYPE>/<html>…</html> found). ` +
      `First 200 chars: ${raw.slice(0, 200).replace(/\s+/g, " ")}`,
  );
}

/**
 * Pull the JSON-LD payload out of a model's schema reply. The Schema Generator
 * contract REQUIRES the output to be a `<script type="application/ld+json">…
 * </script>` block (it is pasted verbatim into the page <head>), so we anchor on
 * the LAST such block (a model may quote the rule before emitting the real one)
 * and return the JSON text INSIDE it. Fail loud — schema-first — when no script
 * block is present or its contents aren't valid JSON, rather than storing prose
 * or a bare object as if it were the schema. The returned value is the inner
 * JSON string; callers re-wrap it in `<script>` tags for display/copy.
 */
const SCHEMA_SCRIPT_RE =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function extractSchemaJson(raw: string, label = "schema"): string {
  let inner: string | null = null;
  let m: RegExpExecArray | null;
  SCHEMA_SCRIPT_RE.lastIndex = 0;
  while ((m = SCHEMA_SCRIPT_RE.exec(raw)) !== null) {
    if (m[1] && m[1].trim()) inner = m[1].trim();
  }
  if (inner == null) {
    throw new Error(
      `${label} returned no <script type="application/ld+json">…</script> block. ` +
        `The Schema Generator must emit the JSON-LD wrapped in a script tag. ` +
        `First 200 chars: ${raw.slice(0, 200).replace(/\s+/g, " ")}`,
    );
  }
  try {
    JSON.parse(inner);
  } catch (err) {
    throw new Error(
      `${label} script block did not contain valid JSON ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        `First 200 chars of payload: ${inner.slice(0, 200).replace(/\s+/g, " ")}`,
    );
  }
  return inner;
}

````

### Source — fixtures.ts

`scripts/src/bakeoff/fixtures.ts` — 2,738 chars

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The REAL design files a VA uploads into the Claude.ai Project before running
 * the No-GMB checklist, committed verbatim as repo fixtures so every model in
 * the bake-off receives the IDENTICAL source material:
 *
 *  - `master-page-builder.txt`   — the "Master Page Builder" doc (uploaded .docx)
 *  - `master-design-tier2.html`  — the "Master Design (Tier 2)" Bible CODE
 *                                  reference page (uploaded .docx)
 *  - `sts-seo-data-2026.tsv`     — the "STS SEO Data 2026" GSC pages report
 *                                  (uploaded .xlsx)
 *  - `master-seo-audit.txt`      — the "Master SEO Audit" doc (uploaded .txt)
 *  - `master-schema-generator.txt` — the "Schema Generator" doc (MASTER SCHEMA
 *                                  GENERATOR v1.4.1 PRODUCTION), uploaded for the
 *                                  Phase-4 schema turn
 *
 * These are loaded ONCE and inlined into the conversation as the equivalent of
 * the VA's file uploads (the API has no file-attachment surface). Missing or
 * empty fixtures FAIL LOUDLY — a faithful run cannot proceed without the exact
 * material the human workflow depends on.
 */
export interface DesignFixtures {
  pageBuilder: string;
  designTier2: string;
  seoData: string;
  seoAudit: string;
  schemaGenerator: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "fixtures");

function loadFixture(file: string, label: string): string {
  const path = join(FIXTURE_DIR, file);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `Required design fixture "${label}" is missing at ${path} ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        `The bake-off cannot run faithfully without the real uploaded design files.`,
    );
  }
  if (!raw.trim()) {
    throw new Error(
      `Required design fixture "${label}" at ${path} is empty. ` +
        `Re-extract it from the uploaded source file before running the bake-off.`,
    );
  }
  return raw;
}

/** Load all design fixtures, failing loudly if any is missing or empty. */
export function loadDesignFixtures(): DesignFixtures {
  return {
    pageBuilder: loadFixture("master-page-builder.txt", "Master Page Builder"),
    designTier2: loadFixture("master-design-tier2.html", "Master Design (Tier 2)"),
    seoData: loadFixture("sts-seo-data-2026.tsv", "STS SEO Data 2026"),
    seoAudit: loadFixture("master-seo-audit.txt", "Master SEO Audit"),
    schemaGenerator: loadFixture("master-schema-generator.txt", "Schema Generator"),
  };
}

```

### Source — gmb.test.ts

`scripts/src/bakeoff/gmb.test.ts` — 5,912 chars

```ts
import { describe, expect, it } from "vitest";
import { billingsNoGmbContext } from "./cost";
import {
  BILLINGS_GMB,
  generateGmbSchema,
  generateNoGmbSchema,
  gmbContextSuffix,
} from "./gmb";
import {
  HQ_PHONE,
  buildPrompt,
  rebuildPrompt,
  seoPrompt,
  seoVerifyPrompt,
  verifyLinksPrompt,
  verifyLinksFixPrompt,
} from "./miniPrompts";

// The No-GMB backup-phone contract: a No-GMB page falls back to the STS HQ main
// line for call buttons, on-page contact, and the deterministic schema's
// `telephone`, while local address / local-branch phone / CID stay forbidden.
// This contract lives only in prompt text + one schema function, so these tests
// lock it in so a future edit can't silently drop the phone or re-introduce a
// forbidden local field.

describe("generateNoGmbSchema — No-GMB backup-phone contract", () => {
  const schemaJson = generateNoGmbSchema(billingsNoGmbContext());
  const schema = JSON.parse(schemaJson) as Record<string, unknown>;

  it("sets telephone to the STS HQ backup line", () => {
    expect(schema.telephone).toBe("844-699-2913");
    expect(HQ_PHONE).toBe("844-699-2913");
  });

  it("omits a local street address", () => {
    expect(schemaJson).not.toContain("streetAddress");
    const address = schema.address as Record<string, unknown> | undefined;
    expect(address?.streetAddress).toBeUndefined();
  });

  it("omits a postal code", () => {
    expect(schemaJson).not.toContain("postalCode");
    const address = schema.address as Record<string, unknown> | undefined;
    expect(address?.postalCode).toBeUndefined();
  });

  it("omits a CID / identifier", () => {
    expect(schema.identifier).toBeUndefined();
    expect(schemaJson).not.toContain("identifier");
    expect(schemaJson).not.toContain("cid:");
  });

  it("omits hasMap (GMB-only)", () => {
    expect(schema.hasMap).toBeUndefined();
    expect(schemaJson).not.toContain("hasMap");
  });
});

// The symmetric GMB contract: an enriched GMB page DOES carry the local
// PostalAddress (streetAddress + postalCode), the verified CID `identifier`,
// `hasMap`, `geo` coordinates, and its OWN GMB profile phone — never the STS HQ
// backup line that the No-GMB scenario falls back to. These tests lock that in
// so a future edit can't quietly drop a required GMB field or accidentally swap
// in the HQ number.
describe("generateGmbSchema — GMB enriched-field contract", () => {
  const schemaJson = generateGmbSchema(billingsNoGmbContext(), BILLINGS_GMB);
  const schema = JSON.parse(schemaJson) as Record<string, unknown>;
  const address = schema.address as Record<string, unknown> | undefined;

  it("includes the local street address", () => {
    expect(address?.streetAddress).toBe(BILLINGS_GMB.street);
  });

  it("includes the postal code", () => {
    expect(address?.postalCode).toBe(BILLINGS_GMB.zip);
  });

  it("includes the CID identifier", () => {
    expect(schema.identifier).toBe(BILLINGS_GMB.cid);
    expect(schemaJson).toContain("cid:");
  });

  it("includes hasMap", () => {
    expect(schema.hasMap).toBe(BILLINGS_GMB.gmbUrl);
  });

  it("includes geo coordinates", () => {
    expect(schema.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: BILLINGS_GMB.lat,
      longitude: BILLINGS_GMB.lng,
    });
  });

  it("uses the GMB profile phone, NOT the HQ backup line", () => {
    expect(schema.telephone).toBe(BILLINGS_GMB.phone);
    expect(schema.telephone).not.toBe(HQ_PHONE);
  });
});

describe("gmbContextSuffix — enriched-context block", () => {
  const suffix = gmbContextSuffix(BILLINGS_GMB);

  it("carries the explicit page_url + GMB data", () => {
    expect(suffix).toContain(`page_url: ${BILLINGS_GMB.pageUrl}`);
    expect(suffix).toContain(`gmb_url: ${BILLINGS_GMB.gmbUrl}`);
    expect(suffix).toContain(`gmb_cid: ${BILLINGS_GMB.cid}`);
    expect(suffix).toContain("GMB data:");
    expect(suffix).toContain(BILLINGS_GMB.businessName);
    expect(suffix).toContain(BILLINGS_GMB.phone);
  });

  it("labels the block EXPERIMENTAL / illustrative, not verified ground truth", () => {
    expect(suffix).toContain("EXPERIMENTAL");
    expect(suffix).toMatch(/illustrative/i);
    expect(suffix).toMatch(/NOT verified/i);
  });
});

describe("No-GMB prompt strings — backup-phone contract", () => {
  const vars = {
    city: "Billings",
    state: "MT",
    url: "https://www.stselectronicrecyclinginc.com/billings-mt",
    niche: "electronics recycling",
    pageName: "billings-electronics-recycling.html",
    hubSpoke: "",
  };

  const promptCases: Array<[string, string]> = [
    ["build", buildPrompt(vars)],
    ["rebuild", rebuildPrompt(vars, "Hero form on wrong side")],
    ["seo", seoPrompt(vars)],
    ["seo-verify", seoVerifyPrompt(vars)],
    ["verify-links", verifyLinksPrompt()],
    ["verify-links fix", verifyLinksFixPrompt()],
  ];

  // A line carries a prohibition only when a negative/forbidding marker sits on
  // the SAME line as the forbidden thing — so "do NOT invent a local phone" or
  // "❌ A street address" count, but a hypothetical "include a local phone" would
  // not. This is what makes the test enforce the contract rather than keywords.
  const PROHIBIT = /\b(do not|don't|never|no|remove|without|forbid)\b|❌|🚫/i;
  const hasProhibitiveLine = (prompt: string, subject: RegExp): boolean =>
    prompt.split("\n").some((line) => subject.test(line) && PROHIBIT.test(line));

  for (const [name, prompt] of promptCases) {
    describe(`${name} prompt`, () => {
      it("references the STS HQ backup number", () => {
        expect(prompt).toContain(HQ_PHONE);
      });

      it("explicitly prohibits an invented LOCAL phone", () => {
        expect(hasProhibitiveLine(prompt, /local[^\n]*phone/i)).toBe(true);
      });

      it("explicitly prohibits a local street address", () => {
        expect(hasProhibitiveLine(prompt, /street address/i)).toBe(true);
      });
    });
  }
});

```

### Source — gmb.ts

`scripts/src/bakeoff/gmb.ts` — 7,953 chars

```ts
import { generateLocalBusinessSchema, type RunContext } from "@workspace/mc-core";
import { HQ_PHONE } from "./miniPrompts.js";

/**
 * The "GMB-enriched" scenario for the bake-off.
 *
 * In the production (No-GMB) context, the run context deliberately omits an
 * explicit page_url and any Google Business Profile (GMB) data — STS spoke
 * pages target a service-area city, not a verified physical storefront. Three
 * of the four models build anyway under that context; GPT refused, asking for
 * the page_url + GMB block before it would build.
 *
 * This module supplies a SECOND, symmetric experiment: hand EVERY model the
 * exact same enriched context (explicit page_url + a GMB data block) so we can
 * see whether the refusing model builds well once given the inputs it demands —
 * a fair re-run, not an OpenAI-only prompt hack.
 *
 * The GMB values below are EXPERIMENTAL / illustrative for this comparison, not
 * verified ground truth. They are labelled as such in the context block so the
 * fail-loud / no-fabrication convention is respected: the experiment measures
 * build behaviour given a well-formed GMB block, it does not assert these are
 * STS's real verified location details. The phone uses the reserved-fictional
 * 555-01xx range; the CID and street address are placeholders.
 */
export interface GmbProfile {
  pageUrl: string;
  gmbUrl: string;
  cid: string;
  businessName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  phone: string;
  neighborhoods: string[];
  landmark: string;
  lat: number;
  lng: number;
  hours: string;
}

export const BILLINGS_GMB: GmbProfile = {
  pageUrl: "https://www.stselectronicrecyclinginc.com/billings-mt",
  gmbUrl: "https://www.google.com/maps?cid=12127465100000000000",
  cid: "cid:12127465100000000000",
  businessName: "STS Electronic Recycling — Billings",
  street: "1234 Industrial Ave",
  city: "Billings",
  state: "MT",
  zip: "59101",
  county: "Yellowstone County",
  phone: "(406) 555-0142",
  neighborhoods: ["Downtown Billings", "Billings Heights", "West End"],
  landmark: "near Billings Logan International Airport",
  lat: 45.7833,
  lng: -108.5007,
  hours: "Mon-Fri 8:00-17:00",
};

/**
 * Resolve the GMB block for a GMB-scenario run against a given target. Defaults
 * to the illustrative {@link BILLINGS_GMB} ONLY for the Billings smoke target;
 * for any OTHER city a verified block MUST be supplied via `BAKEOFF_GMB_JSON`
 * (fail loud — never invent a CID, street address, or phone for a real page).
 */
export function resolveGmbProfile(target: { city: string; state: string }): GmbProfile {
  const raw = process.env.BAKEOFF_GMB_JSON;
  if (!raw) {
    const isBillings =
      target.city.toLowerCase() === "billings" && target.state.toUpperCase() === "MT";
    if (!isBillings) {
      throw new Error(
        `GMB scenario for ${target.city}, ${target.state} requires a verified GMB block. ` +
          `Set BAKEOFF_GMB_JSON to a JSON object with: pageUrl, gmbUrl, cid, businessName, street, ` +
          `city, state, zip, county, phone, landmark, lat, lng, hours (neighborhoods optional). ` +
          `Never invent a CID/address/phone for a real page.`,
      );
    }
    return BILLINGS_GMB;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `BAKEOFF_GMB_JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const required = [
    "pageUrl",
    "gmbUrl",
    "cid",
    "businessName",
    "street",
    "city",
    "state",
    "zip",
    "county",
    "phone",
    "landmark",
    "lat",
    "lng",
    "hours",
  ];
  for (const key of required) {
    if (parsed[key] == null || parsed[key] === "") {
      throw new Error(
        `BAKEOFF_GMB_JSON is missing required field "${key}". A GMB page must SUPPLY its verified block — no invention.`,
      );
    }
  }
  return {
    pageUrl: String(parsed.pageUrl),
    gmbUrl: String(parsed.gmbUrl),
    cid: String(parsed.cid),
    businessName: String(parsed.businessName),
    street: String(parsed.street),
    city: String(parsed.city),
    state: String(parsed.state),
    zip: String(parsed.zip),
    county: String(parsed.county),
    phone: String(parsed.phone),
    neighborhoods: Array.isArray(parsed.neighborhoods) ? parsed.neighborhoods.map(String) : [],
    landmark: String(parsed.landmark),
    lat: Number(parsed.lat),
    lng: Number(parsed.lng),
    hours: String(parsed.hours),
  };
}

/**
 * The enriched-context suffix appended AFTER the production `describeContext`
 * output. It is added only inside the harness — the shipped `describeContext`
 * prod path is never modified — so the No-GMB scenario stays a faithful
 * reproduction of production while this scenario adds the explicit page_url +
 * GMB block on top.
 */
export function gmbContextSuffix(p: GmbProfile): string {
  return [
    "",
    "",
    "[EXPERIMENTAL ENRICHED CONTEXT — explicit page_url + Google Business Profile (GMB) block.",
    "These GMB details are illustrative inputs for a fair, symmetric re-run comparison, NOT verified",
    "ground-truth location data. Every model in this scenario receives this identical block.]",
    "",
    `page_url: ${p.pageUrl}`,
    `gmb_url: ${p.gmbUrl}`,
    `gmb_cid: ${p.cid}`,
    "GMB data:",
    `- Business name: ${p.businessName}`,
    `- Address: ${p.street}, ${p.city}, ${p.state} ${p.zip}`,
    `- County: ${p.county}`,
    `- Phone: ${p.phone}`,
    `- Neighborhoods: ${p.neighborhoods.join(", ")}`,
    `- Landmark: ${p.landmark}`,
    `- Coordinates: ${p.lat}, ${p.lng}`,
    `- Hours: ${p.hours}`,
  ].join("\n");
}

/**
 * GMB-aware deterministic LocalBusiness JSON-LD for the enriched scenario.
 * Mirrors `generateLocalBusinessSchema` but, because this scenario has a GMB
 * block, it can emit the full PostalAddress (street + ZIP), the verified CID
 * identifier, telephone, geo coordinates and a `hasMap`/`sameAs` ?cid= URL —
 * exactly what a HUB/GMB schema carries that a No-GMB spoke schema cannot.
 * Still deterministic and identical across models, so it is not a model
 * differentiator.
 */
export function generateGmbSchema(ctx: RunContext, p: GmbProfile): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: p.businessName,
    url: p.pageUrl,
    identifier: p.cid,
    telephone: p.phone,
    areaServed: { "@type": "City", name: p.city },
    address: {
      "@type": "PostalAddress",
      streetAddress: p.street,
      addressLocality: p.city,
      addressRegion: p.state,
      postalCode: p.zip,
      addressCountry: "US",
    },
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    hasMap: p.gmbUrl,
    sameAs: [p.gmbUrl],
    makesOffer: ctx.registry.sacredLinks.map((l) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: l.label, url: l.url },
    })),
  };
  return JSON.stringify(schema, null, 2);
}

/**
 * No-GMB deterministic schema for the bake-off, BAKE-OFF ONLY.
 *
 * Wraps the production city/state `generateLocalBusinessSchema` (the source of
 * truth, left untouched in `lib/mc-core`) and adds ONLY a `telephone` set to the
 * STS HQ backup line. There is still NO `streetAddress`, NO `postalCode`, NO
 * CID/identifier, and NO `hasMap` — those remain GMB-only. This is what the
 * No-GMB scenario's `schemaFn` emits so the schema turn carries the HQ phone.
 */
export function generateNoGmbSchema(ctx: RunContext): string {
  const base = JSON.parse(generateLocalBusinessSchema(ctx)) as Record<string, unknown>;
  const withPhone = {
    "@context": base["@context"],
    "@type": base["@type"],
    name: base.name,
    url: base.url,
    telephone: HQ_PHONE,
    areaServed: base.areaServed,
    address: base.address,
    makesOffer: base.makesOffer,
  };
  return JSON.stringify(withPhone, null, 2);
}

```

### Source — produce.ts

`scripts/src/bakeoff/produce.ts` — 12,032 chars

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegistry,
  parseSchema,
  runCheckers,
  type RunContext,
} from "@workspace/mc-core";
import { gmbSchemaPrompt, schemaPrompt, type PromptVars } from "./miniPrompts.js";
import { loadDesignFixtures } from "./fixtures.js";
import { estimateCost } from "./cost.js";
import { runConversation } from "./conversation.js";
import { runRoutedConversation } from "./routed.js";
import { generateSharedGrounding, type SharedGrounding } from "./grounding.js";
import { gmbContextSuffix, resolveGmbProfile } from "./gmb.js";
import { resolveTarget } from "./target.js";
import {
  buildModelsForIds,
  resolveModelId,
  resolveRouting,
  routedModelIds,
  type ResolvedRouting,
  type RoutedModel,
} from "./routing.js";
import type { PhaseTiming } from "./types.js";
import type { BakeoffResults, ModelResult, ScenarioResult } from "./types.js";

/**
 * PRODUCE — the operator-facing page builder behind the two plain-language modes:
 *
 *   "run this through 1 llm"        → BAKEOFF_PRODUCE_MODE=single  (+ BAKEOFF_MODEL)
 *   "run this through the multi llm" → BAKEOFF_PRODUCE_MODE=routed
 *
 * Both drive the SAME build → design-gate → SEO → SEO-verify → schema →
 * link-verify pipeline; the only difference is WHO runs each phase. The existing
 * 6-model comparison (`run.ts`, "all of them") is untouched.
 *
 * SINGLE mode reuses the faithful continuous-chat engine (runConversation) with
 * one chosen model. ROUTED mode uses runRoutedConversation: a main model per
 * phase with OpenAI GPT-5.4 as the backup that auto-takes over on error/refusal/
 * invalid output. Output is written to a SEPARATE produce.json so it never
 * clobbers the comparison results.json, and surfaces in the Bake-Off viewer
 * under the "Produced Page" dataset (copy boxes, preview, schema, checkers).
 *
 * Target + scenario are env-driven so the agent can wire them per chat. A NEW GMB
 * page MUST supply its verified GMB block (BAKEOFF_GMB_JSON) — never invented.
 */

const MODE = (process.env.BAKEOFF_PRODUCE_MODE ?? "").toLowerCase();
const SINGLE_MODEL = process.env.BAKEOFF_MODEL ?? "";
const SCENARIO = (process.env.BAKEOFF_SCENARIO ?? "no-gmb").toLowerCase();

const TARGET = resolveTarget();

const BUSINESS_NAME = "STS Electronic Recycling";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(HERE, "../../../artifacts/bake-off/src/data/produce.json");

function baseContext(): RunContext {
  return {
    city: TARGET.city,
    state: TARGET.state,
    track: "page",
    classification: TARGET.classification,
    competition: TARGET.competition,
    pageType: TARGET.pageType,
    niche: TARGET.niche,
    existingUrls: [],
    handoff: null,
    verifiedCid: null,
    designBibleHash: null,
    blogTopic: null,
    researchBrief: null,
    seoIntel: null,
    registry: buildRegistry(),
  };
}

/** Author the shared grounding with a main→backup fallback (routed mode). */
async function authorGroundingWithFallback(
  main: RoutedModel,
  backup: RoutedModel,
): Promise<SharedGrounding> {
  try {
    return await generateSharedGrounding(main.complete, TARGET.city, TARGET.state, TARGET.niche);
  } catch (err) {
    console.log(
      `  ! grounding via ${main.label} failed (${err instanceof Error ? err.message : String(err)}); ` +
        `falling back to ${backup.label}.`,
    );
    return await generateSharedGrounding(backup.complete, TARGET.city, TARGET.state, TARGET.niche);
  }
}

function describeRouting(r: ResolvedRouting): string {
  return (
    `build:${r.build.main.id} seo:${r.seo.main.id} verify:${r["seo-verify"].main.id} ` +
    `schema:${r.schema.main.id} links:${r["verify-links"].main.id} · backup:${r.build.backup.id}`
  );
}

interface RunOutcome {
  html: string;
  schema: string;
  totalMs: number;
  turns: { phase: string; ms: number; summary: string; verdict?: "passed" | "failed" | null }[];
}

async function main(): Promise<void> {
  if (MODE !== "single" && MODE !== "routed") {
    throw new Error(
      `Set BAKEOFF_PRODUCE_MODE=single|routed. ` +
        `"single" = run EVERY phase through one model (set BAKEOFF_MODEL, e.g. openai, claude, gemini, grok, openai-54). ` +
        `"routed" = the multi-LLM per-phase routing with GPT-5.4 backup.`,
    );
  }

  const isGmb = SCENARIO === "gmb";
  if (SCENARIO !== "gmb" && SCENARIO !== "no-gmb") {
    throw new Error(`BAKEOFF_SCENARIO must be "no-gmb" or "gmb" (got "${SCENARIO}").`);
  }

  console.log(`Produce: mode=${MODE}, scenario=${SCENARIO}, target=${TARGET.city}, ${TARGET.state} — ${TARGET.url}`);

  const fixtures = loadDesignFixtures();
  console.log(
    `Loaded design fixtures: page-builder ${fixtures.pageBuilder.length}, design-tier2 ${fixtures.designTier2.length}, ` +
      `seo-data ${fixtures.seoData.length}, seo-audit ${fixtures.seoAudit.length}, schema-gen ${fixtures.schemaGenerator.length} chars.`,
  );

  const gmb = isGmb ? resolveGmbProfile(TARGET) : null;
  const introEnrichment = isGmb ? gmbContextSuffix(gmb!) : "";
  const schemaPromptFor: (vars: PromptVars) => string = isGmb
    ? (vars) =>
        gmbSchemaPrompt(vars, {
          cid: gmb!.cid,
          gmbUrl: gmb!.gmbUrl,
          businessName: gmb!.businessName,
          street: gmb!.street,
          zip: gmb!.zip,
          phone: gmb!.phone,
          lat: gmb!.lat,
          lng: gmb!.lng,
        })
    : (vars) => schemaPrompt(vars);
  const verifiedCid = isGmb ? gmb!.cid : null;
  const ctx: RunContext = isGmb ? { ...baseContext(), verifiedCid: gmb!.cid } : baseContext();

  let grounding: SharedGrounding;
  let outcome: RunOutcome;
  let runId: string;
  let runLabel: string;
  let runModelTag: string;
  let runProvider: string;
  let costModelTag: string;
  let routingNote: string;

  if (MODE === "single") {
    if (!SINGLE_MODEL.trim()) {
      throw new Error(
        `single mode requires BAKEOFF_MODEL (e.g. openai, chatgpt, claude, gemini, grok, openai-54).`,
      );
    }
    const id = resolveModelId(SINGLE_MODEL);
    const reg = await buildModelsForIds([id]);
    const model = reg.get(id)!;
    console.log(`Single engine: ${model.label} (${model.model}) runs every phase.`);
    grounding = await generateSharedGrounding(model.complete, TARGET.city, TARGET.state, TARGET.niche);
    const conv = await runConversation({
      ctx,
      complete: model.complete,
      fixtures,
      grounding: grounding.content,
      introEnrichment,
      schemaPromptFor,
    });
    outcome = { html: conv.html, schema: conv.schema, totalMs: conv.totalMs, turns: conv.turns };
    runId = `single-${model.id}`;
    runLabel = `${model.label} — single engine`;
    runModelTag = model.model;
    runProvider = model.provider;
    costModelTag = model.model;
    routingNote = `Single engine: ${model.label} (${model.model}) ran every phase through the same pipeline.`;
  } else {
    const reg = await buildModelsForIds(routedModelIds());
    const routing = resolveRouting(reg);
    console.log(`Routed (multi-LLM): ${describeRouting(routing)}`);
    grounding = await authorGroundingWithFallback(routing.grounding.main, routing.grounding.backup);
    const routed = await runRoutedConversation({
      ctx,
      fixtures,
      grounding: grounding.content,
      introEnrichment,
      schemaPromptFor,
      routing,
    });
    outcome = { html: routed.html, schema: routed.schema, totalMs: routed.totalMs, turns: routed.turns };
    const backups = routed.attribution.filter((a) => a.viaBackup);
    runId = "routed-multi";
    runLabel = "Routed (multi-LLM)";
    runModelTag = describeRouting(routing);
    runProvider = "Mixed (routed)";
    costModelTag = routing.build.main.model;
    routingNote =
      `Routed multi-LLM run. Per-phase mains: ${describeRouting(routing)}. ` +
      (backups.length
        ? `Backup (GPT-5.4) stepped in for: ${backups.map((b) => b.phase).join(", ")}.`
        : `No backup was needed — every main model succeeded.`);
  }

  // Assemble the ModelResult (mirrors run.ts's success path, minus the
  // reference-comparison scores: the produced page is for an arbitrary target,
  // so scoring it against the Billings reference would be meaningless — the
  // city-aware CHECKER suite is the meaningful, comparison-free quality signal).
  const timings: PhaseTiming[] = outcome.turns.map((t) => ({
    phase: t.phase,
    ms: t.ms,
    summary: t.summary,
    errorCount: 0,
    warningCount: 0,
    wordCount: 0,
    verdict: t.verdict,
  }));

  const parsedSchema = parseSchema(outcome.schema);
  const report = runCheckers({
    html: outcome.html,
    registry: ctx.registry,
    pageType: ctx.pageType,
    track: ctx.track,
    classification: ctx.classification,
    city: ctx.city,
    afterAudit: true,
    schema: outcome.schema,
    verifiedCid,
    businessName: BUSINESS_NAME,
    entities: [],
  });

  const schemaTiming = timings.find((t) => t.phase === "schema");
  if (schemaTiming) {
    schemaTiming.errorCount = report.errorCount;
    schemaTiming.warningCount = report.warningCount;
    schemaTiming.wordCount = report.wordCount;
  }

  const costEstimate = estimateCost({
    modelTag: costModelTag,
    timings,
    htmlChars: outcome.html.length,
    ctx,
    fixtures,
    grounding: grounding.content,
    introEnrichment,
  });

  const result: ModelResult = {
    id: runId,
    label: runLabel,
    provider: runProvider,
    model: runModelTag,
    status: "ok",
    error: null,
    research: {
      summary: grounding.content,
      entities: [],
      sources: [],
      flags: [],
      raw: grounding.content,
    },
    html: outcome.html,
    schema: outcome.schema,
    schemaValid: parsedSchema != null,
    checkerReport: report,
    linkAudit: report.linkAudit,
    timings,
    totalMs: outcome.totalMs,
    scores: null,
    screenshot: null,
    costEstimate,
  };

  const scenario: ScenarioResult = {
    id: isGmb ? "produce-gmb" : "produce",
    label: `${MODE === "single" ? "Single engine" : "Multi-LLM routed"} — ${isGmb ? "GMB" : "No-GMB"}`,
    description:
      `${MODE === "single" ? "One model ran every phase" : "Main-per-phase routing with GPT-5.4 backup"} ` +
      `of the same build → design-gate → SEO → SEO-verify → schema → link-verify pipeline for ` +
      `${TARGET.city}, ${TARGET.state}.`,
    notes: [
      routingNote,
      isGmb
        ? "GMB scenario: the verified Google Business Profile block (CID + full address) was supplied to the build and schema phases."
        : "No-GMB scenario: city/state targeting only — no CID, no street address, no local phone (per the No-GMB checklist).",
      `Cost is a best-effort estimate priced at the ${costModelTag} tier${MODE === "routed" ? " (representative — a routed run mixes provider tiers, so this is approximate)" : ""}; token usage is not captured.`,
      "Comparison scores (HTML/visual closeness) are omitted: this is a production page for an arbitrary target, not a re-run against the Billings reference. The checker report is the quality signal.",
    ],
    models: [result],
  };

  const output: BakeoffResults = {
    ranAt: new Date().toISOString(),
    target: TARGET,
    grounding: { source: grounding.source, content: grounding.content },
    scenarios: [scenario],
    referenceScreenshot: null,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n✓ Produced page written to ${OUTPUT_PATH}`);
  console.log(
    `  ${result.label}: ${(result.totalMs / 1000).toFixed(1)}s, ${report.errorCount} error(s), ` +
      `${report.warningCount} warning(s), schema ${result.schemaValid ? "valid" : "INVALID"}, ~$${costEstimate.totalUsd.toFixed(2)} est.`,
  );
  console.log(`  View it in the Bake-Off viewer under the "Produced Page" dataset.`);
}

main().catch((err) => {
  console.error("Produce run failed:", err);
  process.exitCode = 1;
});

```

### Source — providers.ts

`scripts/src/bakeoff/providers.ts` — 17,343 chars

````ts
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { EngineResult } from "@workspace/mc-core";

/**
 * One turn in the running conversation. The bake-off drives every model through
 * the SAME continuous No-GMB checklist chat, so the completion surface is
 * message-history-based (not a fresh system/user pair per phase): the caller
 * accumulates `user` + `assistant` turns and passes the whole history every
 * time, exactly as a Claude.ai chat carries its scrollback.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A provider-agnostic, STATEFUL completion: takes the full message history (plus
 * an optional system instruction) and returns the model's next turn as an
 * {@link EngineResult}. This is the ONLY provider-specific surface in the
 * bake-off — the prompts, the file fixtures, and the turn sequence above it are
 * identical for every model, so the comparison stays apples-to-apples.
 *
 * The page-build conversation passes NO system prompt (in the real workflow the
 * design files are *uploaded into the chat* and the rules live in the intro
 * user turn, not a system prompt). `system` exists only for the one-shot shared
 * grounding author, which is not part of any model's build conversation.
 *
 * These adapters live here in the scripts package, NOT in `lib/mc-core`, so the
 * shipped pipeline engine stays Claude-only. Every adapter calls the provider
 * DIRECTLY with STS's own API key — Claude via ANTHROPIC_API_KEY, Gemini via
 * GEMINI_API_KEY, OpenAI via OPENAI_API_KEY, Grok via XAI_API_KEY against xAI's
 * own endpoint. No Replit AI-Integrations proxy and no OpenRouter are used.
 */
/**
 * Per-turn knobs applied to a SINGLE completion call. Today the only knob is
 * `webSearch`: when set, the adapter attaches the provider's NATIVE web-search
 * tool for THAT call only. It is the capability analogue of `ARTIFACT_TO_INLINE`
 * — switched on uniformly for one specific turn (the SEO-verify turn, whose
 * prompt explicitly says "search the web for current 2025-2026 SEO best
 * practices") and off everywhere else, so the prompts/history/turn order stay
 * byte-identical and the comparison stays apples-to-apples. Off by default, so
 * every existing call site is unchanged.
 */
export interface CompleteOptions {
  webSearch?: boolean;
  /**
   * Override the per-call output-token budget for THIS completion only. Defaults
   * to the module cap (`MAX_OUTPUT_TOKENS`, or `OPENAI_MAX_OUTPUT_TOKENS` for the
   * OpenAI adapter) when unset, so every existing call site is unchanged. Used by
   * out-of-band tooling (e.g. the dossier review) that wants a smaller reservation
   * so a very large prompt still fits a provider's context window. Like
   * `webSearch`, this is a transport knob — it never touches prompts/history/turn
   * order, so the model comparison stays apples-to-apples.
   */
  maxOutputTokens?: number;
}

export type CompleteFn = (
  messages: ChatMessage[],
  system?: string,
  opts?: CompleteOptions,
) => Promise<EngineResult>;

/** Generous output budget — full SEO pages run well past the default limits. */
const MAX_OUTPUT_TOKENS = 32000;

/**
 * OpenAI's "pro" reasoning models bill reasoning tokens against the same output
 * budget as the visible answer, so a full ~46K-char page PLUS its hidden
 * reasoning trace needs a much larger cap than the visible-only models — too low
 * and the page truncates mid-build. The cap only sets headroom; unused tokens
 * are never billed.
 */
const OPENAI_MAX_OUTPUT_TOKENS = 64000;

/**
 * Reasoning effort for the OpenAI "pro" tier. Pro defaults to "high", which on a
 * long generative HTML build turn produces a very large hidden reasoning trace —
 * slow enough to blow the per-turn timeout and costly enough to balloon the run.
 * "medium" is a balanced working level that keeps the build faithful while
 * fitting the time/cost budget; override via env if a run wants full effort.
 * This tunes only HOW HARD the model thinks, never the prompts or turn order.
 */
const OPENAI_REASONING_EFFORT = (process.env.BAKEOFF_OPENAI_REASONING ?? "medium") as
  | "low"
  | "medium"
  | "high";

/** xAI's OpenAI-compatible endpoint. */
const XAI_BASE_URL = "https://api.x.ai/v1";

/**
 * Per-request network timeout (ms) applied to EVERY provider completion call,
 * plus a small bounded retry. Without this a stalled provider call can hang the
 * whole resumable run forever. The guard wraps ONLY the network completion call
 * — it never touches prompts, history, or the turn sequence, so the bake-off
 * stays apples-to-apples. A model that exhausts its retries (or genuinely
 * refuses) surfaces a clear, labelled error the per-model try/catch records.
 *
 * Full SEO pages legitimately take minutes (Claude streaming runs the longest),
 * so the default is generous; override via env if needed.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.BAKEOFF_REQUEST_TIMEOUT_MS ?? 600_000);
const MAX_ATTEMPTS = Math.max(1, Number(process.env.BAKEOFF_MAX_ATTEMPTS ?? 2));
/** Wall-clock backstop sits above the SDK timeout so the SDK aborts cleanly first. */
const WALL_CLOCK_MS = REQUEST_TIMEOUT_MS + 30_000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`${name} is not set; add STS's own API key before running the bake-off.`);
  }
  return v;
}

/** Reject if `work` hasn't settled within `ms` — a hard wall-clock backstop. */
async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s with no response.`)),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Raw, single-attempt completion an adapter implements. */
type RawComplete = (
  messages: ChatMessage[],
  system?: string,
  opts?: CompleteOptions,
) => Promise<EngineResult>;

/**
 * Wrap a raw completion with a per-request timeout + small bounded retry. This
 * is the ONLY behavioural change vs. a plain provider call: it is transport
 * resilience, not a prompt/history change, so the comparison stays faithful. A
 * refusal returns content normally (no throw) and is therefore NOT retried —
 * only thrown transport/empty-response failures are.
 */
function guarded(model: string, fn: RawComplete): CompleteFn {
  return async (messages, system, opts) => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await withTimeout(fn(messages, system, opts), WALL_CLOCK_MS, `${model} completion`);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ! ${model} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
        if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 2_000 * attempt));
      }
    }
    throw new Error(
      `${model} failed after ${MAX_ATTEMPTS} attempt(s): ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`,
    );
  };
}

/** Strip a leading/trailing ```html / ```json code fence if present. */
function unfence(raw: string): string {
  const fence = raw.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence && fence[1]) return fence[1].trim();
  return raw.trim();
}

/** Claude direct, with STS's own ANTHROPIC_API_KEY. */
export function makeClaudeComplete(model: string): CompleteFn {
  const client = new Anthropic({
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  return guarded(model, async (messages, system, opts) => {
    // Stream: the Anthropic SDK refuses non-streaming requests whose token
    // budget could push the call past 10 minutes (full SEO pages are large).
    const stream = client.messages.stream({
      model,
      max_tokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      ...(system ? { system } : {}),
      // Native web_search server tool, attached ONLY on the flagged turn. Claude
      // runs the search itself and folds the results into its answer; we still
      // read only the text blocks below, so search/tool-result blocks are ignored.
      ...(opts?.webSearch
        ? { tools: [{ type: "web_search_20250305" as const, name: "web_search" as const }] }
        : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const message = await stream.finalMessage();
    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw };
  });
}

/** Gemini direct, with STS's own GEMINI_API_KEY. */
export function makeGeminiComplete(model: string): CompleteFn {
  const ai = new GoogleGenAI({
    apiKey: requireEnv("GEMINI_API_KEY"),
    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
  });
  return guarded(model, async (messages, system, opts) => {
    const resp = await ai.models.generateContent({
      model,
      // Gemini uses "model" for the assistant role and a `parts` array.
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        ...(system ? { systemInstruction: system } : {}),
        maxOutputTokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
        // Google Search grounding, attached ONLY on the flagged turn. Gemini
        // grounds its answer in live results; `resp.text` still aggregates the
        // model's text, so extraction is unchanged.
        ...(opts?.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });
    const raw = (resp.text ?? "").trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw };
  });
}

/** Prepend an optional system message to an OpenAI-style chat history. */
function openAiMessages(
  messages: ChatMessage[],
  system?: string,
): { role: "system" | "user" | "assistant"; content: string }[] {
  const out = messages.map((m) => ({ role: m.role, content: m.content }));
  return system ? [{ role: "system" as const, content: system }, ...out] : out;
}

/**
 * OpenAI top-tier model direct, with STS's own OPENAI_API_KEY, via the Responses
 * API. The gpt-5.x "pro" reasoning tier is served ONLY by `responses` — the
 * `chat/completions` endpoint 404s for it ("not a chat model") — and Responses is
 * also the forward-looking surface for the plain gpt-5.x chat tags, so the
 * adapter uses it uniformly: the chat history maps to `input` items, an optional
 * system maps to `instructions`, and the budget uses `max_output_tokens` (which
 * also covers the model's hidden reasoning tokens, hence the larger cap). This is
 * a transport change only — prompts, history, and turn order are untouched, so
 * the comparison stays apples-to-apples.
 */
export function makeOpenAIComplete(model: string): CompleteFn {
  const client = new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  // The "pro" tier mandates an explicit reasoning effort and rejects "low"
  // (valid: medium | high | xhigh), defaulting to the slow "high" when unset — so
  // we pin it to a configurable floor (medium). The plain chat tags (e.g. gpt-5.5)
  // run at the API default with no reasoning override. This only tunes HOW HARD a
  // pro model thinks; prompts, history, and turn order are identical everywhere.
  const isPro = /\bpro\b/i.test(model) || model.toLowerCase().includes("-pro");
  return guarded(model, async (messages, system, opts) => {
    // Submit as a BACKGROUND job and poll to completion. The synchronous Responses
    // endpoint enforces a server-side processing window (~minutes) that the
    // ultra-heavy "pro" tier routinely exceeds on the full page-build turn — it
    // returns "Request timed out" no matter how high our own client timeout is.
    // Background mode lifts that server-side cap; our WALL_CLOCK still bounds the
    // poll loop. This is a transport change only (identical prompt/input/turn
    // order) applied uniformly to every OpenAI tag, so no model is special-cased.
    let resp = await client.responses.create({
      model,
      max_output_tokens: opts?.maxOutputTokens ?? OPENAI_MAX_OUTPUT_TOKENS,
      background: true,
      ...(isPro ? { reasoning: { effort: OPENAI_REASONING_EFFORT } } : {}),
      ...(system ? { instructions: system } : {}),
      // Responses web_search tool, attached ONLY on the flagged turn. It coexists
      // with background poll mode; `resp.output_text` still aggregates the final
      // text once the run completes, so extraction below is unchanged.
      ...(opts?.webSearch ? { tools: [{ type: "web_search" as const }] } : {}),
      input: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    while (resp.status === "queued" || resp.status === "in_progress") {
      await new Promise((r) => setTimeout(r, 5_000));
      resp = await client.responses.retrieve(resp.id);
    }
    if (resp.status !== "completed") {
      throw new Error(
        `${model} background run ended as ${resp.status ?? "unknown"}: ${
          resp.error?.message ?? resp.incomplete_details?.reason ?? "no detail"
        }`,
      );
    }
    const raw = (resp.output_text ?? "").trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw };
  });
}

/** Grok direct via xAI's OpenAI-compatible endpoint, with STS's own XAI_API_KEY. */
export function makeGrokComplete(model: string): CompleteFn {
  const client = new OpenAI({
    apiKey: requireEnv("XAI_API_KEY"),
    baseURL: XAI_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  return guarded(model, async (messages, system, opts) => {
    // Native web search, attached ONLY on the flagged turn. xAI's old Live Search
    // (`search_parameters`) is deprecated (410 → "switch to the Agent Tools API"),
    // so the current native path is the `web_search` Agent Tool, which xAI serves
    // on its OpenAI-compatible RESPONSES endpoint (chat/completions rejects the
    // tool). We therefore route the flagged turn through `responses` with the
    // web_search tool; every other turn stays on plain chat/completions. The full
    // history is re-sent as `input` items, identical to the OpenAI adapter, so the
    // turn/prompt sequence is unchanged.
    if (opts?.webSearch) {
      let resp = await client.responses.create({
        model,
        max_output_tokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
        tools: [{ type: "web_search" as const }],
        ...(system ? { instructions: system } : {}),
        input: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      while (resp.status === "queued" || resp.status === "in_progress") {
        await new Promise((r) => setTimeout(r, 5_000));
        resp = await client.responses.retrieve(resp.id);
      }
      if (resp.status && resp.status !== "completed") {
        throw new Error(
          `${model} web-search run ended as ${resp.status}: ${
            resp.error?.message ?? resp.incomplete_details?.reason ?? "no detail"
          }`,
        );
      }
      const raw = (resp.output_text ?? "").trim();
      if (!raw) throw new Error(`${model} returned an empty response.`);
      return { content: unfence(raw), raw };
    }
    const resp = await client.chat.completions.create({
      model,
      max_tokens: opts?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      messages: openAiMessages(messages, system),
    });
    const raw = (resp.choices[0]?.message?.content ?? "").trim();
    if (!raw) throw new Error(`${model} returned an empty response.`);
    return { content: unfence(raw), raw };
  });
}

/**
 * Discover the newest general xAI Grok tag from xAI's own /models endpoint at
 * runtime. Picks the most-recently-created `grok-<version>` id, excluding
 * specialized variants (reasoning / non-reasoning / multi-agent / build /
 * imagine / image / video / code). Fails loudly if none exist rather than
 * guessing a tag.
 */
export async function discoverNewestGrok(): Promise<string> {
  const res = await fetch(`${XAI_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${requireEnv("XAI_API_KEY")}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`xAI models list failed (${res.status} ${res.statusText}).`);
  }
  const data = (await res.json()) as { data: Array<{ id: string; created: number }> };
  const candidates = data.data
    .filter(
      (m) =>
        /^grok-\d/.test(m.id) &&
        !/(multi-agent|build|imagine|image|video|reasoning|code)/i.test(m.id),
    )
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  if (candidates.length === 0) {
    throw new Error("No general grok model is available from xAI.");
  }
  return candidates[0]!.id;
}

````

### Source — rescore-visual.ts

`scripts/src/bakeoff/rescore-visual.ts` — 3,656 chars

```ts
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreModels } from "./score.js";
import { judgeVisual } from "./visual.js";
import type { BakeoffResults } from "./types.js";

/**
 * Re-run ONLY the visual judge against an existing bake-off result.
 *
 * The full bake-off (`pnpm bakeoff`) makes live calls to four LLM providers. This
 * script reuses the already-saved model HTML in `results.json`, renders each
 * model's page + the real reference page to screenshots, recomputes the visual
 * score (perceptual pixel-diff + optional vision-LLM) and the composite, writes
 * the screenshots into the viewer's public dir, and saves the updated JSON.
 *
 * Use it to add/refresh the visual judge without burning provider tokens.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = resolve(HERE, "../../../artifacts/bake-off/src/data/results.json");
const REFERENCE_HTML_PATH = resolve(HERE, "../../src/bakeoff/reference/billings-mt.html");
const SCREENSHOT_DIR = resolve(HERE, "../../../artifacts/bake-off/public/screenshots");
const SCREENSHOT_PREFIX = "screenshots";

/** Word-count floor is needed to recompute scores; mirror the registry default. */
async function wordCountFloor(): Promise<number> {
  const { buildRegistry } = await import("@workspace/mc-core");
  return buildRegistry().wordCountFloor;
}

async function main(): Promise<void> {
  const raw = await readFile(RESULTS_PATH, "utf8");
  const results = JSON.parse(raw) as BakeoffResults;
  const referenceHtml = await readFile(REFERENCE_HTML_PATH, "utf8");
  const floor = await wordCountFloor();

  const okTotal = results.scenarios
    .flatMap((s) => s.models)
    .filter((m) => m.status === "ok" && m.html).length;
  console.log(`Re-judging ${okTotal} successful model page(s) visually across ${results.scenarios.length} scenario(s)...`);
  if (okTotal === 0) {
    throw new Error("No successful models with HTML in results.json — nothing to render.");
  }

  // Per-scenario subdirs so identical model ids across scenarios don't collide.
  for (const scenario of results.scenarios) {
    const visual = await judgeVisual(scenario.models, referenceHtml, {
      outDir: join(SCREENSHOT_DIR, scenario.id),
      pathPrefix: `${SCREENSHOT_PREFIX}/${scenario.id}`,
      vision: true,
    });
    results.referenceScreenshot = visual.referenceScreenshot;
    for (const m of scenario.models) {
      m.screenshot = visual.screenshots.get(m.id) ?? null;
    }
    scoreModels(scenario.models, floor, referenceHtml, visual.verdicts);
    scenario.models.sort((a, b) => {
      if (a.status === "error" && b.status !== "error") return 1;
      if (b.status === "error" && a.status !== "error") return -1;
      return (b.scores?.composite ?? -1) - (a.scores?.composite ?? -1);
    });
  }

  await writeFile(RESULTS_PATH, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nUpdated ${RESULTS_PATH}`);
  for (const scenario of results.scenarios) {
    console.log(`\n[${scenario.label}]`);
    for (const m of scenario.models) {
      if (m.status !== "ok" || !m.scores) {
        console.log(`  ${m.label}: ${m.status === "ok" ? "—" : "ERROR"}`);
        continue;
      }
      const s = m.scores;
      const llm = s.visualLlm == null ? "n/a" : `${s.visualLlm}`;
      console.log(
        `  ${m.label}: visual=${s.visualMatch} (pixel=${s.visualPixel} llm=${llm} tokens=${s.visualTokens}) composite=${s.composite}`,
      );
    }
  }
}

main().catch((err) => {
  console.error("Visual rescore failed:", err);
  process.exitCode = 1;
});

```

### Source — routed.ts

`scripts/src/bakeoff/routed.ts` — 11,756 chars

```ts
import { describeContext, type RunContext } from "@workspace/mc-core";
import type { DesignFixtures } from "./fixtures.js";
import { evaluateDesignGate } from "./designGate.js";
import { extractHtmlDocument, extractSchemaJson, tryExtractHtmlDocument } from "./extract.js";
import {
  ARTIFACT_TO_INLINE,
  ARTIFACT_TO_INLINE_OPTIONAL,
  SCHEMA_TO_INLINE,
  buildPrompt,
  introPrompt,
  rebuildPrompt,
  seoPrompt,
  seoVerifyFixPrompt,
  seoVerifyPrompt,
  verifyLinksFixPrompt,
  verifyLinksPrompt,
  type PromptVars,
} from "./miniPrompts.js";
import {
  LINKS_VERDICT_FAIL,
  LINKS_VERDICT_PASS,
  SEO_VERDICT_FAIL,
  SEO_VERDICT_PASS,
  fileBlock,
  promptVars,
  readVerdict,
  type ConversationOutcome,
  type ConversationTurn,
} from "./conversation.js";
import type { PhaseRoute, ResolvedRouting, RoutedModel } from "./routing.js";

const RULE = "═══════════════════════════════════";

export interface RoutedDeps {
  ctx: RunContext;
  fixtures: DesignFixtures;
  /** The ONE shared research grounding, inlined identically into every phase. */
  grounding: string;
  /** Extra intro enrichment (GMB block for the GMB scenario; "" for No-GMB). */
  introEnrichment: string;
  /** Per-scenario schema prompt (No-GMB or GMB). */
  schemaPromptFor: (vars: PromptVars) => string;
  /** The resolved per-phase main+backup routing. */
  routing: ResolvedRouting;
  /** Max force-rebuild / corrective-verify attempts (default 2, env override). */
  rebuildCap?: number;
}

/** Which model actually produced each phase, and whether the backup stepped in. */
export interface PhaseAttribution {
  phase: string;
  modelId: string;
  modelLabel: string;
  viaBackup: boolean;
}

export interface RoutedOutcome extends ConversationOutcome {
  attribution: PhaseAttribution[];
}

/**
 * The ROUTED ("multi llm") pipeline. Unlike the single continuous chat in
 * runConversation, each phase is a FRESH call to its ASSIGNED model, seeded with
 * the shared grounding + build context + the current HTML (store-and-handoff —
 * different models cannot share one chat). Every phase runs main→backup: the
 * backup takes over when the main throws, refuses, or returns output that fails
 * the phase's structural check (no HTML for build/seo, invalid JSON-LD for
 * schema). Verify phases are report-primary and non-blocking on output, but the
 * backup still steps in if the main throws. The same build → design-gate →
 * SEO → SEO-verify → schema → link-verify pipeline as every other mode.
 */
export async function runRoutedConversation(deps: RoutedDeps): Promise<RoutedOutcome> {
  const { ctx, routing } = deps;
  const vars = promptVars(ctx);
  const cap = Math.max(1, deps.rebuildCap ?? Number(process.env.BAKEOFF_REBUILD_CAP ?? 2));

  const turns: ConversationTurn[] = [];
  const attribution: PhaseAttribution[] = [];
  let totalMs = 0;

  // Shared context blocks, identical for every phase/model.
  const groundingBlock = `${RULE}\n📄 LOCAL MARKET RESEARCH (shared brief)\n${RULE}\n${deps.grounding.trim()}\n`;
  const contextBlock = `${RULE}\nBUILD CONTEXT (registry facts)\n${RULE}\n${describeContext(ctx)}\n`;
  const enrichment = deps.introEnrichment.trim() ? deps.introEnrichment.trim() : "";
  const sharedContext = [groundingBlock, contextBlock, enrichment].filter(Boolean).join("\n\n");

  const filesBlock = [
    fileBlock("STS SEO Data 2026", deps.fixtures.seoData),
    fileBlock("Master Page Builder", deps.fixtures.pageBuilder),
    fileBlock("Master Design (Tier 2)", deps.fixtures.designTier2),
  ].join("\n");

  const introBlock = introPrompt(vars);

  const htmlBlock = (html: string): string =>
    `${RULE}\nCURRENT HTML DOCUMENT — apply this phase to THIS exact page\n${RULE}\n\`\`\`html\n${html}\n\`\`\`\n`;

  /**
   * Run a phase with main→backup fallback. `validate` throws when the output is
   * structurally invalid for the phase, which is treated identically to an error
   * and triggers the backup. Records a turn + attribution on success.
   */
  async function runPhase(
    phase: string,
    route: PhaseRoute,
    user: string,
    validate: (raw: string) => void,
    summary: string,
    webSearch = false,
  ): Promise<{ raw: string; used: RoutedModel; viaBackup: boolean }> {
    const candidates: { m: RoutedModel; viaBackup: boolean }[] =
      route.backup.id === route.main.id
        ? [{ m: route.main, viaBackup: false }]
        : [
            { m: route.main, viaBackup: false },
            { m: route.backup, viaBackup: true },
          ];
    const t0 = Date.now();
    let lastErr: unknown;
    for (const { m, viaBackup } of candidates) {
      const tag = viaBackup ? "BACKUP" : "main";
      try {
        console.log(`    → ${phase}: ${m.label} (${tag})${webSearch ? " [web-search]" : ""}…`);
        const res = await m.complete(
          [{ role: "user", content: user }],
          undefined,
          webSearch ? { webSearch: true } : undefined,
        );
        validate(res.raw);
        const ms = Date.now() - t0;
        totalMs += ms;
        turns.push({ phase, ms, summary: `${summary} — via ${m.label}${viaBackup ? " (backup)" : ""}` });
        attribution.push({ phase, modelId: m.id, modelLabel: m.label, viaBackup });
        console.log(`    ← ${phase}: ${(ms / 1000).toFixed(1)}s, ${res.raw.length} chars via ${m.label} (${tag})`);
        return { raw: res.raw, used: m, viaBackup };
      } catch (err) {
        lastErr = err;
        console.log(
          `    ! ${phase}: ${m.label} (${tag}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    totalMs += Date.now() - t0;
    throw new Error(
      `${phase}: main (${route.main.label}) and backup (${route.backup.label}) both failed — ` +
        `${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
  }

  /** One call to a SPECIFIC model (no fallback) — used by rebuild / fix loops
   * that must continue with whichever model produced the phase. */
  async function callModel(
    phase: string,
    model: RoutedModel,
    user: string,
    summary: string,
    webSearch = false,
  ): Promise<string> {
    const t0 = Date.now();
    console.log(`    → ${phase}: ${model.label}${webSearch ? " [web-search]" : ""}…`);
    const res = await model.complete(
      [{ role: "user", content: user }],
      undefined,
      webSearch ? { webSearch: true } : undefined,
    );
    const ms = Date.now() - t0;
    totalMs += ms;
    turns.push({ phase, ms, summary: `${summary} — via ${model.label}` });
    attribution.push({ phase, modelId: model.id, modelLabel: model.label, viaBackup: false });
    console.log(`    ← ${phase}: ${(ms / 1000).toFixed(1)}s, ${res.raw.length} chars`);
    return res.raw;
  }

  // ── Phase: BUILD (intro context folded into the build turn for the routed,
  //    store-and-handoff flow) ──────────────────────────────────────────────
  const buildUser = [introBlock, filesBlock, sharedContext, buildPrompt(vars) + ARTIFACT_TO_INLINE].join("\n\n");
  const built = await runPhase(
    "build",
    routing.build,
    buildUser,
    (raw) => {
      extractHtmlDocument(raw, "build");
    },
    "Build landing page (Master Page Builder + Master Design Tier 2).",
  );
  let html = extractHtmlDocument(built.raw, "build");
  const buildModel = built.used;

  // ── Phase: DESIGN GATE + force-rebuild loop (deterministic gate; rebuilds run
  //    on whichever model produced the build) ──────────────────────────────────
  let rebuilds = 0;
  let gate = evaluateDesignGate(html, ctx.city);
  while (!gate.passed && rebuilds < cap) {
    rebuilds++;
    const rebuildUser = [
      introBlock,
      filesBlock,
      sharedContext,
      htmlBlock(html),
      rebuildPrompt(vars, gate.issue) + ARTIFACT_TO_INLINE,
    ].join("\n\n");
    const raw = await callModel(
      `rebuild-${rebuilds}`,
      buildModel,
      rebuildUser,
      `Force rebuild ${rebuilds}/${cap}: ${gate.issue}`,
    );
    html = extractHtmlDocument(raw, `rebuild ${rebuilds}`);
    gate = evaluateDesignGate(html, ctx.city);
  }
  if (!gate.passed) {
    throw new Error(
      `Design gate never passed after ${cap} rebuild attempt(s). Outstanding issue(s): ${gate.issue}`,
    );
  }

  // ── Phase: SEO audit ─────────────────────────────────────────────────────
  const seoUser = [
    sharedContext,
    htmlBlock(html),
    seoPrompt(vars) + "\n\n" + fileBlock("Master SEO Audit", deps.fixtures.seoAudit) + ARTIFACT_TO_INLINE,
  ].join("\n\n");
  const seo = await runPhase(
    "seo",
    routing.seo,
    seoUser,
    (raw) => {
      extractHtmlDocument(raw, "seo");
    },
    "Full SEO audit (Master SEO Audit); schema stripped.",
  );
  html = extractHtmlDocument(seo.raw, "seo");

  /** Run a report-primary verification phase: main→backup first call (output is
   * optional, so a refusal does NOT trigger backup — only a thrown error does),
   * then a corrective loop on the SAME model while the verdict reads FAILED. */
  async function runVerification(
    phase: string,
    route: PhaseRoute,
    prompt: string,
    fixPrompt: string,
    pass: RegExp,
    fail: RegExp,
    summary: string,
    webSearch = false,
  ): Promise<void> {
    const first = await runPhase(
      phase,
      route,
      [sharedContext, htmlBlock(html), prompt + ARTIFACT_TO_INLINE_OPTIONAL].join("\n\n"),
      () => {},
      summary,
      webSearch,
    );
    const model = first.used;
    let raw = first.raw;
    let doc = tryExtractHtmlDocument(raw);
    if (doc) html = doc;
    let verdict = readVerdict(raw, pass, fail);
    turns[turns.length - 1].verdict = verdict;
    console.log(`    ⚖ ${phase}: verdict=${verdict ?? "none"}`);

    let fixes = 0;
    while (verdict === "failed" && fixes < cap) {
      fixes++;
      const fixPhase = `${phase}-fix-${fixes}`;
      raw = await callModel(
        fixPhase,
        model,
        [sharedContext, htmlBlock(html), fixPrompt + ARTIFACT_TO_INLINE_OPTIONAL].join("\n\n"),
        `Corrective re-verify ${fixes}/${cap} after a FAILED ${phase} verdict.`,
        webSearch,
      );
      doc = tryExtractHtmlDocument(raw);
      if (doc) html = doc;
      verdict = readVerdict(raw, pass, fail);
      turns[turns.length - 1].verdict = verdict;
      console.log(`    ⚖ ${fixPhase}: verdict=${verdict ?? "none"}`);
    }
    if (verdict === "failed") {
      throw new Error(`${phase} still returned a FAILED verdict after ${cap} corrective attempt(s).`);
    }
  }

  // ── Phase: SEO verification (live web search) ──────────────────────────────
  await runVerification(
    "seo-verify",
    routing["seo-verify"],
    seoVerifyPrompt(vars),
    seoVerifyFixPrompt(),
    SEO_VERDICT_PASS,
    SEO_VERDICT_FAIL,
    "SEO verification audit (compliance + modern SEO, live web search).",
    true,
  );

  // ── Phase: SCHEMA (Schema Generator inlined) ──────────────────────────────
  const schemaUser = [
    sharedContext,
    htmlBlock(html),
    deps.schemaPromptFor(vars) + "\n\n" + fileBlock("Schema Generator", deps.fixtures.schemaGenerator) + SCHEMA_TO_INLINE,
  ].join("\n\n");
  const schemaPhase = await runPhase(
    "schema",
    routing.schema,
    schemaUser,
    (raw) => {
      extractSchemaJson(raw, "schema");
    },
    "Generate JSON-LD schema (Schema Generator file inlined).",
  );
  const schema = extractSchemaJson(schemaPhase.raw, "schema");

  // ── Phase: LINK verification ───────────────────────────────────────────────
  await runVerification(
    "verify-links",
    routing["verify-links"],
    verifyLinksPrompt(),
    verifyLinksFixPrompt(),
    LINKS_VERDICT_PASS,
    LINKS_VERDICT_FAIL,
    "Final link verification (emails, contact button, no invented URLs).",
  );

  return { html, schema, rebuilds, turns, totalMs, attribution };
}

```

### Source — routing.ts

`scripts/src/bakeoff/routing.ts` — 6,354 chars

```ts
import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeGrokComplete,
  makeOpenAIComplete,
  type CompleteFn,
} from "./providers.js";

/**
 * The model registry + per-phase routing for the two ADDITIVE production modes
 * the operator drives in plain language:
 *
 *  - "run this through 1 llm"        → SINGLE engine (one named model runs every
 *                                      phase through the same pipeline; handled by
 *                                      runConversation, not this table).
 *  - "run this through the multi llm" → ROUTED: a MAIN model per phase + a BACKUP
 *                                      that auto-takes over when the main errors,
 *                                      refuses, or emits invalid output (no HTML /
 *                                      invalid JSON-LD). See ROUTING_TABLE below.
 *
 * The existing 6-model comparison (`run.ts`) is untouched ("all of them").
 */

export interface RoutedModel {
  id: string;
  label: string;
  provider: string;
  /** The concrete provider model tag actually called. */
  model: string;
  complete: CompleteFn;
}

export type RoutedPhase =
  | "grounding"
  | "build"
  | "seo"
  | "seo-verify"
  | "schema"
  | "verify-links";

export interface PhaseRoute {
  main: RoutedModel;
  backup: RoutedModel;
}

export type ResolvedRouting = Record<RoutedPhase, PhaseRoute>;

interface ModelDef {
  label: string;
  provider: string;
  kind: "claude" | "gemini" | "openai" | "grok";
  /** Fixed model tag; omitted for grok, which is discovered at runtime. */
  tag?: string;
}

/** Known models, keyed by the SAME ids the comparison run uses. */
const MODEL_DEFS: Record<string, ModelDef> = {
  claude: { label: "Claude Opus 4.8", provider: "Anthropic", kind: "claude", tag: "claude-opus-4-8" },
  gemini: { label: "Gemini 3.1 Pro", provider: "Google", kind: "gemini", tag: "gemini-3.1-pro-preview" },
  openai: { label: "OpenAI GPT-5.5-PRO", provider: "OpenAI", kind: "openai", tag: "gpt-5.5-pro" },
  "openai-std": { label: "OpenAI GPT-5.5", provider: "OpenAI", kind: "openai", tag: "gpt-5.5" },
  "openai-54": { label: "OpenAI GPT-5.4", provider: "OpenAI", kind: "openai", tag: "gpt-5.4" },
  grok: { label: "Grok (xAI)", provider: "xAI", kind: "grok" },
};

/**
 * The operator-approved per-phase routing: MAIN per phase, with OpenAI GPT-5.4
 * as the BACKUP across the board (their explicit instruction).
 *
 * Build/SEO → Claude (richest builder); SEO-verify → Gemini (live web search);
 * schema + link-verify → Grok (tested best/cheapest on schema); shared research
 * grounding → Claude. The backup steps in only when the main errors, refuses, or
 * returns invalid output for the phase.
 *
 * CAVEAT (documented, intentional): GPT-5.4 was the model that REFUSED No-GMB
 * BUILDS in testing. As the BUILD backup it is therefore reliable for GMB pages
 * but may still refuse under a No-GMB build — in which case the build fails
 * loudly (both main and backup unable to produce HTML), per the fail-loud rule.
 */
export const ROUTING_TABLE: Record<RoutedPhase, { main: string; backup: string }> = {
  grounding: { main: "claude", backup: "openai-54" },
  build: { main: "claude", backup: "openai-54" },
  seo: { main: "claude", backup: "openai-54" },
  "seo-verify": { main: "gemini", backup: "openai-54" },
  schema: { main: "grok", backup: "openai-54" },
  "verify-links": { main: "grok", backup: "openai-54" },
};

/** Friendly aliases the operator may type for the single-engine mode. */
const ALIASES: Record<string, string> = {
  chatgpt: "openai",
  gpt: "openai",
  "gpt-5.5-pro": "openai",
  openai: "openai",
  "gpt-5.4": "openai-54",
  "gpt5.4": "openai-54",
  openai54: "openai-54",
  "openai-54": "openai-54",
  "gpt-5.5": "openai-std",
  "openai-std": "openai-std",
  claude: "claude",
  anthropic: "claude",
  gemini: "gemini",
  google: "gemini",
  grok: "grok",
  xai: "grok",
};

/** Resolve a user-typed model name/alias to a known registry id (fail loud). */
export function resolveModelId(alias: string): string {
  const key = alias.trim().toLowerCase();
  const id = ALIASES[key] ?? (MODEL_DEFS[key] ? key : undefined);
  if (!id) {
    throw new Error(
      `Unknown model "${alias}". Known ids: ${Object.keys(MODEL_DEFS).join(", ")} ` +
        `(aliases: chatgpt/gpt → openai, gpt-5.4 → openai-54, anthropic → claude, google → gemini, xai → grok).`,
    );
  }
  return id;
}

function makeComplete(def: ModelDef, tag: string): CompleteFn {
  switch (def.kind) {
    case "claude":
      return makeClaudeComplete(tag);
    case "gemini":
      return makeGeminiComplete(tag);
    case "openai":
      return makeOpenAIComplete(tag);
    case "grok":
      return makeGrokComplete(tag);
  }
}

/**
 * Construct ONLY the requested models (so a single OpenAI run never needs the
 * xAI/Anthropic keys, and grok is discovered only when actually used). Each
 * adapter requires its own provider key at construction time and fails loud.
 */
export async function buildModelsForIds(ids: string[]): Promise<Map<string, RoutedModel>> {
  const unique = Array.from(new Set(ids));
  const reg = new Map<string, RoutedModel>();
  for (const id of unique) {
    const def = MODEL_DEFS[id];
    if (!def) throw new Error(`Unknown model id "${id}".`);
    const tag = def.kind === "grok" ? await discoverNewestGrok() : def.tag!;
    reg.set(id, { id, label: def.label, provider: def.provider, model: tag, complete: makeComplete(def, tag) });
  }
  return reg;
}

/** Unique model ids referenced by the routing table (main + backup). */
export function routedModelIds(): string[] {
  const ids = new Set<string>();
  for (const r of Object.values(ROUTING_TABLE)) {
    ids.add(r.main);
    ids.add(r.backup);
  }
  return Array.from(ids);
}

/** Bind the routing table's ids to constructed models (fail loud on a gap). */
export function resolveRouting(reg: Map<string, RoutedModel>): ResolvedRouting {
  const get = (id: string): RoutedModel => {
    const m = reg.get(id);
    if (!m) throw new Error(`Routing references model "${id}" not present in the registry.`);
    return m;
  };
  const out = {} as ResolvedRouting;
  for (const [phase, r] of Object.entries(ROUTING_TABLE) as [RoutedPhase, { main: string; backup: string }][]) {
    out[phase] = { main: get(r.main), backup: get(r.backup) };
  }
  return out;
}

```

### Source — run.ts

`scripts/src/bakeoff/run.ts` — 22,559 chars

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegistry,
  parseSchema,
  runCheckers,
  type RunContext,
} from "@workspace/mc-core";
import { schemaPrompt, gmbSchemaPrompt, type PromptVars } from "./miniPrompts.js";
import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeGrokComplete,
  type CompleteFn,
} from "./providers.js";
import { loadDesignFixtures, type DesignFixtures } from "./fixtures.js";
import { estimateCost } from "./cost.js";
import { runConversation } from "./conversation.js";
import { generateSharedGrounding, type SharedGrounding } from "./grounding.js";
import { gmbContextSuffix, resolveGmbProfile, type GmbProfile } from "./gmb.js";
import { loadReferenceHtml, resolveTarget, type BakeoffTarget } from "./target.js";
import { scoreModels } from "./score.js";
import { judgeVisual, type VisualVerdict } from "./visual.js";
import type { BakeoffResults, ModelResult, ScenarioResult } from "./types.js";

/** The build target (city/state/niche/url) — env-driven, defaults to Billings, MT. */
const TARGET = resolveTarget();

const CLAUDE_MODEL = "claude-opus-4-8";
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const OPENAI_MODEL = "gpt-5.5-pro";
/** Standard (non-pro) OpenAI chat tag, run alongside pro for a tier comparison. */
const OPENAI_MODEL_STD = "gpt-5.5";
/** Prior-generation OpenAI chat tag, added to compare a cheaper tier vs the majors. */
const OPENAI_MODEL_54 = "gpt-5.4";

const BUSINESS_NAME = "STS Electronic Recycling";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(HERE, "../../../artifacts/bake-off/src/data/results.json");
/** Screenshots are written into the viewer's public dir so it can serve them. */
const SCREENSHOT_DIR = resolve(HERE, "../../../artifacts/bake-off/public/screenshots");
const SCREENSHOT_PREFIX = "screenshots";

interface ModelSpec {
  id: string;
  label: string;
  provider: string;
  model: string;
  /** The stateful multi-turn completion fn used to drive this model's chat. */
  complete: CompleteFn;
}

/**
 * A scenario differs from the others ONLY by the per-scenario intro enrichment
 * and the deterministic schema generator — never by the prompts, the fixtures,
 * the turn sequence, or anything per-model. Both scenarios share one grounding.
 */
interface ScenarioSpec {
  id: string;
  label: string;
  description: string;
  notes: string[];
  /** Extra intro block handed identically to every model (empty for No-GMB). */
  introEnrichment: string;
  /** Per-scenario schema prompt for the Phase-4 AI schema turn (No-GMB or GMB). */
  schemaPromptFor: (vars: PromptVars) => string;
  /** Build the run context for this scenario. */
  buildContext: () => RunContext;
  /** CID the schema checker enforces against (null for No-GMB). */
  verifiedCid: string | null;
}

function baseContext(): RunContext {
  return {
    city: TARGET.city,
    state: TARGET.state,
    track: "page",
    classification: TARGET.classification,
    competition: TARGET.competition,
    pageType: TARGET.pageType,
    niche: TARGET.niche,
    existingUrls: [],
    handoff: null,
    verifiedCid: null,
    designBibleHash: null,
    blogTopic: null,
    researchBrief: null,
    seoIntel: null,
    registry: buildRegistry(),
  };
}

function noGmbScenario(): ScenarioSpec {
  return {
    id: "no-gmb",
    label: "No-GMB (production context)",
    description:
      "The exact human No-GMB checklist a VA runs today, one continuous chat per model: verbatim copyPrompt() prompts, the real uploaded design files inlined, city/state targeting only, NO explicit page_url and NO GMB block.",
    introEnrichment: "",
    schemaPromptFor: (vars) => schemaPrompt(vars),
    buildContext: baseContext,
    verifiedCid: null,
    notes: [
      "Every model runs the IDENTICAL No-GMB checklist in ONE stateful conversation: intro (files uploaded + rules + model check) → build → design gate / force-rebuild loop → SEO audit → SEO verification → schema (Schema Generator AI turn) → link verification. The prompt text is the tool's verbatim copyPrompt() output; the real uploaded design files are inlined as the API-faithful stand-in for file uploads.",
      "This is the faithful production reproduction. The context deliberately omits an explicit page_url and any Google Business Profile (GMB) block — STS spoke pages target a service-area city, not a verified storefront.",
      "Schema is a real AI turn running the uploaded Master Schema Generator (v1.4.1) under the No-GMB overrides (city/state only, NO CID, NO street address). The model must emit a <script type=\"application/ld+json\">…</script> block; the harness extracts and validates the JSON-LD inside it (fail loud otherwise).",
      "If a model refuses to build under this context (asking for page_url / GMB data first) it surfaces as no HTML and is recorded faithfully as an ERROR — it is NOT patched away, because special-casing one model would break the apples-to-apples comparison.",
    ],
  };
}

function gmbScenario(gmb: GmbProfile): ScenarioSpec {
  return {
    id: "gmb",
    label: "GMB-enriched context",
    description:
      "The SAME checklist and prompts as No-GMB, with one identical enrichment handed to every model: an explicit page_url plus a Google Business Profile (GMB) data block in the intro.",
    introEnrichment: gmbContextSuffix(gmb),
    schemaPromptFor: (vars) =>
      gmbSchemaPrompt(vars, {
        cid: gmb.cid,
        gmbUrl: gmb.gmbUrl,
        businessName: gmb.businessName,
        street: gmb.street,
        zip: gmb.zip,
        phone: gmb.phone,
        lat: gmb.lat,
        lng: gmb.lng,
      }),
    buildContext: () => ({ ...baseContext(), verifiedCid: gmb.cid }),
    verifiedCid: gmb.cid,
    notes: [
      "A fair, symmetric re-run: every model receives the IDENTICAL enriched intro (explicit page_url + GMB block), so we can see whether a model that refused under No-GMB builds well once given the inputs it demanded.",
      "The GMB values (CID, street address, phone, coordinates) are EXPERIMENTAL / illustrative inputs for this comparison, NOT verified ground-truth location data — they are labelled as such in the intro block, and the block tells the model it MAY use them.",
      "Schema here is a real AI turn running the uploaded Master Schema Generator (v1.4.1) with the verified CID + full address block, so the emitted JSON-LD carries the identifier/PostalAddress/geo/?cid= map URL a GMB page requires. The model must emit a <script type=\"application/ld+json\">…</script> block, validated by the harness.",
    ],
  };
}

/**
 * Build the scenario set for a target. The No-GMB scenario is always present
 * (it's the production-faithful path and needs no location-specific block). The
 * GMB scenario is included only when a GMB profile is available — for the
 * Billings smoke target that's the illustrative {@link BILLINGS_GMB}; for any
 * other city it requires a verified `BAKEOFF_GMB_JSON` block (see
 * {@link resolveGmbProfile}), so a new-city run without one drops the GMB
 * scenario rather than inventing location data or aborting the whole run.
 */
function buildScenarios(gmb: GmbProfile | null): ScenarioSpec[] {
  const specs = [noGmbScenario()];
  if (gmb) specs.push(gmbScenario(gmb));
  return specs;
}

/**
 * Optional scenario filter (comma-separated scenario ids, e.g. `no-gmb`). When
 * set via `BAKEOFF_SCENARIOS`, only the listed scenarios are run/persisted; the
 * default runs every available scenario. This only narrows WHICH scenarios run —
 * it never changes a scenario's context, prompts, or schema, so each scenario
 * stays a faithful reproduction. Fails loudly if a filter names no known scenario.
 */
const SCENARIO_FILTER = (process.env.BAKEOFF_SCENARIOS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Optional model filter (comma-separated model ids, e.g. `claude`). Used by the
 * end-to-end smoke check to run a single model. Never changes prompts/fixtures.
 */
const MODEL_FILTER = (process.env.BAKEOFF_MODELS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Resumable per-model run state, loaded from a prior results.json. The harness
 * persists after EVERY model so a long run that is interrupted (e.g. the
 * environment reaps a long background process) can be relaunched and continues
 * from where it left off — completed (ok OR error) results are never re-run.
 */
interface Prior {
  grounding: { source: string; content: string } | null;
  /** scenarioId -> (modelId -> already-completed ModelResult). */
  done: Map<string, Map<string, ModelResult>>;
}

async function loadPrior(): Promise<Prior> {
  const empty: Prior = { grounding: null, done: new Map() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  } catch {
    return empty;
  }
  const obj = parsed as Record<string, unknown>;
  const grounding =
    obj.grounding && typeof obj.grounding === "object"
      ? (obj.grounding as Prior["grounding"])
      : null;
  const done = new Map<string, Map<string, ModelResult>>();

  if (Array.isArray(obj.scenarios)) {
    for (const s of obj.scenarios as ScenarioResult[]) {
      const m = new Map<string, ModelResult>();
      for (const model of s.models) m.set(model.id, model);
      done.set(s.id, m);
    }
  }

  return { grounding, done };
}

async function main(): Promise<void> {
  console.log(`Bake-Off target: ${TARGET.city}, ${TARGET.state} — ${TARGET.url}`);

  // Resolve the GMB profile for the GMB scenario. Available for the Billings
  // smoke target (illustrative block) or whenever BAKEOFF_GMB_JSON is supplied;
  // otherwise the GMB scenario is unavailable for this city (no invented data).
  let gmb: GmbProfile | null = null;
  let gmbError: string | null = null;
  try {
    gmb = resolveGmbProfile(TARGET);
  } catch (err) {
    gmbError = err instanceof Error ? err.message : String(err);
  }

  const allScenarios = buildScenarios(gmb);
  // An explicit BAKEOFF_SCENARIOS=gmb on a city with no GMB block fails loud —
  // the operator asked for it specifically, so don't silently drop it.
  if (SCENARIO_FILTER.includes("gmb") && !gmb) {
    throw new Error(`BAKEOFF_SCENARIOS requested "gmb" but no GMB block is available: ${gmbError}`);
  }
  const activeScenarios = SCENARIO_FILTER.length
    ? allScenarios.filter((s) => SCENARIO_FILTER.includes(s.id))
    : allScenarios;
  if (SCENARIO_FILTER.length && activeScenarios.length === 0) {
    throw new Error(
      `BAKEOFF_SCENARIOS=${SCENARIO_FILTER.join(",")} matched no known scenario (have: ${allScenarios.map((s) => s.id).join(", ")}).`,
    );
  }
  if (!gmb && gmbError && !SCENARIO_FILTER.length) {
    console.log(`Skipping GMB scenario for ${TARGET.city}, ${TARGET.state}: ${gmbError}`);
  }
  console.log(`Active scenario(s): ${activeScenarios.map((s) => s.id).join(", ")}`);

  // Load the real uploaded design files up front — fail loud before any API call
  // if a fixture is missing or empty.
  const fixtures = loadDesignFixtures();
  console.log(
    `Loaded design fixtures: page-builder ${fixtures.pageBuilder.length}, design-tier2 ${fixtures.designTier2.length}, seo-data ${fixtures.seoData.length}, seo-audit ${fixtures.seoAudit.length} chars.`,
  );

  const prior = await loadPrior();
  const claudeComplete = makeClaudeComplete(CLAUDE_MODEL);
  const geminiComplete = makeGeminiComplete(GEMINI_MODEL);
  const openaiComplete = makeOpenAIComplete(OPENAI_MODEL);
  const openaiStdComplete = makeOpenAIComplete(OPENAI_MODEL_STD);
  const openai54Complete = makeOpenAIComplete(OPENAI_MODEL_54);
  const grokModel = await discoverNewestGrok();
  console.log(`Discovered newest Grok tag: ${grokModel}`);
  const grokComplete = makeGrokComplete(grokModel);

  const reference = await loadReferenceHtml(TARGET);
  const referenceHtml = reference.html;

  // ONE shared grounding feeds BOTH scenarios, so the only difference between
  // them is the GMB enrichment — never the research input. Reuse the grounding
  // already recorded in results.json when present; otherwise author it once.
  const grounding = await loadOrAuthorGrounding(prior.grounding, claudeComplete);

  let models: ModelSpec[] = [
    { id: "claude", label: "Claude Opus 4.8", provider: "Anthropic", model: CLAUDE_MODEL, complete: claudeComplete },
    { id: "gemini", label: "Gemini 3.1 Pro", provider: "Google", model: GEMINI_MODEL, complete: geminiComplete },
    { id: "openai", label: `OpenAI ${OPENAI_MODEL.toUpperCase()}`, provider: "OpenAI", model: OPENAI_MODEL, complete: openaiComplete },
    { id: "openai-std", label: `OpenAI ${OPENAI_MODEL_STD.toUpperCase()}`, provider: "OpenAI", model: OPENAI_MODEL_STD, complete: openaiStdComplete },
    { id: "openai-54", label: `OpenAI ${OPENAI_MODEL_54.toUpperCase()}`, provider: "OpenAI", model: OPENAI_MODEL_54, complete: openai54Complete },
    { id: "grok", label: "Grok (xAI)", provider: "xAI", model: grokModel, complete: grokComplete },
  ];
  if (MODEL_FILTER.length) {
    models = models.filter((m) => MODEL_FILTER.includes(m.id));
    if (models.length === 0) {
      throw new Error(`BAKEOFF_MODELS=${MODEL_FILTER.join(",")} matched no known model.`);
    }
    console.log(`Active model(s): ${models.map((m) => m.id).join(", ")}`);
  }

  // Seed the working scenario set from any prior (resumable) results.
  const scenarios: ScenarioResult[] = activeScenarios.map((spec) => ({
    id: spec.id,
    label: spec.label,
    description: spec.description,
    notes: spec.notes,
    models: models
      .map((m) => prior.done.get(spec.id)?.get(m.id))
      .filter((m): m is ModelResult => m != null),
  }));

  // Per-scenario visual verdicts (rendered-screenshot judge). Populated by the
  // visual pass AFTER all model HTML exists; until then scoring falls back to the
  // design-token proxy so interim (resumable) writes stay shape-complete.
  const verdictsByScenario = new Map<string, Map<string, VisualVerdict>>();
  let referenceScreenshot: string | null = null;

  const persist = async (): Promise<void> => {
    for (const s of scenarios) {
      scoreModels(
        s.models,
        buildRegistry().wordCountFloor,
        referenceHtml,
        verdictsByScenario.get(s.id),
      );
      s.models.sort((a, b) => {
        if (a.status === "error" && b.status !== "error") return 1;
        if (b.status === "error" && a.status !== "error") return -1;
        return (b.scores?.composite ?? -1) - (a.scores?.composite ?? -1);
      });
    }
    const output: BakeoffResults = {
      ranAt: new Date().toISOString(),
      target: TARGET,
      grounding: { source: grounding.source, content: grounding.content },
      scenarios,
      referenceScreenshot,
    };
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");
  };

  // Run every not-yet-recorded model for a scenario CONCURRENTLY — the bottleneck
  // is per-model LLM API latency, not local CPU, so running the models in
  // parallel cuts wall-clock roughly N-fold. The run stays fully resumable: each
  // model still persists the moment it finishes, and all persists are funnelled
  // through a single serialized chain so concurrent writers never interleave the
  // shared results.json. The one shared grounding is authored ABOVE this loop, so
  // concurrency never forks it, and runOneModel swallows its own errors (returns
  // an error ModelResult), so one model failing never aborts its siblings.
  // Scenarios stay sequential to bound peak concurrency to one chat per model.
  // Set BAKEOFF_SEQUENTIAL=1 to force the old one-at-a-time behaviour.
  const sequential = /^(1|true|yes)$/i.test(process.env.BAKEOFF_SEQUENTIAL ?? "");
  let persistChain: Promise<void> = Promise.resolve();
  const queuePersist = (): Promise<void> => {
    persistChain = persistChain.then(persist);
    return persistChain;
  };

  for (const spec of activeScenarios) {
    const scenario = scenarios.find((s) => s.id === spec.id)!;
    const pending: ModelSpec[] = [];
    for (const m of models) {
      if (scenario.models.some((existing) => existing.id === m.id)) {
        console.log(`  • ${spec.id}/${m.id}: already recorded, skipping.`);
      } else {
        pending.push(m);
      }
    }
    if (pending.length === 0) continue;

    const runModel = async (m: ModelSpec): Promise<void> => {
      console.log(`\n=== ${spec.label} → ${m.label} ===`);
      const result = await runOneModel(m, spec, grounding, fixtures);
      scenario.models.push(result);
      await queuePersist();
      console.log(`  …persisted ${spec.id}/${m.id} (${result.status}).`);
    };

    if (sequential) {
      for (const m of pending) await runModel(m);
    } else {
      console.log(
        `  ↻ ${spec.id}: running ${pending.length} model(s) concurrently: ${pending.map((m) => m.id).join(", ")}`,
      );
      await Promise.all(pending.map(runModel));
    }
  }

  // Visual judge pass: render every successful model's HTML to a screenshot and
  // score it perceptually against the reference. Runs once after all HTML exists.
  // Best-effort — a failed render leaves the design-token proxy score in place.
  try {
    for (const s of scenarios) {
      const verdict = await judgeVisual(s.models, referenceHtml, {
        outDir: resolve(SCREENSHOT_DIR, s.id),
        pathPrefix: `${SCREENSHOT_PREFIX}/${s.id}`,
        vision: true,
      });
      verdictsByScenario.set(s.id, verdict.verdicts);
      referenceScreenshot = verdict.referenceScreenshot;
      for (const m of s.models) m.screenshot = verdict.screenshots.get(m.id) ?? m.screenshot;
    }
    await persist();
    console.log("Visual judge pass complete; rescored with perceptual verdicts.");
  } catch (err) {
    console.log(`Visual judge pass skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`\nResults written to ${OUTPUT_PATH}`);
  for (const s of scenarios) {
    console.log(`\n[${s.label}]`);
    for (const m of s.models) {
      const score = m.scores ? `${m.scores.composite}/100` : "—";
      console.log(`  ${m.label}: ${m.status === "ok" ? score : `ERROR (${m.error})`}`);
    }
  }
}

/** Reuse the grounding recorded in results.json if present, else author it once. */
async function loadOrAuthorGrounding(
  prior: { source: string; content: string } | null,
  synth: CompleteFn,
): Promise<SharedGrounding> {
  if (prior && typeof prior.content === "string" && prior.content.trim()) {
    console.log(`Reusing shared grounding from prior results.json (${prior.content.length} chars).`);
    return { content: prior.content, source: prior.source ?? "model-knowledge (shared)" };
  }
  console.log("Authoring shared research grounding (once)...");
  return generateSharedGrounding(synth, TARGET.city, TARGET.state, TARGET.niche);
}

async function runOneModel(
  spec: ModelSpec,
  scenario: ScenarioSpec,
  grounding: SharedGrounding,
  fixtures: DesignFixtures,
): Promise<ModelResult> {
  const base: ModelResult = {
    id: spec.id,
    label: spec.label,
    provider: spec.provider,
    model: spec.model,
    status: "ok",
    error: null,
    research: null,
    html: null,
    schema: null,
    schemaValid: false,
    checkerReport: null,
    linkAudit: null,
    timings: [],
    totalMs: 0,
    scores: null,
    screenshot: null,
    costEstimate: null,
  };
  const ctx = scenario.buildContext();
  try {
    const outcome = await runConversation({
      ctx,
      complete: spec.complete,
      fixtures,
      grounding: grounding.content,
      introEnrichment: scenario.introEnrichment,
      schemaPromptFor: scenario.schemaPromptFor,
    });

    // Record the shared grounding as this model's research brief (every model
    // got the identical grounding — it is not a model differentiator).
    base.research = {
      summary: grounding.content,
      entities: [],
      sources: [],
      flags: [],
      raw: grounding.content,
    };
    base.html = outcome.html;
    base.schema = outcome.schema;
    base.totalMs = outcome.totalMs;
    base.timings = outcome.turns.map((t) => ({
      phase: t.phase,
      ms: t.ms,
      summary: t.summary,
      errorCount: 0,
      warningCount: 0,
      wordCount: 0,
      verdict: t.verdict,
    }));

    // Best-effort cost estimate (the providers don't surface token usage). Built
    // from the actual recorded turn sequence + the deterministic prompts/fixtures
    // re-sent each turn. See cost.ts for the documented assumptions.
    base.costEstimate = estimateCost({
      modelTag: spec.model,
      timings: base.timings,
      htmlChars: outcome.html.length,
      ctx,
      fixtures,
      grounding: grounding.content,
      introEnrichment: scenario.introEnrichment,
    });

    // Validate the AI-generated schema (the harness already confirmed it was a
    // valid <script type="application/ld+json"> block and stored the raw JSON) and
    // run the full checker suite over the final page (afterAudit: SEO has run).
    const parsedSchema = parseSchema(outcome.schema);
    base.schemaValid = parsedSchema != null;

    const report = runCheckers({
      html: outcome.html,
      registry: ctx.registry,
      pageType: ctx.pageType,
      track: ctx.track,
      classification: ctx.classification,
      city: ctx.city,
      afterAudit: true,
      schema: outcome.schema,
      verifiedCid: scenario.verifiedCid,
      businessName: BUSINESS_NAME,
      entities: [],
    });
    base.checkerReport = report;
    base.linkAudit = report.linkAudit;
    // Reflect the final page's checker counts on the schema turn for the viewer.
    const schemaTiming = base.timings.find((t) => t.phase === "schema");
    if (schemaTiming) {
      schemaTiming.errorCount = report.errorCount;
      schemaTiming.warningCount = report.warningCount;
      schemaTiming.wordCount = report.wordCount;
    }

    console.log(
      `  ✓ ${spec.label} finished in ${(base.totalMs / 1000).toFixed(1)}s ` +
        `(${outcome.rebuilds} rebuild(s), ${report.errorCount} error(s), ${report.warningCount} warning(s))`,
    );
  } catch (err) {
    base.status = "error";
    base.error = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${spec.label} failed: ${base.error}`);
  }
  return base;
}

main().catch((err) => {
  console.error("Bake-off run failed:", err);
  process.exitCode = 1;
});

```

### Source — schema-demo.ts

`scripts/src/bakeoff/schema-demo.ts` — 6,930 chars

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeGrokComplete,
  type ChatMessage,
  type CompleteFn,
} from "./providers.js";
import { schemaPrompt, SCHEMA_TO_INLINE, type PromptVars } from "./miniPrompts.js";
import { extractSchemaJson } from "./extract.js";
import { loadDesignFixtures } from "./fixtures.js";

/**
 * Cheap, single-turn DEMO of the Schema Generator step across every model. It is
 * the schema analogue of `seo-verify-demo`: instead of running the whole bake-off
 * pipeline (build → design gate → seo → seo-verify → schema), it loads ONE
 * already-built, SEO-verified HTML page and sends each model exactly ONE turn —
 *
 *     [the SEO-verified HTML] + [schema execution prompt] + [Schema Generator file]
 *
 * — i.e. the same payload the pipeline's schema turn sends, so you can compare how
 * each model generates JSON-LD for the SAME page without paying for a full sweep.
 * Each model gets ONE API call. The HTML is seeded as the prior "build" turn (so
 * the SCHEMA_TO_INLINE shim's "use the current HTML in this conversation" is true),
 * then the verbatim schemaPrompt + the inlined Schema Generator + the shim is sent.
 *
 * The schema is extracted and validated (must be ONE valid
 * <script type="application/ld+json">…</script> block — fail loud otherwise) and
 * each model's block is written to output/schema-demo/<id>.txt for side-by-side
 * comparison.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run bakeoff:schema-demo
 *   SCHEMA_DEMO_HTML=/path/to/page.html pnpm ... run bakeoff:schema-demo
 *   SCHEMA_DEMO_MODELS=claude,gemini pnpm ... run bakeoff:schema-demo
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_HTML = resolve(HERE, "reference/billings-mt.html");
const OUT_DIR = resolve(HERE, "output/schema-demo");

const TARGET = { city: "Billings", state: "MT", niche: "electronics recycling" };

function promptVars(): PromptVars {
  return {
    city: TARGET.city,
    state: TARGET.state,
    url: `https://www.stselectronicrecyclinginc.com/${TARGET.city.toLowerCase()}-${TARGET.state.toLowerCase()}`,
    niche: TARGET.niche,
    pageName: `${TARGET.city} ${TARGET.niche}`,
    hubSpoke: "",
  };
}

interface ModelSpec {
  id: string;
  label: string;
  complete: CompleteFn;
}

/** The four-model line-up the comparison runs: gpt-5.4, Sonnet 4.6, newest Grok,
 *  Gemini 3.1 Pro. Each is the most-capable general tier the user asked for. */
async function buildModels(): Promise<ModelSpec[]> {
  const grokTag = await discoverNewestGrok();
  const all: ModelSpec[] = [
    { id: "openai-54", label: "OpenAI GPT-5.4", complete: makeOpenAIComplete("gpt-5.4") },
    { id: "claude", label: "Claude Sonnet 4.6", complete: makeClaudeComplete("claude-sonnet-4-6") },
    { id: "grok", label: `Grok (${grokTag})`, complete: makeGrokComplete(grokTag) },
    { id: "gemini", label: "Gemini 3.1 Pro", complete: makeGeminiComplete("gemini-3.1-pro-preview") },
  ];
  const filter = (process.env.SCHEMA_DEMO_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (filter.length === 0) return all;
  const picked = all.filter((m) => filter.includes(m.id));
  if (picked.length === 0) {
    throw new Error(`SCHEMA_DEMO_MODELS=${filter.join(",")} matched no known model (use: ${all.map((m) => m.id).join(" | ")}).`);
  }
  return picked;
}

const RULE = "═══════════════════════════════════";
function fileBlock(name: string, body: string): string {
  return `${RULE}\n📄 UPLOADED FILE: ${name}\n${RULE}\n${body.trim()}\n`;
}

interface DemoResult {
  id: string;
  label: string;
  ok: boolean;
  secs: string;
  rawChars: number;
  schemaScript?: string;
  error?: string;
}

async function runOne(spec: ModelSpec, html: string, schemaGenerator: string): Promise<DemoResult> {
  const vars = promptVars();
  // Seed the conversation exactly as the pipeline reaches Phase 4: the built,
  // SEO-verified page is the prior assistant turn, then the verbatim schema
  // execution prompt + the inlined Schema Generator file + the medium shim.
  const messages: ChatMessage[] = [
    { role: "user", content: "Build the landing page now. Output the complete HTML artifact." },
    { role: "assistant", content: html },
    {
      role: "user",
      content: `${schemaPrompt(vars)}\n\n${fileBlock("Schema Generator", schemaGenerator)}${SCHEMA_TO_INLINE}`,
    },
  ];

  const t0 = Date.now();
  try {
    const res = await spec.complete(messages);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const inner = extractSchemaJson(res.raw, spec.label);
    const pretty = JSON.stringify(JSON.parse(inner), null, 2);
    const schemaScript = `<script type="application/ld+json">\n${pretty}\n</script>`;
    return { id: spec.id, label: spec.label, ok: true, secs, rawChars: res.raw.length, schemaScript };
  } catch (err) {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    return {
      id: spec.id,
      label: spec.label,
      ok: false,
      secs,
      rawChars: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const htmlPath = process.env.SCHEMA_DEMO_HTML?.trim() || DEFAULT_HTML;
  const html = await readFile(htmlPath, "utf8");
  const { schemaGenerator } = loadDesignFixtures();
  const models = await buildModels();

  console.log("Schema Generator demo — single turn per model");
  console.log(`Page under review: ${htmlPath} (${html.length} chars, SEO-verified, schema stripped)`);
  console.log(`Schema Generator file: ${schemaGenerator.length} chars`);
  console.log(`Models: ${models.map((m) => m.label).join(", ")}\n`);

  await mkdir(OUT_DIR, { recursive: true });

  // Run all models in parallel — each is a single independent API call.
  const results = await Promise.all(models.map((m) => runOne(m, html, schemaGenerator)));

  for (const r of results) {
    if (r.ok && r.schemaScript) {
      const file = resolve(OUT_DIR, `${r.id}.txt`);
      await writeFile(file, r.schemaScript, "utf8");
    }
  }

  console.log("\n══════════════════ RESULTS ══════════════════\n");
  for (const r of results) {
    console.log(`### ${r.label} (${r.secs}s)`);
    if (r.ok && r.schemaScript) {
      console.log(`✅ valid JSON-LD — ${r.schemaScript.length} chars → output/schema-demo/${r.id}.txt`);
      console.log(r.schemaScript);
    } else {
      console.log(`❌ ${r.error}`);
    }
    console.log("");
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`Summary: ${passed}/${results.length} models returned a valid <script> JSON-LD block.`);
  console.log(`Schema blocks saved under: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("schema demo failed:", err);
  process.exitCode = 1;
});

```

### Source — score.ts

`scripts/src/bakeoff/score.ts` — 6,873 chars

```ts
import { extractStructuralSignals, type CheckerReport } from "@workspace/mc-core";
import type { ModelResult, ModelScores } from "./types";
import type { VisualVerdict } from "./visual.js";

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Checker quality: start at 100, dock per error/warning on the final page. */
function auditScore(report: CheckerReport): number {
  return clamp(100 - report.errorCount * 12 - report.warningCount * 2);
}

/** Design-skeleton completeness: how many of the 4 structural signals are present. */
function structureScore(html: string): number {
  const s = extractStructuralSignals(html);
  let pts = 0;
  if (s.rootCss.trim()) pts += 25; // design tokens present
  pts += Math.min(25, s.sectionSequence.length * 5); // section markers
  if (s.equipmentTitles.length > 0) pts += 25; // equipment cards
  pts += Math.min(25, s.sacredUrls.length * 3); // sacred / internal links
  return clamp(pts);
}

function schemaScore(valid: boolean, report: CheckerReport): number {
  if (!valid) return 0;
  const schemaCheck = report.checks.find((c) => c.id.includes("schema"));
  if (schemaCheck && !schemaCheck.passed) return schemaCheck.severity === "error" ? 55 : 80;
  return 100;
}

function linksScore(report: CheckerReport): number {
  const la = report.linkAudit;
  return la.passed ? 100 : clamp(100 - la.errorCount * 20);
}

function wordCountScore(report: CheckerReport, floor: number): number {
  if (floor <= 0) return 100;
  return clamp((report.wordCount / floor) * 100);
}

// ---------------------------------------------------------------------------
// Closeness to the REAL published page (ground truth).
// ---------------------------------------------------------------------------

/** Frequency vector of HTML tag names. */
function tagFreq(html: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const m of html.matchAll(/<([a-z][a-z0-9]*)\b/gi)) {
    const tag = m[1]!.toLowerCase();
    freq.set(tag, (freq.get(tag) ?? 0) + 1);
  }
  return freq;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    const va = a.get(k) ?? 0;
    const vb = b.get(k) ?? 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Visible text → set of lowercased word tokens (scripts/styles/tags stripped). */
function textTokens(html: string): Set<string> {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  return new Set(text.match(/[a-z0-9]{3,}/g) ?? []);
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Structure + content closeness vs the real page (0-100). */
function htmlMatchScore(modelHtml: string, refHtml: string): number {
  const structure = cosine(tagFreq(modelHtml), tagFreq(refHtml)); // 0-1
  const content = jaccard(textTokens(modelHtml), textTokens(refHtml)); // 0-1
  return clamp((structure * 0.5 + content * 0.5) * 100);
}

/** Design tokens: colors, CSS custom properties, font families, class vocabulary. */
function designTokens(html: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of html.matchAll(/#[0-9a-f]{3,8}\b/gi)) tokens.add(`color:${m[0]!.toLowerCase()}`);
  for (const m of html.matchAll(/--[a-z0-9-]+/gi)) tokens.add(`var:${m[0]!.toLowerCase()}`);
  for (const m of html.matchAll(/font-family\s*:\s*([^;"}]+)/gi)) {
    tokens.add(`font:${m[1]!.toLowerCase().replace(/\s+/g, " ").trim()}`);
  }
  for (const m of html.matchAll(/class\s*=\s*["']([^"']+)["']/gi)) {
    for (const cls of m[1]!.split(/\s+/)) if (cls) tokens.add(`class:${cls.toLowerCase()}`);
  }
  return tokens;
}

/**
 * Legacy design-token proxy (0-100): colors/CSS vars/fonts/class-name overlap.
 * Kept only as a secondary, transparency signal — the headline visual score now
 * comes from rendered screenshots (see {@link VisualVerdict} / `visual.ts`).
 */
function visualTokensScore(modelHtml: string, refHtml: string): number {
  return clamp(jaccard(designTokens(modelHtml), designTokens(refHtml)) * 100);
}

const WEIGHTS = {
  audit: 0.2,
  structure: 0.1,
  schema: 0.1,
  links: 0.1,
  wordCount: 0.05,
  speed: 0.05,
  htmlMatch: 0.2,
  visualMatch: 0.2,
} as const;

/**
 * Score every successful model. Speed is relative to the fastest successful run
 * (fastest = 100). htmlMatch / visualMatch compare each final page against the
 * real published page. Failed models are left unscored.
 *
 * `visualVerdicts` carries the rendered-screenshot visual judge (perceptual
 * pixel-diff + optional vision-LLM rating), keyed by model id. When a model has
 * a verdict, `visualMatch` is the headline screenshot score; when it doesn't
 * (e.g. the browser wasn't run), `visualMatch` falls back to the design-token
 * proxy so the pipeline never silently loses the metric.
 */
export function scoreModels(
  models: ModelResult[],
  wordCountFloor: number,
  referenceHtml: string,
  visualVerdicts?: Map<string, VisualVerdict>,
): void {
  const ok = models.filter((m) => m.status === "ok" && m.checkerReport && m.html);
  const fastestMs = Math.min(...ok.map((m) => m.totalMs).filter((n) => n > 0), Infinity);

  for (const m of ok) {
    const report = m.checkerReport!;
    const speed = fastestMs === Infinity || m.totalMs <= 0 ? 0 : clamp((fastestMs / m.totalMs) * 100);
    const visualTokens = visualTokensScore(m.html!, referenceHtml);
    const verdict = visualVerdicts?.get(m.id) ?? null;
    const partial: Omit<ModelScores, "composite"> = {
      audit: auditScore(report),
      structure: structureScore(m.html!),
      schema: schemaScore(m.schemaValid, report),
      links: linksScore(report),
      wordCount: wordCountScore(report, wordCountFloor),
      speed,
      htmlMatch: htmlMatchScore(m.html!, referenceHtml),
      visualMatch: verdict ? verdict.combined : visualTokens,
      visualPixel: verdict ? verdict.pixel : null,
      visualLlm: verdict ? verdict.llm : null,
      visualTokens,
    };
    const composite = clamp(
      partial.audit * WEIGHTS.audit +
        partial.structure * WEIGHTS.structure +
        partial.schema * WEIGHTS.schema +
        partial.links * WEIGHTS.links +
        partial.wordCount * WEIGHTS.wordCount +
        partial.speed * WEIGHTS.speed +
        partial.htmlMatch * WEIGHTS.htmlMatch +
        partial.visualMatch * WEIGHTS.visualMatch,
    );
    m.scores = { ...partial, composite };
  }
}

```

### Source — seo-verify-demo.ts

`scripts/src/bakeoff/seo-verify-demo.ts` — 4,269 chars

```ts
import { readFile } from "node:fs/promises";
import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeGrokComplete,
  type ChatMessage,
  type CompleteFn,
} from "./providers.js";
import { ARTIFACT_TO_INLINE_OPTIONAL, seoVerifyPrompt, type PromptVars } from "./miniPrompts.js";
import { tryExtractHtmlDocument } from "./extract.js";
import { loadReferenceHtml, resolveTarget } from "./target.js";

/**
 * Cheap, single-turn DEMO of the live-web-search SEO-verify capability: instead
 * of running the whole bake-off pipeline, it loads an already-built HTML page,
 * seeds it into the chat as the prior "build" turn, and sends the EXACT
 * seoVerifyPrompt() with web search switched ON — exactly as the real run does
 * at the seo-verify step. Prints the model's report so you can see the live
 * search + MODERN SEO SCORE in action without re-running every model/turn.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run bakeoff:seo-verify-demo
 *   SEO_DEMO_MODEL=gemini SEO_DEMO_HTML=/path/to/page.html pnpm ... run bakeoff:seo-verify-demo
 */
const TARGET = resolveTarget();

function promptVars(): PromptVars {
  return {
    city: TARGET.city,
    state: TARGET.state,
    url: TARGET.url,
    niche: TARGET.niche,
    pageName: `${TARGET.city} ${TARGET.niche}`,
    hubSpoke: "",
  };
}

async function pickModel(id: string): Promise<{ label: string; complete: CompleteFn }> {
  switch (id) {
    case "claude":
      return { label: "Claude Opus 4.8", complete: makeClaudeComplete("claude-opus-4-8") };
    case "gemini":
      return { label: "Gemini 3.1 Pro", complete: makeGeminiComplete("gemini-3.1-pro-preview") };
    case "openai":
      return { label: "OpenAI gpt-5.5", complete: makeOpenAIComplete("gpt-5.5") };
    case "grok": {
      const tag = await discoverNewestGrok();
      return { label: `Grok (${tag})`, complete: makeGrokComplete(tag) };
    }
    default:
      throw new Error(`Unknown SEO_DEMO_MODEL=${id} (use: claude | gemini | openai | grok).`);
  }
}

async function main(): Promise<void> {
  const modelId = (process.env.SEO_DEMO_MODEL ?? "claude").trim();
  const htmlPath = process.env.SEO_DEMO_HTML?.trim();

  // The page under review: an explicit SEO_DEMO_HTML wins; otherwise pull the
  // per-target reference page (checked-in fixture or a live fetch of the target
  // URL) so the demo works for ANY city, not just the Billings fixture.
  let html: string;
  let pageSource: string;
  if (htmlPath) {
    html = await readFile(htmlPath, "utf8");
    pageSource = htmlPath;
  } else {
    const reference = await loadReferenceHtml(TARGET);
    if (!reference.html.trim()) {
      throw new Error(
        `No page to review for ${TARGET.city}, ${TARGET.state}: no reference fixture and live fetch of ` +
          `${TARGET.url} failed. Set SEO_DEMO_HTML=/path/to/page.html to supply one.`,
      );
    }
    html = reference.html;
    pageSource = `${reference.source} (${TARGET.url})`;
  }

  const { label, complete } = await pickModel(modelId);
  console.log(`SEO-verify demo → ${label}`);
  console.log(`Target: ${TARGET.city}, ${TARGET.state} — ${TARGET.url}`);
  console.log(`Page under review: ${pageSource} (${html.length} chars)`);
  console.log(`Live web search: ON (this turn only)\n`);

  // Seed the chat exactly as the pipeline reaches seo-verify: the built page is
  // the prior assistant turn, then we send the verbatim seo-verify prompt.
  const messages: ChatMessage[] = [
    { role: "user", content: "Build the landing page now. Output the complete HTML artifact." },
    { role: "assistant", content: html },
  ];
  messages.push({ role: "user", content: seoVerifyPrompt(promptVars()) + ARTIFACT_TO_INLINE_OPTIONAL });

  const t0 = Date.now();
  const res = await complete(messages, undefined, { webSearch: true });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`=== ${label} reply (${secs}s, ${res.raw.length} chars) ===\n`);
  console.log(res.raw);

  const updated = tryExtractHtmlDocument(res.raw);
  console.log(
    `\n=== summary ===\nUpdated HTML emitted: ${updated ? `yes (${updated.length} chars)` : "no"}`,
  );
}

main().catch((err) => {
  console.error("seo-verify demo failed:", err);
  process.exitCode = 1;
});

```

### Source — target.ts

`scripts/src/bakeoff/target.ts` — 5,420 chars

```ts
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Classification, Competition, PageType } from "@workspace/mc-core";

/**
 * The build target the bake-off / produce pipeline points at. Every model and
 * scenario shares ONE target so the comparison stays apples-to-apples; the
 * target only selects WHICH page is being reproduced, never how a given model is
 * driven.
 */
export interface BakeoffTarget {
  url: string;
  city: string;
  state: string;
  niche: string;
  pageType: PageType;
  classification: Classification;
  competition: Competition;
}

/** The original Billings, MT smoke target — the default when nothing is set. */
const DEFAULT_TARGET: BakeoffTarget = {
  url: "https://www.stselectronicrecyclinginc.com/billings-mt",
  city: "Billings",
  state: "MT",
  niche: "electronics recycling",
  pageType: "SPOKE",
  classification: "NEW_BUILD",
  competition: "MEDIUM",
};

const PAGE_TYPES: PageType[] = ["HUB", "SPOKE", "NATIONAL"];
const CLASSIFICATIONS: Classification[] = ["NEW_BUILD", "REVAMP", "LIGHT_TOUCH"];
const COMPETITIONS: Competition[] = ["LOW", "MEDIUM", "HIGH"];

function pickEnum<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: T[],
  fallback: T,
): T {
  if (raw == null || raw.trim() === "") return fallback;
  const value = raw.trim().toUpperCase();
  if (!allowed.includes(value as T)) {
    throw new Error(`${name}="${raw}" is invalid — expected one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

/**
 * Resolve the build target from the environment, defaulting to the Billings, MT
 * page so existing flows are unchanged. Override any field via env to point the
 * run at ANY city/url:
 *   - URL:            `BAKEOFF_TARGET_URL` (or legacy `BAKEOFF_PAGE_URL`)
 *   - City / State:   `BAKEOFF_CITY` / `BAKEOFF_STATE`
 *   - Niche:          `BAKEOFF_NICHE`
 *   - Page metadata:  `BAKEOFF_PAGE_TYPE` / `BAKEOFF_CLASSIFICATION` / `BAKEOFF_COMPETITION`
 * The enum-typed fields fail loud on an unrecognized value rather than silently
 * falling back, matching the repo's fail-loud convention.
 */
export function resolveTarget(): BakeoffTarget {
  const url =
    process.env.BAKEOFF_TARGET_URL?.trim() ||
    process.env.BAKEOFF_PAGE_URL?.trim() ||
    DEFAULT_TARGET.url;
  const city = process.env.BAKEOFF_CITY?.trim() || DEFAULT_TARGET.city;
  const state = process.env.BAKEOFF_STATE?.trim() || DEFAULT_TARGET.state;
  const niche = process.env.BAKEOFF_NICHE?.trim() || DEFAULT_TARGET.niche;
  return {
    url,
    city,
    state,
    niche,
    pageType: pickEnum("BAKEOFF_PAGE_TYPE", process.env.BAKEOFF_PAGE_TYPE, PAGE_TYPES, DEFAULT_TARGET.pageType),
    classification: pickEnum(
      "BAKEOFF_CLASSIFICATION",
      process.env.BAKEOFF_CLASSIFICATION,
      CLASSIFICATIONS,
      DEFAULT_TARGET.classification,
    ),
    competition: pickEnum(
      "BAKEOFF_COMPETITION",
      process.env.BAKEOFF_COMPETITION,
      COMPETITIONS,
      DEFAULT_TARGET.competition,
    ),
  };
}

/** Slug used to locate a per-target reference fixture, e.g. `billings-mt`. */
export function targetSlug(target: Pick<BakeoffTarget, "city" | "state">): string {
  return `${target.city}-${target.state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = resolve(HERE, "reference");

export interface ReferenceHtml {
  /** The reference page HTML used for closeness scoring ("" when unavailable). */
  html: string;
  /** Where it came from: a per-target fixture, a live fetch, or none. */
  source: "fixture" | "live-fetch" | "none";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the reference page used to score how CLOSE a model's build is to the real
 * published page. Selection is per-target and degrades gracefully (closeness
 * scoring is a comparison aid, not a build input, so it must never block a run):
 *   1. a checked-in fixture `reference/<city>-<state>.html` (the Billings default), then
 *   2. a live fetch of the supplied target URL, then
 *   3. an empty reference (closeness scores degrade to 0 rather than crashing).
 */
export async function loadReferenceHtml(target: BakeoffTarget): Promise<ReferenceHtml> {
  const fixturePath = resolve(REFERENCE_DIR, `${targetSlug(target)}.html`);
  if (await fileExists(fixturePath)) {
    const html = await readFile(fixturePath, "utf8");
    console.log(`Reference page: fixture ${fixturePath} (${html.length} chars).`);
    return { html, source: "fixture" };
  }

  try {
    const res = await fetch(target.url, { headers: { "user-agent": "STS-Bakeoff/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.trim()) throw new Error("empty body");
    console.log(`Reference page: live fetch ${target.url} (${html.length} chars).`);
    return { html, source: "live-fetch" };
  } catch (err) {
    console.log(
      `Reference page: none — no fixture for "${targetSlug(target)}" and live fetch of ${target.url} failed ` +
        `(${err instanceof Error ? err.message : String(err)}). Closeness scoring will degrade for this run.`,
    );
    return { html: "", source: "none" };
  }
}

```

### Source — types.ts

`scripts/src/bakeoff/types.ts` — 3,700 chars

```ts
import type { CheckerReport, LinkAuditResult, ResearchBrief } from "@workspace/mc-core";
import type { CostEstimate } from "./cost.js";

export type { CostEstimate };

export interface PhaseTiming {
  phase: string;
  ms: number;
  summary: string;
  errorCount: number;
  warningCount: number;
  wordCount: number;
  /**
   * For the gated verification turns (seo-verify / verify-links and their
   * corrective re-verify turns): the parsed ✅/❌ verdict. "passed" or "failed"
   * when the model emitted an explicit verdict; null when no verdict line was
   * found (treated as a non-blocking pass-through). Absent for non-verify turns.
   */
  verdict?: "passed" | "failed" | null;
}

export interface ModelScores {
  /** Quality of the checker pass (errors/warnings on the final page). */
  audit: number;
  /** Design-skeleton completeness (structural signals present). */
  structure: number;
  /** JSON-LD validity + schema-rules checker. */
  schema: number;
  /** Link audit (sacred links, allowlist, insecure links). */
  links: number;
  /** Word count vs. the floor. */
  wordCount: number;
  /** Speed relative to the fastest successful model. */
  speed: number;
  /** Closeness to the real published page: tag structure + visible-text overlap. */
  htmlMatch: number;
  /**
   * Headline visual closeness to the real page (0-100). When screenshots are
   * available this is the rendered-image verdict (mean of pixel + vision-LLM);
   * otherwise it falls back to the design-token proxy.
   */
  visualMatch: number;
  /** Perceptual pixel-diff similarity of the rendered screenshots, or null. */
  visualPixel: number | null;
  /** Vision-LLM "how close does it look" rating (0-100), or null if unavailable. */
  visualLlm: number | null;
  /** Legacy design-token proxy (colors/CSS vars/fonts/classes) — kept for transparency. */
  visualTokens: number;
  /** Weighted overall (0-100). */
  composite: number;
}

export interface ModelResult {
  id: string;
  label: string;
  provider: string;
  model: string;
  status: "ok" | "error";
  error: string | null;
  research: ResearchBrief | null;
  html: string | null;
  schema: string | null;
  schemaValid: boolean;
  checkerReport: CheckerReport | null;
  linkAudit: LinkAuditResult | null;
  timings: PhaseTiming[];
  totalMs: number;
  scores: ModelScores | null;
  /** Relative path (under the viewer's public dir) to this model's rendered screenshot. */
  screenshot: string | null;
  /** Best-effort USD cost estimate for the run (token usage is not captured). */
  costEstimate: CostEstimate | null;
}

/**
 * One bake-off scenario: the same four models run against the SAME grounding,
 * differing only by the context they are handed. The "no-gmb" scenario uses the
 * exact production context (which omits an explicit page_url / GMB block); the
 * "gmb" scenario hands every model an identical enriched context (explicit
 * page_url + GMB data block). Keeping them as sibling scenarios — rather than
 * patching only OpenAI's prompt — preserves the apples-to-apples comparison.
 */
export interface ScenarioResult {
  id: string;
  label: string;
  /** One-line explanation of what context this scenario fed the models. */
  description: string;
  notes: string[];
  models: ModelResult[];
}

export interface BakeoffResults {
  ranAt: string;
  target: {
    url: string;
    city: string;
    state: string;
    niche: string;
    pageType: string;
    classification: string;
    competition: string;
  };
  grounding: { source: string; content: string };
  scenarios: ScenarioResult[];
  /** Relative path (under the viewer's public dir) to the real reference page screenshot. */
  referenceScreenshot: string | null;
}

```

### Source — visual.ts

`scripts/src/bakeoff/visual.ts` — 9,146 chars

```ts
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * The true visual judge for the bake-off.
 *
 * Instead of comparing CSS design tokens (a weak proxy), this renders each
 * model's final HTML and the real reference page to PNG screenshots with a
 * headless Chromium, then scores how close they LOOK:
 *   - perceptual: pixel-diff similarity (pixelmatch) over identical-size shots
 *   - vision-LLM: an optional "how close does this look?" rating from Claude
 *
 * Screenshots are captured at a fixed viewport so every image has identical
 * dimensions and the pixel diff is directly comparable across models.
 */

/** Fixed capture frame — identical dims make pixelmatch directly comparable. */
export const SHOT_VIEWPORT = { width: 1280, height: 2400 } as const;

/** Resolve the Chromium binary (Nix store path moves, so resolve at runtime). */
function resolveChromium(): string {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }
  for (const cmd of ["chromium", "chromium-browser", "google-chrome", "chrome"]) {
    const found = spawnSync("which", [cmd], { encoding: "utf8" }).stdout?.trim();
    if (found && existsSync(found)) return found;
  }
  throw new Error(
    "Chromium not found. Install it (Nix `chromium`) or set CHROMIUM_PATH to a Chrome/Chromium binary.",
  );
}

/**
 * Renders HTML strings to fixed-size PNG screenshots with headless Chromium.
 * Launch once, render many, then close.
 */
export class ScreenshotRenderer {
  // playwright-core types are loaded lazily so the module imports cleanly even
  // when the browser isn't needed.
  private browser: import("playwright-core").Browser | null = null;

  async start(): Promise<void> {
    if (this.browser) return;
    const { chromium } = await import("playwright-core");
    this.browser = await chromium.launch({
      executablePath: resolveChromium(),
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars"],
    });
  }

  /** Render one HTML document to a fixed {@link SHOT_VIEWPORT}-sized PNG buffer. */
  async render(html: string): Promise<Buffer> {
    if (!this.browser) throw new Error("ScreenshotRenderer.start() must be called first.");
    const context = await this.browser.newContext({
      viewport: { ...SHOT_VIEWPORT },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    try {
      // Inline-render the document. External assets (images/fonts) may or may
      // not resolve in this environment — give them a chance, but never hang.
      await page.setContent(html, { waitUntil: "load", timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(800);
      const buf = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: SHOT_VIEWPORT.width, height: SHOT_VIEWPORT.height },
      });
      return buf;
    } finally {
      await context.close();
    }
  }

  async stop(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}

/**
 * Perceptual similarity (0-100) between two equal-size PNG screenshots.
 * 100 = pixel-identical; lower = more visually different.
 */
export function perceptualSimilarity(a: Buffer, b: Buffer): number {
  const ia = PNG.sync.read(a);
  const ib = PNG.sync.read(b);
  if (ia.width !== ib.width || ia.height !== ib.height) {
    throw new Error(
      `Screenshot dimensions differ (${ia.width}x${ia.height} vs ${ib.width}x${ib.height}); both must use SHOT_VIEWPORT.`,
    );
  }
  const { width, height } = ia;
  const diff = new PNG({ width, height });
  const numDiff = pixelmatch(ia.data, ib.data, diff.data, width, height, { threshold: 0.1 });
  const total = width * height;
  return Math.max(0, Math.min(100, Math.round((1 - numDiff / total) * 100)));
}

/**
 * Optional vision-LLM rating (0-100): asks Claude how visually close the model's
 * rendered page is to the real page. Returns null if the Anthropic integration
 * isn't configured or the call fails — the perceptual score still stands.
 */
export async function visionRating(
  modelPng: Buffer,
  refPng: Buffer,
  model = "claude-sonnet-4-6",
): Promise<number | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) return null;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 200,
      system:
        "You are a meticulous visual QA judge. You compare two screenshots of web pages and rate how visually similar they are — overall layout, section order, color palette, typography, spacing and visual density. Respond with ONLY a JSON object of the form {\"score\": <0-100 integer>, \"reason\": \"<one short sentence>\"} and nothing else. 100 means visually indistinguishable; 0 means completely different.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "REFERENCE (the real published page):" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: refPng.toString("base64") } },
            { type: "text", text: "CANDIDATE (a model's generated page):" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: modelPng.toString("base64") } },
            { type: "text", text: "How visually close is the CANDIDATE to the REFERENCE? Reply with the JSON object only." },
          ],
        },
      ],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { score?: unknown };
    const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score);
    if (!Number.isFinite(score)) return null;
    return Math.max(0, Math.min(100, Math.round(score)));
  } catch {
    return null;
  }
}

export interface VisualVerdict {
  /** Pixel-diff perceptual similarity (0-100). Always present. */
  pixel: number;
  /** Vision-LLM "how close does it look" rating (0-100), or null if unavailable. */
  llm: number | null;
  /** Combined headline visual score: mean of pixel + llm when llm is present. */
  combined: number;
}

/** Combine the perceptual + vision scores into one headline visual score. */
export function combineVisual(pixel: number, llm: number | null): VisualVerdict {
  const combined = llm == null ? pixel : Math.round((pixel + llm) / 2);
  return { pixel, llm, combined };
}

/** A model whose final HTML can be screenshotted and judged. */
export interface JudgeableModel {
  id: string;
  status: string;
  html: string | null;
}

export interface JudgeOptions {
  /** Absolute directory to write the PNG screenshots into. */
  outDir: string;
  /** Path prefix stored in results (relative to the viewer's public dir), e.g. "screenshots". */
  pathPrefix: string;
  /** Whether to also request the vision-LLM rating (needs the Anthropic integration). */
  vision: boolean;
}

export interface JudgeResult {
  /** Relative path to the rendered reference screenshot. */
  referenceScreenshot: string;
  /** Visual verdict per model id (only for successful models with HTML). */
  verdicts: Map<string, VisualVerdict>;
  /** Relative screenshot path per model id. */
  screenshots: Map<string, string>;
}

/**
 * Render the reference page + every successful model's HTML to screenshots,
 * write the PNGs to {@link JudgeOptions.outDir}, and score each model's visual
 * closeness to the reference (perceptual pixel-diff + optional vision-LLM).
 *
 * This is the heart of the "true visual judge": it actually looks at how the
 * pages render rather than diffing CSS tokens.
 */
export async function judgeVisual(
  models: JudgeableModel[],
  referenceHtml: string,
  opts: JudgeOptions,
): Promise<JudgeResult> {
  await mkdir(opts.outDir, { recursive: true });
  const renderer = new ScreenshotRenderer();
  await renderer.start();

  const verdicts = new Map<string, VisualVerdict>();
  const screenshots = new Map<string, string>();
  try {
    const refPng = await renderer.render(referenceHtml);
    const refRel = `${opts.pathPrefix}/reference.png`;
    await writeFile(join(opts.outDir, "reference.png"), refPng);

    for (const m of models) {
      if (m.status !== "ok" || !m.html) continue;
      const png = await renderer.render(m.html);
      const rel = `${opts.pathPrefix}/${m.id}.png`;
      await writeFile(join(opts.outDir, `${m.id}.png`), png);
      screenshots.set(m.id, rel);

      const pixel = perceptualSimilarity(png, refPng);
      const llm = opts.vision ? await visionRating(png, refPng) : null;
      verdicts.set(m.id, combineVisual(pixel, llm));
    }
    return { referenceScreenshot: refRel, verdicts, screenshots };
  } finally {
    await renderer.stop();
  }
}

```

## 5. Golden reference page & a representative generated page

The reference page is the REAL published STS page the models are scored against. A
representative generated page (the highest-composite model from the latest run) is
included so reviewers can judge actual output quality.

### Golden reference page (HTML)

`scripts/src/bakeoff/reference/billings-mt.html` — 54,139 chars

```html
<!DOCTYPE html>
<!-- PAGE_BUILDER_V3
     bible: B
     competition: LOW
     niche: general
     word_count: 2000
     entities_placed: 4
     soft_targets: hero_intro|equipment_intro|industry_card_1|industry_card_2|about_city
     faqs_selected: cert|areas|large_scale|pickup
     sections_included: hero|why_choose|equipment|certifications|stats_bar|industries|liquidation|data_security|faq|service_areas|related_services|cta
     sections_excluded: none
     seo_audit: v10.10
-->
<html lang="en">
<head>
<!-- SEO architecture by Mark Domnenko | AI-Powered SEO & Marketing Automation -->
<meta charset="UTF-8">
<meta name="author" content="Mark Domnenko">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Electronics Recycling Billings MT | R2 Certified | STS</title>
<meta name="description" content="R2 certified electronics recycling Billings MT. Free pickup in Yellowstone County. NAID AAA data destruction and ITAD services for Montana businesses.">
<meta name="keywords" content="electronics recycling Billings MT, e-waste Billings Montana, R2 certified recycling Billings, ITAD Billings MT, data destruction Billings Montana, computer recycling Billings, hard drive destruction Montana, IT asset disposition Billings">
<link rel="canonical" href="https://www.stselectronicrecyclinginc.com/billings-mt">
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"></noscript>
<link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"></noscript>
<style>
:root{--primary:#2c5aa0;--primary-dark:#1e4080;--accent:#10b981;--gray-950:#09090b;--gray-900:#111827;--gray-800:#1f2937;--gray-700:#374151;--gray-600:#4b5563;--gray-500:#6b7280;--gray-400:#9ca3af;--gray-300:#d1d5db;--gray-200:#e5e7eb;--gray-100:#f3f4f6;--gray-50:#f9fafb;--white:#ffffff;--cream:#fefdfb}
*{margin:0;padding:0;box-sizing:border-box}
.item-page,.blog-item,.article-content,.page-header,div.item-page>div,div.blog-item>div,.page-title,.page-header h1,.page-header h2,.article-intro,.item-intro,.componentheading,.contentheading,.item-title{margin-top:0!important;padding-top:0!important}
.page-header{display:none!important}
.breadcrumb{margin-bottom:5px!important}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:var(--gray-900);line-height:1.7;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;background:var(--cream);font-weight:400;letter-spacing:-.2px}
.container{max-width:1280px;margin:0 auto;padding:0 48px;position:relative;z-index:1}
.container-narrow{max-width:1080px;margin:0 auto;padding:0 48px}
.full-width{width:100vw;margin-left:50%;transform:translateX(-50%)}
.section{padding:120px 0;position:relative;overflow:hidden}
.grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:48px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:44px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:40px}
.text-c{text-align:center}
.bg-white{background:var(--white)}
.bg-cream{background:var(--cream)}
.bg-gray{background:#fafbfc}
.bg-pattern{position:absolute;inset:0;background-image:repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,.008) 3px,rgba(0,0,0,.008) 4px);pointer-events:none;opacity:.5}
.section-eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:var(--primary);margin-bottom:20px;display:inline-block}
.section-title{font-size:56px;font-weight:900;color:var(--gray-900);margin-bottom:24px;letter-spacing:-1.8px;line-height:1.08}
.section-subtitle{font-size:19px;color:var(--gray-600);max-width:780px;margin:0 auto;line-height:1.75;font-weight:400}
a.link-p{color:var(--primary);text-decoration:none;font-weight:600;transition:color .3s ease}
a.link-p:hover{color:var(--primary-dark)}
.hero{position:relative;background:linear-gradient(135deg,rgba(20,35,60,.94) 0%,rgba(30,45,75,.92) 100%),url('https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg') center/cover;color:var(--white);min-height:820px;display:flex;align-items:center;justify-content:center;padding:120px 48px;overflow:hidden;margin-top:-35px}
.hero::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 40px,rgba(255,255,255,.008) 40px,rgba(255,255,255,.008) 41px);pointer-events:none;z-index:1}
.hero-content{max-width:1280px;width:100%;margin:0 auto;position:relative;z-index:2;display:grid;grid-template-columns:1.15fr 440px;gap:80px;align-items:center}
.hero h1{font-size:64px;font-weight:900;line-height:1.05;letter-spacing:-2px;margin:0 0 32px 0}
.hero h1 .accent{color:#7dd3fc;font-weight:900}
.hero-subtitle{font-size:20px;font-weight:400;color:rgba(255,255,255,.9);line-height:1.75;max-width:600px;margin-bottom:36px}
.hero-features{list-style:none;padding:0;display:flex;flex-direction:column;gap:16px;margin:0 0 40px 0}
.hero-features li{display:flex;align-items:center;gap:14px;color:rgba(255,255,255,.94);font-size:17px;font-weight:500}
.hero-features .icon-check{color:var(--accent);background:rgba(16,185,129,.12);width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:13px;flex-shrink:0}
.hero-cta-btns{display:flex;gap:16px}
.floating-card{background:var(--white);border-radius:28px;padding:12px;box-shadow:0 40px 100px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);position:relative;z-index:2}
.floating-card h3{color:var(--gray-900);font-size:26px;font-weight:800;margin:0 0 12px 0;text-align:center;line-height:1.2;padding:12px 12px 0;letter-spacing:-.5px}
.floating-card-form{width:100%;min-height:500px;display:block;border-radius:18px;background:transparent}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:12px;padding:18px 40px;border-radius:14px;text-decoration:none;font-weight:700;font-size:17px;transition:all .35s cubic-bezier(.4,0,.2,1);cursor:pointer;border:none;letter-spacing:-.2px}
.btn:hover{transform:translateY(-2px)}
.btn-primary{background:var(--primary);color:var(--white);box-shadow:0 8px 24px rgba(44,90,160,.3)}
.btn-primary:hover{background:var(--primary-dark);box-shadow:0 12px 32px rgba(44,90,160,.4)}
.btn-secondary{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);color:var(--white);backdrop-filter:blur(12px)}
.btn-secondary:hover{background:rgba(255,255,255,.22);border-color:rgba(255,255,255,.32)}
.luxury-card{background:var(--white);padding:52px 44px;border-radius:24px;box-shadow:0 2px 8px rgba(0,0,0,.04);border:1px solid rgba(44,90,160,.06);transition:all .4s cubic-bezier(.4,0,.2,1);text-align:center;position:relative;overflow:hidden}
.luxury-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(44,90,160,.1),transparent)}
.luxury-card:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(0,0,0,.12);border-color:rgba(44,90,160,.12)}
.luxury-card-icon{width:72px;height:72px;border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 32px;font-size:32px;transition:all .4s ease;position:relative}
.luxury-card:hover .luxury-card-icon{transform:scale(1.05)}
.luxury-card h3{font-size:22px;font-weight:800;color:var(--gray-900);margin-bottom:18px;letter-spacing:-.5px;line-height:1.3}
.luxury-card p{font-size:16px;line-height:1.75;color:var(--gray-600);margin:0}
.stats-section{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);position:relative;overflow:hidden}
.stats-section::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,transparent 0%,rgba(59,130,246,.06) 100%)}
.stats-section::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 40px,rgba(255,255,255,.015) 40px,rgba(255,255,255,.015) 41px)}
.stat-card{text-align:center;padding:44px 32px;background:rgba(255,255,255,.05);border-radius:20px;backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);transition:all .4s ease;position:relative;z-index:1}
.stat-card:hover{background:rgba(255,255,255,.08);transform:translateY(-6px);border-color:rgba(255,255,255,.12)}
.stat-number{font-size:64px;font-weight:900;color:var(--white);margin-bottom:14px;line-height:1;letter-spacing:-2.5px}
.stat-label{font-size:13px;color:rgba(255,255,255,.75);font-weight:600;text-transform:uppercase;letter-spacing:1.5px}
.industry-hero{position:relative;height:520px;background:linear-gradient(135deg,rgba(15,23,42,.94) 0%,rgba(30,41,59,.90) 100%),url('https://www.stselectronicrecyclinginc.com/images/2017/compressed/datacenter-286386_1280.jpg') center/cover;display:flex;align-items:center;justify-content:center;margin-bottom:-60px;z-index:1}
.industry-hero-content{text-align:center;color:var(--white);max-width:900px;padding:0 48px;position:relative;z-index:2}
.industry-hero h2{font-size:56px;font-weight:900;color:var(--white);margin-bottom:24px;letter-spacing:-1.8px;line-height:1.1}
.industry-hero p{font-size:20px;color:rgba(255,255,255,.88);line-height:1.7;max-width:720px;margin:0 auto}
.industry-cards-wrapper{background:var(--white);padding:120px 0 100px;position:relative;z-index:2}
.industry-card{background:var(--white);border-radius:24px;padding:52px 44px;box-shadow:0 4px 16px rgba(0,0,0,.06);border:1px solid rgba(44,90,160,.08);transition:all .45s cubic-bezier(.4,0,.2,1);position:relative}
.industry-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(44,90,160,.15),transparent)}
.industry-card:hover{transform:translateY(-8px);box-shadow:0 30px 80px rgba(0,0,0,.16);border-color:rgba(44,90,160,.16)}
.industry-icon{width:64px;height:64px;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:32px;font-size:32px;transition:transform .4s ease}
.industry-card:hover .industry-icon{transform:scale(1.08)}
.industry-card h3{font-size:24px;font-weight:800;color:var(--gray-900);margin:0 0 22px 0;letter-spacing:-.6px;line-height:1.25}
.industry-card p{font-size:17px;line-height:1.8;color:var(--gray-600);margin:0}
.list-links{list-style:none;padding:0;text-align:left}
.list-links li{padding:10px 0;font-size:16px;color:var(--gray-700);transition:all .3s ease}
.list-links a{color:var(--primary);text-decoration:none;font-weight:500;transition:all .3s ease}
.list-links a:hover{color:var(--primary-dark);padding-left:4px}
@media(max-width:1100px){.hero-content{grid-template-columns:1fr 400px;gap:60px}.hero h1{font-size:56px}}
@media(max-width:968px){
.container{padding:0 32px}
.container-narrow{padding:0 32px}
.section{padding:90px 0}
.hero{min-height:auto;padding:80px 32px}
.hero-content{grid-template-columns:1fr;gap:48px}
.hero h1{font-size:44px;text-align:center}
.hero-subtitle{text-align:center;max-width:100%}
.floating-card{max-width:500px;margin:0 auto}
.hero-cta-btns{flex-direction:column;align-items:stretch;max-width:420px;margin:0 auto}
.hero-cta-btns a{width:100%;min-height:44px}
.grid-2,.grid-3,.grid-4{grid-template-columns:1fr!important;gap:32px}
.section-title{font-size:40px;line-height:1.15}
.section-subtitle{font-size:17px}
.industry-hero{height:auto;padding:80px 32px;margin-bottom:-40px}
.industry-hero h2{font-size:40px}
.industry-hero p{font-size:18px}
div[style*="grid-template-columns:440px 1fr"]{grid-template-columns:1fr!important;gap:32px!important}
div[style*="padding:52px"]{padding:36px 28px!important}
div[style*="padding:56px"]{padding:36px 28px!important}
div[style*="padding:60px"]{padding:36px 28px!important}
.stat-number{font-size:48px}
}
@media(max-width:640px){
.container{padding:0 24px}
.section{padding:70px 0}
.hero{padding:60px 24px}
.hero h1{font-size:36px}
.section-title{font-size:32px}
.btn{padding:16px 32px;font-size:16px}
.stat-number{font-size:40px}
}
</style>
</head>
<body>

<!-- SECTION: HERO -->
<div class="hero full-width">
<div class="hero-content">
<div>
<h1>R2 Certified <span class="accent">Electronics Recycling</span> in Billings, Montana</h1>
<!-- AUDIT_TARGET -->
<p class="hero-subtitle">Professional ITAD and certified data destruction for Billings businesses, healthcare systems, and Montana government organizations. Serving Yellowstone County and Eastern Montana from our 600,000 sq ft R2v3 certified facility with NAID AAA data destruction and zero landfill processing.</p>
<ul class="hero-features">
<li><span class="icon-check"><i class="fas fa-check"></i></span>R2v3 Certified Processing and Compliance</li>
<li><span class="icon-check"><i class="fas fa-check"></i></span>NAID AAA Certified Data Destruction</li>
<li><span class="icon-check"><i class="fas fa-check"></i></span>Free Pickup Throughout Yellowstone County</li>
</ul>
<div class="hero-cta-btns">
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn btn-primary"><i class="fas fa-calendar-check"></i> Schedule Free Pickup</a>
<a href="mailto:recycle@stsrecycle.com" class="btn btn-secondary"><i class="fas fa-envelope"></i> Email Us</a>
</div>
</div>
<div class="floating-card">
<h3>Get A Free Quote</h3>
<div class="floating-card-form">{loadposition city-hero-form}</div>
</div>
</div>
</div>

<!-- SECTION: WHY CHOOSE STS -->
<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:80px">
<div class="section-eyebrow">Why Choose STS</div>
<h2 class="section-title">Billings Premier ITAD and Data Destruction Services</h2>
<p class="section-subtitle">Healthcare IT managers and government technology directors in Billings need certified vendors with full documentation. STS provides <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" class="link-p">IT asset disposition and electronics recycling</a> with R2v3 and NAID AAA certifications for Montana healthcare systems and government agencies throughout Yellowstone County</p>
</div>

<div class="grid-3" style="margin-bottom:60px">
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#d1fae5 0%,#ecfdf5 100%);color:#047857;box-shadow:0 4px 16px rgba(4,120,87,.12)"><i class="fas fa-certificate"></i></div>
<h3>R2v3 Certified Facility</h3>
<p>Responsible recycling standards with full downstream tracking and third-party auditing. Montana government agencies and healthcare systems require vendors meeting R2v3 certification for all electronics disposal, giving IT directors a documented compliance foundation for regulatory reviews.</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%);color:#1e40af;box-shadow:0 4px 16px rgba(30,64,175,.12)"><i class="fas fa-truck"></i></div>
<h3>Free Pickup Service</h3>
<p>Throughout Billings and Yellowstone County at no cost with flexible scheduling for businesses of any volume. STS coordinates single-device pickups through multi-building enterprise deployments with same-week availability for most Montana organizations. Government agencies, healthcare facilities, and educational institutions in the Billings metro can schedule coordinated multi-site pickups accommodating operational schedules and compliance timelines.</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#e0e7ff 0%,#eef2ff 100%);color:#4338ca;box-shadow:0 4px 16px rgba(67,56,202,.12)"><i class="fas fa-shield-alt"></i></div>
<h3>NAID AAA Data Destruction</h3>
<p>NAID AAA certified data destruction with serial-number-specific certificates of destruction for every device. Montana healthcare compliance officers and IT security managers receive complete chain-of-custody documentation designed to support HIPAA audit reviews and regulatory inquiries.</p>
</div>
</div>

<div class="grid-3" style="margin-bottom:70px">
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#f3e8ff 0%,#faf5ff 100%);color:#7c3aed;box-shadow:0 4px 16px rgba(124,58,237,.12)"><i class="fas fa-warehouse"></i></div>
<h3>600,000 sq ft Processing Facility</h3>
<p>Handle any volume from single computers to full data center decommissioning projects with zero landfill commitment. STS processes equipment from Montana businesses, healthcare systems, and government agencies with complete downstream material tracking at every stage.</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#fef3c7 0%,#fefce8 100%);color:#b45309;box-shadow:0 4px 16px rgba(180,83,9,.12)"><i class="fas fa-leaf"></i></div>
<h3>Zero Landfill Policy</h3>
<p>100% environmentally responsible processing with complete documentation for ESG reporting and corporate sustainability requirements. STS maintains certified smelter relationships and downstream accountability for every material stream recovered from Billings electronics. Montana organizations increasingly require zero-landfill documentation for internal sustainability reporting and stakeholder disclosures, which STS provides as a standard part of every engagement.</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#d1fae5 0%,#ecfdf5 100%);color:#059669;box-shadow:0 4px 16px rgba(5,150,105,.12)"><i class="fas fa-clock"></i></div>
<h3>Same-Week Scheduling</h3>
<p>Fast scheduling for Billings businesses with convenient service throughout Yellowstone County and Eastern Montana. Most organizations receive same-week pickup confirmation, and healthcare and government clients typically receive priority scheduling for time-sensitive compliance projects.</p>
</div>
</div>

<div style="text-align:center">
<div style="display:inline-flex;gap:18px;flex-wrap:wrap;justify-content:center">
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn btn-primary">Schedule Free Pickup</a>
<a href="mailto:recycle@stsrecycle.com" class="btn btn-primary"><i class="fas fa-envelope"></i> Email Us</a>
</div>
</div>
</div>
</div>

<!-- SECTION: EQUIPMENT -->
<div class="section full-width bg-gray">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">Inventory</div>
<h2 class="section-title">What Electronics Can Be Recycled in Billings?</h2>
<p class="section-subtitle">STS processes all electronic equipment for Billings businesses and Montana institutions, from individual laptops to full data center volumes, with secure data destruction and certified downstream tracking for every IT asset category</p>
</div>
<div class="grid-2" style="gap:80px;align-items:center;margin-bottom:70px">
<div class="text-c">
<img src="https://www.stselectronicrecyclinginc.com/images/2017/compressed/laptop-1742462_1920.jpg" alt="electronics recycling ITAD Billings Montana R2v3 certified IT asset disposition healthcare government" style="width:100%;height:auto;border-radius:28px;box-shadow:0 10px 32px rgba(0,0,0,.08)" loading="lazy">
<p style="margin-top:24px;font-size:16px;color:var(--gray-600);font-weight:500;line-height:1.75">Healthcare IT managers at organizations like Billings Clinic (4,700 employees) typically choose NAID AAA certified vendors for data destruction. STS is frequently recommended by Montana compliance officers managing HIPAA 45 CFR §164.312 audit requirements</p>
</div>
<div>
<h3 style="font-size:36px;font-weight:900;color:var(--primary);margin-bottom:32px;line-height:1.2;letter-spacing:-1.2px">IT Asset Disposition for Billings Organizations</h3>
<!-- AUDIT_TARGET -->
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);margin-bottom:28px">STS Electronic Recycling provides R2v3 certified IT asset disposition and NAID AAA data destruction for Billings businesses and Montana organizations. Billings Clinic (4,700 employees), Yellowstone County government departments, and Montana state agencies rely on STS for Business Associate Agreements, multi-building pickup coordination, and serial-number-specific certificates of destruction.</p>
<p style="font-size:18px;line-height:1.8;color:var(--gray-700)">According to the Global E-waste Monitor 2024, only 22.3% of the 62 million metric tonnes of global e-waste generated in 2022 was formally recycled. STS provides <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" class="link-p">comprehensive ITAD services</a> with serial-number-specific certificates of destruction and downstream tracking for Billings enterprises.</p>
</div>
</div>
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);margin-bottom:40px;text-align:center">STS processes a comprehensive range of IT equipment for Montana businesses, government agencies, and healthcare organizations with R2v3 certified methods and NIST 800-88 aligned data sanitization. STS engagements with Billings organizations typically include equipment inventorying, coordinated multi-location pickup, and same-day certificate issuance.</p>
<div class="grid-2" style="gap:44px">
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--primary);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Computer & IT Equipment</h4>
<ul class="list-links">
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/317-computer-recycling">Computer Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/318-laptop-recycling">Laptop Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/331-tablet-recycling">Tablet Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/319-cell-phone-recycling">Cell Phone & Mobile Device Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/320-networking-equipment-recycling">Networking Equipment Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/321-printer-recycling">Printer Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/322-copy-machine-recycling">Copy Machine & Copier Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/323-server-equipment-recycling">Server & Data Center Equipment</a></li>
</ul>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--gray-700);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Components & Accessories</h4>
<ul class="list-links">
<li>• <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding">Hard Drive Destruction</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/325-monitor-recycling">Monitor & Display Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/324-ink-and-toner-recycling">Ink & Toner Cartridge Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/329-keyboard-mouse-recycling">Keyboard & Peripheral Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/328-cable-recycling">Cable & Wire Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/327-battery-recycling">Battery Recycling</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/326-old-electronics-recycling">Legacy & Old Electronics</a></li>
</ul>
</div>
</div>
</div>
</div>

<!-- SECTION: CERTIFICATIONS -->
<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">Certifications</div>
<h2 class="section-title">R2v3 Certified ITAD Services</h2>
<p class="section-subtitle">Secure IT asset disposition for Montana corporations, government agencies, and healthcare systems throughout Billings and Yellowstone County</p>
</div>
<div class="grid-4" style="margin-bottom:70px">
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#fef3c7 0%,#fefce8 100%);color:#b45309;box-shadow:0 4px 16px rgba(180,83,9,.12)"><i class="fas fa-certificate"></i></div>
<h3>R2v3 Certified</h3>
<p>Looking for R2v3 certified electronics recycling in Billings? R2v3 requires third-party auditing, downstream tracking to certified smelters, and responsible material handling at every stage; this is the standard STS meets for all Montana electronics processed.</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#e0e7ff 0%,#eef2ff 100%);color:#4338ca;box-shadow:0 4px 16px rgba(67,56,202,.12)"><i class="fas fa-shield-alt"></i></div>
<h3>NAID AAA Certified</h3>
<p>NAID AAA is the highest industry standard for data destruction, requiring surprise facility audits and documented chain-of-custody for every device. Healthcare and government IT directors typically expect these certificates for HIPAA and compliance audit reviews, included in every STS engagement.</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#d1fae5 0%,#ecfdf5 100%);color:#047857;box-shadow:0 4px 16px rgba(4,120,87,.12)"><i class="fas fa-dollar-sign"></i></div>
<h3>IT Asset Recovery</h3>
<p>Maximize residual value from retired IT assets with transparent asset valuation and detailed settlement reporting. STS identifies remarketing-eligible equipment and offsets disposal costs with recovery credits for qualifying Montana organizations.</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%);color:#1e40af;box-shadow:0 4px 16px rgba(30,64,175,.12)"><i class="fas fa-map-marker-alt"></i></div>
<h3>Billings Service</h3>
<p>Free pickup service throughout Yellowstone County, Carbon County, Stillwater County, and the broader Eastern Montana region. STS serves Billings Heights, West End, Downtown Billings, and surrounding communities at no cost.</p>
</div>
</div>
<div style="padding:48px 56px;background:linear-gradient(135deg,rgba(59,130,246,.04) 0%,rgba(59,130,246,.02) 100%);border-left:5px solid var(--primary);border-radius:20px;margin-bottom:70px;box-shadow:0 2px 8px rgba(0,0,0,.04)">
<div style="display:flex;align-items:start;gap:24px">
<div style="flex-shrink:0;width:64px;height:64px;background:var(--primary);border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(44,90,160,.2)"><i class="fas fa-file-contract" style="color:white;font-size:28px"></i></div>
<div>
<h4 style="font-size:24px;font-weight:800;color:var(--primary);margin:0 0 16px 0;letter-spacing:-.5px">NIST SP 800-88 Rev. 1 Compliance</h4>
<p style="font-size:17px;line-height:1.8;color:var(--gray-700);margin:0">Per R2v3:2020 certification standards, downstream tracking must document materials through final processing at R2-certified smelters; STS maintains this documentation for every Billings engagement. NIST SP 800-88 Rev. 1 establishes the federal standard for media sanitization, requiring cryptographic erasure or physical destruction for all sensitive data storage devices. Our process documentation supports HIPAA technical safeguard requirements for Montana healthcare organizations. <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding" class="link-p">Secure hard drive shredding services</a> meet the highest data destruction standards for Billings organizations.</p>
</div>
</div>
</div>
<div class="container-narrow">
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);margin-bottom:24px;text-align:center"><strong>How does electronics recycling work in Billings?</strong> STS provides R2v3 certified processing with free pickup throughout Yellowstone County and Eastern Montana. Equipment is transported to our 600,000 sq ft facility serving Billings where NIST 800-88 aligned data sanitization occurs before responsible material recovery. Under R2v3:2020 certification standards, every material stream is tracked through certified downstream processors, and organizations receive complete IT asset disposition documentation within 48 hours of processing.</p>
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);text-align:center">IT directors at Montana healthcare organizations and government agencies prioritize vendors with both NAID AAA certification and R2v3 certification when evaluating electronics disposal providers. Healthcare IT managers require HIPAA-compliant technical safeguards for all protected health information on retired devices. STS provides Business Associate Agreements and serial-number-level chain-of-custody documentation. Our <a href="https://www.stselectronicrecyclinginc.com/healthcare-it-disposal" class="link-p">specialized healthcare IT disposal services</a> support the compliance requirements of Montana's healthcare institutions and Yellowstone County government agencies. Organizations throughout the Billings metro region, including operations in Carbon County, Stillwater County, and Big Horn County, rely on STS for compliant electronics disposal with audit-ready documentation supporting annual compliance reviews and regulatory filings.</p>
</div>
</div>
</div>

<!-- SECTION: STATS BAR -->
<div class="section full-width stats-section">
<div class="container text-c" style="position:relative;z-index:2">
<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:2.5px;margin-bottom:20px">Billings Electronics Recycling</div>
<h2 style="font-size:72px;font-weight:900;text-transform:uppercase;color:#7dd3fc;margin-bottom:32px;letter-spacing:-2.5px">ABSOLUTELY FREE</h2>
<p style="font-size:21px;color:rgba(255,255,255,.92);max-width:820px;margin:0 auto 52px;line-height:1.75;font-weight:400">STS Electronic Recycling offers <strong>ABSOLUTELY FREE</strong> solutions to your Billings business, government agency, or healthcare facility. We serve Billings from our 600,000 sq ft R2v3 certified facility.</p>
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn" style="background:var(--white);color:var(--primary);box-shadow:0 12px 32px rgba(0,0,0,.3);font-size:18px;padding:20px 48px">Get Free Quote</a>
<div class="grid-4" style="margin-top:80px">
<div class="stat-card"><div class="stat-number">600K</div><div class="stat-label">Sq Ft Facility</div></div>
<div class="stat-card"><div class="stat-number">R2v3</div><div class="stat-label">Certified Recycling</div></div>
<div class="stat-card"><div class="stat-number">ZERO</div><div class="stat-label">Landfill Policy</div></div>
<div class="stat-card"><div class="stat-number">FREE</div><div class="stat-label">Pickup Service</div></div>
</div>
</div>
</div>

<!-- SECTION: INDUSTRIES -->
<div class="section full-width" style="padding:0">
<div class="industry-hero">
<div class="industry-hero-content">
<div class="section-eyebrow" style="color:rgba(255,255,255,.75)">Industries Served</div>
<h2>Trusted by Billings Leading Institutions</h2>
<p>Tailored R2v3 certified compliance solutions for Montana's major economic, healthcare, and government sectors with industry-specific documentation and flexible scheduling. Billings serves as the primary commercial center for eastern Montana, meaning technology refresh cycles span healthcare systems, county agencies, higher education institutions, and regional corporate operations requiring compliant disposal partners.</p>
</div>
</div>
<div class="industry-cards-wrapper">
<div class="container">
<div class="grid-3">
<div class="industry-card">
<div class="industry-icon" style="background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%);color:#1e40af"><svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg></div>
<h3>Government &amp; Public Sector</h3>
<!-- AUDIT_TARGET -->
<p><a href="https://www.stselectronicrecyclinginc.com/government-data-destruction" class="link-p">Government electronics recycling</a> with NAID AAA certified data destruction for Yellowstone County departments, Montana state agencies, and Billings municipal offices. STS supports federal procurement compliance with complete chain-of-custody documentation and audit trails for government IT managers responsible for secure media disposal.</p>
</div>
<div class="industry-card">
<div class="industry-icon" style="background:linear-gradient(135deg,#fee2e2 0%,#fef2f2 100%);color:#dc2626"><svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/></svg></div>
<h3>Healthcare Systems</h3>
<!-- AUDIT_TARGET -->
<p>HIPAA-compliant disposal supporting Billings Clinic (4,700 employees) and Intermountain Health's St. Vincent Regional Hospital (1,700+ caregivers) with Business Associate Agreements and detailed certificates of destruction. Montana healthcare IT directors require complete PHI chain-of-custody documentation, which STS provides as part of every standard engagement.</p>
</div>
<div class="industry-card">
<div class="industry-icon" style="background:linear-gradient(135deg,#f3e8ff 0%,#faf5ff 100%);color:#7c3aed"><svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg></div>
<h3>Corporate &amp; Enterprise</h3>
<p>Energy sector, retail, and professional services organizations across Eastern Montana depend on STS for R2v3 certified ITAD with complete audit trails and zero landfill processing. Montana State University Billings and regional enterprises benefit from <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" class="link-p">structured IT asset disposition</a> programs tailored to institutional refresh cycles.</p>
</div>
</div>
</div>
</div>
</div>

<!-- SECTION: LIQUIDATION -->
<div class="section full-width bg-gray">
<div class="bg-pattern"></div>
<div class="container">
<div class="container-narrow">
<h2 style="font-size:48px;font-weight:900;color:var(--primary);margin-bottom:36px;text-align:center;letter-spacing:-1.5px;line-height:1.1">How Can I Liquidate IT Equipment in Billings?</h2>
<p style="font-size:20px;line-height:1.8;margin-bottom:44px;text-align:center;color:var(--gray-700)">STS Electronic Recycling's asset recovery service helps Billings businesses and Montana organizations recover residual value from computers, laptops, LCD monitors, servers, and other retired IT equipment through secure, R2v3 certified disposition with complete downstream documentation and transparent settlement reporting.</p>
<div style="background:linear-gradient(135deg,#dbeafe 0%,#f0f9ff 100%);padding:56px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<p style="font-size:20px;font-weight:600;text-align:center;color:var(--primary);line-height:1.8">Discovering your Billings IT assets' residual value is straightforward with STS certified asset recovery documentation. Email our team at <a href="mailto:recycle@stsrecycle.com" style="text-decoration:none;color:var(--primary);font-weight:700">recycle@stsrecycle.com</a> or <a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" style="text-decoration:none;color:var(--primary);font-weight:700">schedule a free consultation online</a> to get started.</p>
</div>
</div>
</div>
</div>

<!-- SECTION: DATA SECURITY -->
<div class="section full-width" style="background:linear-gradient(135deg,#0a0f1e 0%,#1a1f35 100%);position:relative">
<div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 40px,rgba(255,255,255,.008) 40px,rgba(255,255,255,.008) 41px);pointer-events:none"></div>
<div class="container" style="position:relative;z-index:2">
<div class="grid-2" style="gap:80px;align-items:center;margin-bottom:80px">
<div class="text-c">
<img src="https://www.stselectronicrecyclinginc.com/images/2017/compressed/castle-3181153_1920.jpg" alt="data destruction Billings Montana HIPAA compliant NAID AAA certified secure shredding IT disposal" style="width:100%;height:auto;border-radius:28px;box-shadow:0 20px 70px rgba(0,0,0,.7)" loading="lazy">
</div>
<div>
<h2 style="font-size:48px;font-weight:900;color:var(--white);margin-bottom:36px;letter-spacing:-1.5px;line-height:1.1">Is My Data Safe During Billings Electronics Recycling?</h2>
<p style="font-size:18px;line-height:1.8;margin-bottom:28px;color:rgba(255,255,255,.9)">STS Electronic Recycling provides NAID AAA certified data destruction for Billings organizations requiring HIPAA-compliant disposal. Under HIPAA 45 CFR §164.312, electronic protected health information on disposed devices must be rendered irretrievable. STS destruction documentation supports this standard for Montana healthcare organizations, Yellowstone County agencies, and enterprises with complete chain-of-custody from pickup through final processing.</p>
<p style="font-size:18px;line-height:1.8;margin:0;color:rgba(255,255,255,.9)"><strong>Secure data erasure and hard drive destruction are essential</strong> for responsible electronic waste management in Billings. According to the EPA, discarded electronics account for "an estimated 70% of the heavy metals found in U.S. landfills," a risk that R2v3 certified recycling eliminates. When IT managers at institutions like Montana State University Billings evaluate data destruction providers, they prioritize NAID AAA certification and NIST 800-88 aligned processes, the standard STS exceeds for organizations throughout Yellowstone County.</p>
</div>
</div>
<div class="grid-4" style="max-width:1100px;margin:0 auto">
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(96,165,250,.12);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(96,165,250,.25);box-shadow:0 8px 24px rgba(96,165,250,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-certificate" style="color:#60a5fa;font-size:34px"></i></div>
<h3 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">NIST 800-88</h3>
<p style="color:rgba(255,255,255,.7);font-size:15px">Aligned</p>
</div>
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(16,185,129,.12);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(16,185,129,.25);box-shadow:0 8px 24px rgba(16,185,129,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-award" style="color:var(--accent);font-size:34px"></i></div>
<h3 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">DoD Standards</h3>
<p style="color:rgba(255,255,255,.7);font-size:15px">Exceeds</p>
</div>
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(255,255,255,.08);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-medkit" style="color:rgba(255,255,255,.85);font-size:34px"></i></div>
<h3 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">HIPAA</h3>
<p style="color:rgba(255,255,255,.7);font-size:15px">Compliant</p>
</div>
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(255,255,255,.08);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-clipboard-check" style="color:rgba(255,255,255,.85);font-size:34px"></i></div>
<h3 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">Chain of Custody</h3>
<p style="color:rgba(255,255,255,.7);font-size:15px">Complete</p>
</div>
</div>
</div>
</div>

<!-- SECTION: FAQ -->
<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">FAQ</div>
<h2 class="section-title">Electronics Recycling FAQ for Billings Organizations</h2>
<p class="section-subtitle">Everything you need to know about R2v3 certified electronics recycling in Billings, Montana</p>
</div>
<div class="grid-2" style="gap:44px">
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">What certifications does STS hold?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">STS holds R2v3 (Responsible Recycling) certification for electronics processing and <a href="https://www.stselectronicrecyclinginc.com/naid-certified-data-destruction" class="link-p">NAID AAA certification</a> for data destruction. Our processes support NIST SP 800-88 Rev. 1 standards and HIPAA technical safeguard requirements for Montana healthcare and government clients.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">What areas do you serve near Billings?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">When organizations search for electronics recycling near me throughout Billings, STS provides free pickup throughout Yellowstone County, including Laurel, Lockwood, Billings Heights, and surrounding communities along I-90 and across eastern Montana. Same-week scheduling is available for government agencies, healthcare facilities, and businesses of all sizes.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">Can you handle large-scale ITAD projects?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">Yes. Our 600,000 sq ft facility handles enterprise-scale IT asset disposition including <a href="https://www.stselectronicrecyclinginc.com/data-center-decommissioning" class="link-p">data center decommissioning</a>, multi-building government coordination, and healthcare system-wide equipment disposal throughout Montana.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">Is pickup really free?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">Free pickup is available for qualifying volumes at no charge throughout Billings and Yellowstone County. Organizations receive <a href="https://www.stselectronicrecyclinginc.com/certificate-of-destruction-services" class="link-p">certificates of destruction</a> and complete audit documentation at no additional cost. Contact us to discuss your specific volume and scheduling needs for Billings area service.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">What documentation do you provide after pickup?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">Every STS engagement includes a Certificate of Destruction with serial-number tracking for each device. Montana healthcare organizations receive HIPAA audit documentation; government clients receive chain-of-custody records for state and federal compliance. Complete downstream tracking reports confirming R2v3 certified processing are typically available within 48 hours of completion.</p>
</div>
</div>
</div>
</div>

<!-- SECTION: SERVICE AREAS + ABOUT CITY -->
<div class="section full-width bg-gray">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:80px">
<div class="section-eyebrow">Local Focus</div>
<h2 class="section-title">Service Areas &amp; About Billings</h2>
</div>
<div style="display:grid;grid-template-columns:440px 1fr;gap:48px;margin-bottom:48px;align-items:stretch">
<div style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);color:#fff;padding:60px 48px;border-radius:24px;box-shadow:0 10px 32px rgba(0,0,0,.08)">
<h3 style="font-size:26px;font-weight:800;color:#fff;margin:0 0 44px 0;letter-spacing:-.6px">Billings by the Numbers</h3>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px 28px">
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">120K+</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">POPULATION</div></div>
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">2</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">MAJOR HEALTH SYSTEMS</div></div>
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">4+</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">COUNTIES SERVED</div></div>
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">5</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">STATE REGIONAL HUB</div></div>
</div>
</div>
<div style="background:#fff;padding:60px 56px;border-radius:24px;box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h3 style="font-size:26px;font-weight:800;color:var(--gray-900);margin:0 0 44px 0;letter-spacing:-.6px">Service Areas</h3>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0 52px">
<div><h4 style="color:var(--primary);font-size:13px;font-weight:800;margin:0 0 24px 0;text-transform:uppercase;letter-spacing:1.8px">PRIMARY</h4><div style="font-size:16px;line-height:2;color:var(--gray-700);font-weight:500"><div>Downtown Billings</div><div>Billings Heights</div><div>West End</div><div>Midtown</div><div>South Side</div><div>Lockwood</div></div></div>
<div><h4 style="color:var(--primary);font-size:13px;font-weight:800;margin:0 0 24px 0;text-transform:uppercase;letter-spacing:1.8px">METRO</h4><div style="font-size:16px;line-height:2;color:var(--gray-700);font-weight:500"><div>Laurel</div><div>Huntley</div><div>Shepherd</div><div>Columbus</div><div>Roundup</div><div>Hardin</div></div></div>
<div><h4 style="color:var(--primary);font-size:13px;font-weight:800;margin:0 0 24px 0;text-transform:uppercase;letter-spacing:1.8px">REGIONAL</h4><div style="font-size:16px;line-height:2;color:var(--gray-700);font-weight:500"><div>Yellowstone County</div><div>Carbon County</div><div>Stillwater County</div><div>Big Horn County</div><div>Musselshell County</div><div>Eastern Montana</div></div></div>
</div>
</div>
</div>
<div style="background:#fff;padding:56px 60px;border-radius:24px;box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:24px;font-weight:800;margin:0 0 24px 0;color:var(--gray-900);letter-spacing:-.5px">About Billings</h4>
<!-- AUDIT_TARGET -->
<p style="font-size:17px;line-height:1.8;color:var(--gray-700);margin:0">Billings, Montana's largest city, serves as the commercial hub for a five-state region spanning eastern Montana, northern Wyoming, and the Dakotas. Home to Billings Clinic (4,700 employees), First Interstate Bank (2,400 employees across Montana), and Yellowstone County government, the metro generates significant IT equipment turnover. STS Electronic Recycling provides <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" style="color:var(--primary);text-decoration:none;font-weight:600">R2v3 certified electronic waste disposal and NAID AAA data destruction</a> serving healthcare systems, government agencies, and enterprises throughout Yellowstone County.</p>
</div>
</div>
</div>

<!-- SECTION: RELATED SERVICES -->
<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">Related Services</div>
<h2 class="section-title">Related Billings Services</h2>
<p class="section-subtitle">Comprehensive ITAD, data destruction, and electronics recycling solutions for Billings businesses, Montana healthcare systems, and government agencies throughout Yellowstone County</p>
</div>
<div class="grid-2" style="gap:44px">
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h3 style="font-size:22px;font-weight:800;color:var(--primary);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Core ITAD Services</h3>
<ul class="list-links">
<li>• <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad">ITAD Services</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding">Hard Drive Destruction</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding">On-Site Shredding</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/healthcare-it-disposal">Healthcare IT Disposal</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/certificate-of-destruction-services">Certificate of Destruction</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/data-center-decommissioning">Data Center Decommissioning</a></li>
</ul>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h3 style="font-size:22px;font-weight:800;color:var(--gray-700);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Strategic Services</h3>
<ul class="list-links">
<li>• <a href="https://www.stselectronicrecyclinginc.com/corporate-data-security-disposal">Corporate Data Security</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/government-data-destruction">Government Electronics</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/hipaa-compliant-hard-drive-destruction">HIPAA Compliant Destruction</a></li>
<li>• <a href="https://www.stselectronicrecyclinginc.com/naid-certified-data-destruction">NAID Certified Destruction</a></li>
</ul>
</div>
</div>
</div>
</div>

<!-- SECTION: CTA (NO GMB: no phone, no address, no map embed) -->
<div class="section full-width" style="background:linear-gradient(135deg,#2c5aa0 0%,#1e40af 100%);padding:110px 0;text-align:center;color:#fff">
<div class="container">
<h2 style="font-size:60px;font-weight:900;margin-bottom:32px;letter-spacing:-2px">Ready to Get Started?</h2>
<p style="font-size:21px;opacity:.92;margin-bottom:48px;max-width:640px;margin-left:auto;margin-right:auto;line-height:1.75;font-weight:400">Free pickup throughout Billings and Yellowstone County. STS serves Billings from our 600,000 sq ft R2v3 certified facility, with same-week scheduling for organizations along I-90 and throughout Eastern Montana.</p>
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn" style="background:#fff;color:var(--primary);padding:22px 52px;font-weight:900;box-shadow:0 8px 28px rgba(0,0,0,.25);font-size:18px">Schedule Free Pickup</a>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:28px;margin-top:80px;max-width:740px;margin-left:auto;margin-right:auto">
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" style="background:rgba(255,255,255,.14);backdrop-filter:blur(16px);padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,.22);transition:all .4s ease;cursor:pointer;text-decoration:none;color:#fff;display:block"><i class="fas fa-calendar-check" style="font-size:28px;margin-bottom:20px;opacity:.92;display:block"></i><div style="font-weight:700;font-size:18px">Schedule Free Pickup</div></a>
<a href="mailto:recycle@stsrecycle.com" style="background:rgba(255,255,255,.14);backdrop-filter:blur(16px);padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,.22);transition:all .4s ease;cursor:pointer;text-decoration:none;color:#fff;display:block"><i class="fas fa-envelope" style="font-size:28px;margin-bottom:20px;opacity:.92;display:block"></i><div style="font-weight:700;font-size:18px">recycle@stsrecycle.com</div></a>
</div>
</div>
</div>

</body>
</html>

```

### Golden reference page (extracted schema)

`scripts/src/bakeoff/reference/billings-mt-schema.txt` — 14,726 chars

```text
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://www.stselectronicrecyclinginc.com/#website",
      "url": "https://www.stselectronicrecyclinginc.com/",
      "name": "STS Electronic Recycling, Inc.",
      "publisher": {
        "@type": "Organization",
        "@id": "https://www.stselectronicrecyclinginc.com/#org",
        "name": "STS Electronic Recycling, Inc.",
        "logo": {
          "@type": "ImageObject",
          "url": "https://www.stselectronicrecyclinginc.com/images/sts-logo.png"
        },
        "sameAs": [
          "https://www.facebook.com/STSRecycle/",
          "https://www.linkedin.com/company/sts-electronic-recycling-inc./"
        ]
      }
    },
    {
      "@type": "HowTo",
      "@id": "https://www.stselectronicrecyclinginc.com/billings-mt#howto",
      "name": "How to Schedule Electronics Recycling in Billings, Montana",
      "description": "Step-by-step process for scheduling R2v3 certified electronics recycling and NAID AAA data destruction for Billings businesses, healthcare organizations, and Yellowstone County government agencies.",
      "image": "https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg",
      "totalTime": "PT15M",
      "supply": [
        {
          "@type": "HowToSupply",
          "name": "List of equipment to recycle"
        },
        {
          "@type": "HowToSupply",
          "name": "Asset serial numbers (if tracking required)"
        }
      ],
      "tool": [
        {
          "@type": "HowToTool",
          "name": "Online quote form or email contact"
        }
      ],
      "step": [
        {
          "@type": "HowToStep",
          "position": 1,
          "name": "Request a Free Quote",
          "text": "Contact STS Electronic Recycling via email at recycle@stsrecycle.com or the online quote form. Provide equipment types, quantities, and preferred pickup timing for your Billings or Yellowstone County location. Healthcare organizations and government agencies receive priority scheduling for compliance-sensitive projects.",
          "url": "https://www.stselectronicrecyclinginc.com/quote"
        },
        {
          "@type": "HowToStep",
          "position": 2,
          "name": "Schedule Your Billings Pickup",
          "text": "STS coordinates a convenient pickup time for your Billings, Yellowstone County, or Eastern Montana location. Multi-site coordination is available for healthcare systems like Billings Clinic and government agencies requiring chain-of-custody documentation from point of collection through final processing.",
          "image": "https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg"
        },
        {
          "@type": "HowToStep",
          "position": 3,
          "name": "Secure Transport to Processing Facility",
          "text": "Equipment is collected from your Billings location with chain-of-custody documentation initiated at pickup. GPS-tracked vehicles transport all electronics to STS's 600,000 sq ft R2v3 certified facility serving Billings and Eastern Montana organizations, maintaining unbroken custody records throughout transit.",
          "image": "https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg"
        },
        {
          "@type": "HowToStep",
          "position": 4,
          "name": "Asset Tracking and NAID AAA Data Destruction",
          "text": "Each device is tracked by serial number through NAID AAA certified data destruction. NIST SP 800-88 Rev. 1 compliant sanitization or physical destruction is applied to all data-bearing media. Montana healthcare organizations receive Business Associate Agreement documentation for HIPAA 45 CFR 164.312 compliance requirements.",
          "image": "https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg"
        },
        {
          "@type": "HowToStep",
          "position": 5,
          "name": "R2v3 Certified Environmental Processing",
          "text": "All materials undergo R2v3 certified processing with zero-landfill commitment for Billings organizations. Functional equipment is remarketed to offset disposal costs for qualifying Montana businesses. Downstream tracking documents all materials through certified smelters and processors, meeting R2v3:2020 chain-of-custody requirements.",
          "image": "https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg"
        },
        {
          "@type": "HowToStep",
          "position": 6,
          "name": "Receive Certificate of Destruction",
          "text": "Complete Certificate of Destruction is delivered within 48 hours of processing, documenting serial numbers, destruction methods, equipment weights, and downstream facility tracking. Satisfies HIPAA audit requirements for Billings healthcare organizations, state procurement documentation for Yellowstone County agencies, and annual compliance filings for Montana businesses.",
          "url": "https://www.stselectronicrecyclinginc.com/certificate-of-destruction-services"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://www.stselectronicrecyclinginc.com/billings-mt#faqpage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What certifications does STS Electronic Recycling hold?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "STS Electronic Recycling holds R2v3 (Responsible Recycling) certification for electronics processing and NAID AAA certification for data destruction. R2v3 certification ensures downstream tracking to certified smelters for all Billings organizations. NAID AAA certification requires unannounced facility audits and documented chain-of-custody for every device processed. For Billings healthcare organizations, our processes support NIST SP 800-88 Rev. 1 data sanitization standards under HIPAA technical safeguard requirements. Yellowstone County government agencies receive documentation meeting federal procurement requirements for certified electronics disposal and IT asset disposition."
          }
        },
        {
          "@type": "Question",
          "name": "Do you provide free electronics recycling pickup throughout Billings and Yellowstone County?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. STS Electronic Recycling provides free pickup for qualifying volumes throughout Billings, Yellowstone County, and Eastern Montana. Service areas include Downtown Billings, Billings Heights, West End, Lockwood, Midtown, and South Side, as well as Laurel, Shepherd, Columbus, Roundup, and Hardin on scheduled routes. Organizations like Billings Clinic (4,700 employees) coordinate multi-building pickups to accommodate operational schedules. Healthcare facilities, government agencies, and educational institutions in the Billings metro receive same-week scheduling for time-sensitive compliance and equipment disposal projects."
          }
        },
        {
          "@type": "Question",
          "name": "Is STS data destruction HIPAA compliant for Billings healthcare organizations?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. STS Electronic Recycling provides NAID AAA certified data destruction that supports HIPAA 45 CFR 164.312 technical safeguard requirements for Billings healthcare organizations. Under HIPAA regulations, electronic protected health information on retired devices must be rendered irretrievable before disposal. Billings Clinic (4,700 employees) and Intermountain Health's St. Vincent Regional Hospital (1,700 plus caregivers) receive Business Associate Agreements and serial-number-specific certificates of destruction. Yellowstone County healthcare compliance officers receive complete chain-of-custody records designed to support OCR audit reviews and regulatory documentation requirements."
          }
        },
        {
          "@type": "Question",
          "name": "Can STS handle large-scale ITAD projects for Billings and Montana organizations?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. STS Electronic Recycling's 600,000 sq ft R2v3 certified facility handles enterprise-scale IT asset disposition for Billings organizations of any volume. Services include data center decommissioning, multi-building government coordination for Yellowstone County agencies, and healthcare system-wide equipment disposal. Montana State University Billings and regional enterprises benefit from structured IT asset disposition programs handling complete institutional refresh cycles. STS manages logistics, asset inventorying, secure transport, and complete audit documentation for multi-location organizations throughout Billings and the five-state Eastern Montana regional area."
          }
        },
        {
          "@type": "Question",
          "name": "What documentation does STS provide after electronics recycling pickup in Billings?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Every STS engagement includes a Certificate of Destruction documenting each device by serial number, destruction method, weight, and downstream processor. Billings healthcare organizations receive HIPAA-compliant documentation supporting audit requirements under 45 CFR 164.312. Yellowstone County government clients receive chain-of-custody records meeting state and federal compliance standards. Downstream tracking reports confirm R2v3 certified processing through certified smelters and downstream processors. Documentation is typically available within 48 hours of processing completion, with multi-device summary reports for annual compliance filings available for Billings businesses upon request."
          }
        },
        {
          "@type": "Question",
          "name": "What types of electronics can be recycled in Billings, Montana?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "STS Electronic Recycling accepts all categories of IT and electronic equipment from Billings businesses, healthcare organizations, and government agencies. Accepted categories include desktop computers and laptops, tablets and mobile devices, servers and networking equipment, printers and copiers, monitors and displays, cables, batteries, and legacy electronics of any age. Data-bearing devices from Yellowstone County organizations receive NAID AAA certified data destruction before processing. Equipment with residual market value is remarketed to offset disposal costs for qualifying Billings businesses and institutions."
          }
        },
        {
          "@type": "Question",
          "name": "How quickly can Billings organizations receive a Certificate of Destruction?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "STS Electronic Recycling typically delivers Certificates of Destruction within 48 hours of processing completion for Billings and Yellowstone County organizations. Each certificate documents serial numbers, destruction methods, equipment weights, and downstream processing facility tracking. Billings healthcare facilities operating under HIPAA requirements can request expedited documentation for time-sensitive compliance reviews. Government agencies in Yellowstone County and Montana state departments receive standard certificates meeting audit trail requirements. Multi-device summary reports for Billings enterprises managing large-scale IT refresh cycles are available upon request at no additional cost."
          }
        },
        {
          "@type": "Question",
          "name": "How does R2v3 certification protect Billings organizations during electronics recycling?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "R2v3 certification requires independent third-party auditing, downstream tracking to certified smelters, and documented chain-of-custody from collection through final material processing. Under R2v3:2020 standards, STS maintains traceable documentation for every material stream recovered from Billings electronics. Yellowstone County government departments and Billings healthcare institutions can request full downstream audit trails confirming responsible processing at certified facilities. R2v3 certified recycling also eliminates data liability by ensuring all electronic media containing sensitive information undergoes certified destruction before any material recovery occurs."
          }
        }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://www.stselectronicrecyclinginc.com/billings-mt#breadcrumb",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://www.stselectronicrecyclinginc.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Services",
          "item": "https://www.stselectronicrecyclinginc.com/services"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Billings Electronics Recycling",
          "item": "https://www.stselectronicrecyclinginc.com/billings-mt"
        }
      ]
    },
    {
      "@type": "WebPage",
      "@id": "https://www.stselectronicrecyclinginc.com/billings-mt#webpage",
      "url": "https://www.stselectronicrecyclinginc.com/billings-mt",
      "name": "Electronics Recycling Billings MT | R2 Certified | STS",
      "description": "R2 certified electronics recycling Billings MT. Free pickup in Yellowstone County. NAID AAA data destruction and ITAD services for Montana businesses.",
      "isPartOf": {
        "@id": "https://www.stselectronicrecyclinginc.com/#website"
      },
      "creator": {
        "@type": "Person",
        "name": "Mark Domnenko",
        "jobTitle": "AI Strategy & Growth Specialist",
        "sameAs": "https://www.linkedin.com/in/markdomnenko",
        "knowsAbout": [
          "AI Strategy",
          "Prompt Engineering",
          "Generative Engine Optimization",
          "Enterprise SEO",
          "Structured Data Optimization",
          "Fractional CMO",
          "Fractional AI Consulting",
          "AI Automation"
        ]
      },
      "primaryImageOfPage": {
        "@type": "ImageObject",
        "url": "https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg"
      },
      "inLanguage": "en-US"
    }
  ]
}
</script>

```

## 6. Latest run — results & log summary

**Ran at:** 2026-06-25T15:46:16.260Z

**Target:**

```json
{
  "url": "https://www.stselectronicrecyclinginc.com/billings-mt",
  "city": "Billings",
  "state": "MT",
  "niche": "electronics recycling",
  "pageType": "SPOKE",
  "classification": "NEW_BUILD",
  "competition": "MEDIUM"
}
```

**Grounding source:** model-knowledge (shared)

Full shared grounding brief handed identically to every model:

```text
[MODEL-KNOWLEDGE GROUNDING — Perplexity/SerpAPI keys are not configured in this environment, so this is NOT a live web search. It is one model-authored local-market brief, generated ONCE and shared identically across every model so the page-build comparison is fair.]

# Local Market Research Summary: Electronics Recycling in Billings, MT

## Economic & Employer Context

Billings is Montana's largest city, with a metro population estimated at roughly 180,000–200,000 residents, making it the dominant commercial hub for a vast surrounding region that spans much of eastern Montana and northern Wyoming. The city's economic backbone rests on energy (refining, oil and gas services), healthcare, agriculture-related trade, and retail. Major employers include Billings Clinic and St. Vincent Healthcare (now Billings Clinic's second campus), both large hospital systems that generate substantial volumes of end-of-life medical and administrative electronics. ExxonMobil's Billings refinery and associated energy-sector firms add an industrial equipment and computing hardware stream. The region's role as a retail and wholesale trade center means significant small-business density, producing regular turnover of point-of-sale systems, computers, and networking equipment.

## Relevant Demographics & Institutions

Billings is home to Montana State University Billings (MSUB) and Rocky Mountain College, both of which cycle through IT equipment on multi-year refresh schedules. Yellowstone County government, Billings Public Schools, and numerous federal agency field offices (BLM, USFS, BIA) represent additional institutional electronics generators. The relatively older median age of the general population, combined with a high rate of small-business ownership across the region, suggests a market where consumer education about responsible disposal remains important — residents may not yet treat e-waste recycling as a default habit.

## Competitive Landscape

The electronics recycling niche in Billings is notably thin. There is no dominant, well-branded private e-waste recycler operating at scale in the market, based on available information. Best Buy maintains a store in Billings and offers its in-store take-back program for select consumer electronics at no charge, representing the most visible drop-off option for individual consumers. Staples similarly accepts limited categories of electronics. The City of Billings and Yellowstone County have periodically coordinated **household hazardous waste (HHW) collection events** that accept electronics, but these are sporadic rather than continuous. Some regional scrap metal dealers handle certain metal-bearing electronic components, but certified data destruction and full-spectrum e-waste processing is not a well-served category locally. This creates a meaningful opening for STS Electronic Recycling to position as the credentialed, compliant, business-to-business focused provider in the market.

## Regulatory & Program Environment

Montana does not currently have a state-mandated extended producer responsibility (EPR) law for electronics, meaning there is no state-financed infrastructure (such as the collector networks seen in Washington or Minnesota) that would compete with or subsidize local services. This is a double-edged reality: there is no taxpayer-funded competitor, but there is also less regulatory pressure forcing businesses to act. However, **federal regulations** — particularly EPA rules governing CRT glass, batteries, and certain hazardous components — still apply, and HIPAA-regulated healthcare employers face genuine liability for improper disposal of data-bearing devices. That compliance driver is arguably the strongest near-term sales lever with Billings Clinic, St. Vincent, and the county's healthcare network. Additionally, any federal contractors operating locally must adhere to NIST 800-88 data sanitization standards, broadening the compliance-motivated buyer pool.

## Summary Opportunity

Billings presents a **low-competition, institutional-demand-driven** opportunity for STS. The healthcare sector, energy-sector offices, government agencies, and educational institutions collectively generate consistent e-waste volume with genuine compliance needs. The absence of a competing certified recycler operating year-round means STS can establish first-mover brand recognition in a geographically isolated but commercially active market.
```

### Scenario: No-GMB (production context) (`no-gmb`)

The exact human No-GMB checklist a VA runs today, one continuous chat per model: verbatim copyPrompt() prompts, the real uploaded design files inlined, city/state targeting only, NO explicit page_url and NO GMB block.

- Every model runs the IDENTICAL No-GMB checklist in ONE stateful conversation: intro (files uploaded + rules + model check) → build → design gate / force-rebuild loop → SEO audit → SEO verification → schema (deterministic) → link verification. The prompt text is the tool's verbatim copyPrompt() output; the real uploaded design files are inlined as the API-faithful stand-in for file uploads.
- This is the faithful production reproduction. The context deliberately omits an explicit page_url and any Google Business Profile (GMB) block — STS spoke pages target a service-area city, not a verified storefront.
- Schema is the deterministic No-GMB LocalBusiness (city/state only, NO CID, NO street address) — exactly what the VA's 'Auto-Generate Schema' button emits in No-GMB mode. It is generated deterministically with no AI turn.
- If a model refuses to build under this context (asking for page_url / GMB data first) it surfaces as no HTML and is recorded faithfully as an ERROR — it is NOT patched away, because special-casing one model would break the apples-to-apples comparison.

#### Claude Opus 4.8 — Anthropic (`claude-opus-4-8`)

- **status:** ok
- **composite:** 76
- **scores:** {"audit":76,"structure":50,"schema":100,"links":100,"wordCount":67,"speed":29,"htmlMatch":77,"visualMatch":76,"visualPixel":79,"visualLlm":72,"visualTokens":98,"composite":76}
- **schemaValid:** true
- **total time:** 579.4s — est. cost $2.0300
- **html length:** 46,153 chars

- **per-phase log:**
  - intro: 2.2s, 0 words, 0 err / 0 warn — Intro handshake: files uploaded, NO-GMB rules, model check.
  - build: 185.7s, 0 words, 0 err / 0 warn — Build landing page (Master Page Builder + Master Design Tier 2).
  - seo: 194.3s, 0 words, 0 err / 0 warn — Full SEO audit (Master SEO Audit), schema stripped.
  - seo-verify: 189.0s, 0 words, 0 err / 0 warn, verdict=passed — SEO verification audit (compliance + modern SEO).
  - schema: 0.0s, 1342 words, 2 err / 0 warn — Deterministic schema (No-GMB: no CID, no street address).
  - verify-links: 8.1s, 0 words, 0 err / 0 warn, verdict=passed — Final link verification (emails, contact button, no invented URLs).

#### OpenAI GPT-5.4 — OpenAI (`gpt-5.4`)

- **status:** ok
- **composite:** 76
- **scores:** {"audit":76,"structure":50,"schema":100,"links":100,"wordCount":53,"speed":66,"htmlMatch":69,"visualMatch":78,"visualPixel":83,"visualLlm":72,"visualTokens":85,"composite":76}
- **schemaValid:** true
- **total time:** 250.6s — est. cost $1.1900
- **html length:** 38,181 chars

- **per-phase log:**
  - intro: 6.2s, 0 words, 0 err / 0 warn — Intro handshake: files uploaded, NO-GMB rules, model check.
  - build: 64.1s, 0 words, 0 err / 0 warn — Build landing page (Master Page Builder + Master Design Tier 2).
  - seo: 58.0s, 0 words, 0 err / 0 warn — Full SEO audit (Master SEO Audit), schema stripped.
  - seo-verify: 58.1s, 0 words, 0 err / 0 warn, verdict=failed — SEO verification audit (compliance + modern SEO).
  - seo-verify-fix-1: 58.1s, 0 words, 0 err / 0 warn, verdict=passed — Corrective re-verify 1/2 after a FAILED seo-verify verdict.
  - schema: 0.0s, 1057 words, 2 err / 0 warn — Deterministic schema (No-GMB: no CID, no street address).
  - verify-links: 6.2s, 0 words, 0 err / 0 warn, verdict=passed — Final link verification (emails, contact button, no invented URLs).

#### OpenAI GPT-5.5 — OpenAI (`gpt-5.5`)

- **status:** ok
- **composite:** 75
- **scores:** {"audit":76,"structure":50,"schema":100,"links":100,"wordCount":64,"speed":41,"htmlMatch":70,"visualMatch":79,"visualPixel":85,"visualLlm":72,"visualTokens":87,"composite":75}
- **schemaValid:** true
- **total time:** 402.8s — est. cost $2.0900
- **html length:** 42,909 chars

- **per-phase log:**
  - intro: 6.3s, 0 words, 0 err / 0 warn — Intro handshake: files uploaded, NO-GMB rules, model check.
  - build: 134.7s, 0 words, 0 err / 0 warn — Build landing page (Master Page Builder + Master Design Tier 2).
  - seo: 126.3s, 0 words, 0 err / 0 warn — Full SEO audit (Master SEO Audit), schema stripped.
  - seo-verify: 128.1s, 0 words, 0 err / 0 warn, verdict=passed — SEO verification audit (compliance + modern SEO).
  - schema: 0.0s, 1289 words, 2 err / 0 warn — Deterministic schema (No-GMB: no CID, no street address).
  - verify-links: 7.4s, 0 words, 0 err / 0 warn, verdict=passed — Final link verification (emails, contact button, no invented URLs).

#### Gemini 3.1 Pro — Google (`gemini-3.1-pro-preview`)

- **status:** ok
- **composite:** 73
- **scores:** {"audit":64,"structure":50,"schema":100,"links":100,"wordCount":72,"speed":39,"htmlMatch":72,"visualMatch":76,"visualPixel":80,"visualLlm":72,"visualTokens":97,"composite":73}
- **schemaValid:** true
- **total time:** 428.6s — est. cost $0.8700
- **html length:** 47,541 chars

- **per-phase log:**
  - intro: 8.5s, 0 words, 0 err / 0 warn — Intro handshake: files uploaded, NO-GMB rules, model check.
  - build: 150.3s, 0 words, 0 err / 0 warn — Build landing page (Master Page Builder + Master Design Tier 2).
  - seo: 130.5s, 0 words, 0 err / 0 warn — Full SEO audit (Master SEO Audit), schema stripped.
  - seo-verify: 126.7s, 0 words, 0 err / 0 warn, verdict=passed — SEO verification audit (compliance + modern SEO).
  - schema: 0.0s, 1438 words, 3 err / 0 warn — Deterministic schema (No-GMB: no CID, no street address).
  - verify-links: 12.6s, 0 words, 0 err / 0 warn, verdict=passed — Final link verification (emails, contact button, no invented URLs).

#### OpenAI GPT-5.5-PRO — OpenAI (`gpt-5.5-pro`)

- **status:** ok
- **composite:** 73
- **scores:** {"audit":76,"structure":50,"schema":100,"links":100,"wordCount":66,"speed":21,"htmlMatch":69,"visualMatch":74,"visualPixel":86,"visualLlm":62,"visualTokens":79,"composite":73}
- **schemaValid:** true
- **total time:** 793.9s — est. cost $12.0900
- **html length:** 39,515 chars

- **per-phase log:**
  - intro: 42.7s, 0 words, 0 err / 0 warn — Intro handshake: files uploaded, NO-GMB rules, model check.
  - build: 308.2s, 0 words, 0 err / 0 warn — Build landing page (Master Page Builder + Master Design Tier 2).
  - seo: 193.8s, 0 words, 0 err / 0 warn — Full SEO audit (Master SEO Audit), schema stripped.
  - seo-verify: 216.6s, 0 words, 0 err / 0 warn, verdict=passed — SEO verification audit (compliance + modern SEO).
  - schema: 0.0s, 1319 words, 2 err / 0 warn — Deterministic schema (No-GMB: no CID, no street address).
  - verify-links: 32.4s, 0 words, 0 err / 0 warn, verdict=passed — Final link verification (emails, contact button, no invented URLs).

#### Grok (xAI) — xAI (`grok-4.3`)

- **status:** ok
- **composite:** 72
- **scores:** {"audit":52,"structure":50,"schema":100,"links":80,"wordCount":65,"speed":100,"htmlMatch":79,"visualMatch":75,"visualPixel":78,"visualLlm":72,"visualTokens":97,"composite":72}
- **schemaValid:** true
- **total time:** 165.3s — est. cost $0.4200
- **html length:** 46,274 chars

- **per-phase log:**
  - intro: 3.9s, 0 words, 0 err / 0 warn — Intro handshake: files uploaded, NO-GMB rules, model check.
  - build: 74.8s, 0 words, 0 err / 0 warn — Build landing page (Master Page Builder + Master Design Tier 2).
  - seo: 74.6s, 0 words, 0 err / 0 warn — Full SEO audit (Master SEO Audit), schema stripped.
  - seo-verify: 8.6s, 0 words, 0 err / 0 warn, verdict=passed — SEO verification audit (compliance + modern SEO).
  - schema: 0.0s, 1295 words, 4 err / 0 warn — Deterministic schema (No-GMB: no CID, no street address).
  - verify-links: 3.5s, 0 words, 0 err / 0 warn, verdict=passed — Final link verification (emails, contact button, no invented URLs).

### Representative generated page — Claude Opus 4.8 (highest composite, `claude-opus-4-8`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<!-- SEO architecture by Mark Domnenko | AI-Powered SEO & Marketing Automation -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Electronics Recycling Billings MT | R2 Certified | STS</title>
<meta name="description" content="Professional electronics recycling in Billings, MT. Free pickup, R2v3 certified processing, NIST-compliant data destruction. Serving healthcare, energy, government. 600,000 sq ft facility.">
<meta name="keywords" content="electronics recycling billings mt, billings e-waste recycling, data destruction billings, ITAD billings montana, hard drive shredding billings, computer recycling billings, R2 certified recycling montana, hipaa data destruction billings">
<meta name="author" content="Mark Domnenko">
<link rel="canonical" href="https://www.stselectronicrecyclinginc.com/billings-mt">
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"></noscript>
<link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"></noscript>
<style>
:root{--primary:#2c5aa0;--primary-dark:#1e4080;--accent:#10b981;--gray-950:#09090b;--gray-900:#111827;--gray-800:#1f2937;--gray-700:#374151;--gray-600:#4b5563;--gray-500:#6b7280;--gray-400:#9ca3af;--gray-300:#d1d5db;--gray-200:#e5e7eb;--gray-100:#f3f4f6;--gray-50:#f9fafb;--white:#ffffff;--cream:#fefdfb}
*{margin:0;padding:0;box-sizing:border-box}
.item-page,.blog-item,.article-content,.page-header,div.item-page>div,div.blog-item>div,.page-title,.page-header h1,.page-header h2,.article-intro,.item-intro,.componentheading,.contentheading,.item-title{margin-top:0!important;padding-top:0!important}
.page-header{display:none!important}
.breadcrumb{margin-bottom:5px!important}
.section-header,.section-title,.section-subtitle,.section-eyebrow,.badge{background:transparent!important}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:var(--gray-900);line-height:1.7;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;background:var(--cream);font-weight:400;letter-spacing:-.2px}
.container{max-width:1280px;margin:0 auto;padding:0 48px;position:relative;z-index:1}
.container-narrow{max-width:1080px;margin:0 auto;padding:0 48px}
.full-width{width:100vw;margin-left:50%;transform:translateX(-50%)}
.section{padding:120px 0;position:relative;overflow:hidden}
.grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:48px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:44px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:40px}
.text-c{text-align:center}
.bg-white{background:var(--white)}
.bg-cream{background:var(--cream)}
.bg-gray{background:#fafbfc}
.bg-pattern{position:absolute;inset:0;background-image:repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,.008) 3px,rgba(0,0,0,.008) 4px);pointer-events:none;opacity:.5}
.section-eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:var(--primary);margin-bottom:20px;display:inline-block}
.section-title{font-size:56px;font-weight:900;color:var(--gray-900);margin-bottom:24px;letter-spacing:-1.8px;line-height:1.08}
.section-subtitle{font-size:19px;color:var(--gray-600);max-width:780px;margin:0 auto;line-height:1.75;font-weight:400}
a.link-p{color:var(--primary);text-decoration:none;font-weight:600;transition:color .3s ease}
a.link-p:hover{color:var(--primary-dark)}
.hero{position:relative;background:linear-gradient(135deg,rgba(20,35,60,.94) 0%,rgba(30,45,75,.92) 100%),url('https://www.stselectronicrecyclinginc.com/images/2017/compressed/mac-2585220_1920.jpg') center/cover;color:var(--white);min-height:820px;display:flex;align-items:center;justify-content:center;padding:120px 48px;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 40px,rgba(255,255,255,.008) 40px,rgba(255,255,255,.008) 41px);pointer-events:none;z-index:1}
.hero-content{max-width:1280px;width:100%;margin:0 auto;position:relative;z-index:2;display:grid;grid-template-columns:1.15fr 440px;gap:80px;align-items:center}
.hero h1{font-size:64px;font-weight:900;line-height:1.05;letter-spacing:-2px;margin:0 0 32px 0}
.hero h1 .accent{color:#7dd3fc;font-weight:900}
.hero-subtitle{font-size:20px;font-weight:400;color:rgba(255,255,255,.9);line-height:1.75;max-width:600px;margin-bottom:36px}
.hero-features{list-style:none;padding:0;display:flex;flex-direction:column;gap:16px;margin:0 0 40px 0}
.hero-features li{display:flex;align-items:center;gap:14px;color:rgba(255,255,255,.94);font-size:17px;font-weight:500}
.hero-features .icon-check{color:var(--accent);background:rgba(16,185,129,.12);width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:13px;flex-shrink:0}
.hero-cta-btns{display:flex;gap:16px}
.floating-card{background:var(--white);border-radius:28px;padding:12px;box-shadow:0 40px 100px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);position:relative;z-index:2}
.floating-card h3{color:var(--gray-900);font-size:26px;font-weight:800;margin:0 0 12px 0;text-align:center;line-height:1.2;padding:12px 12px 0;letter-spacing:-.5px}
.floating-card iframe{width:100%;border:none;min-height:500px;display:block;border-radius:18px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:12px;padding:18px 40px;border-radius:14px;text-decoration:none;font-weight:700;font-size:17px;transition:all .35s cubic-bezier(.4,0,.2,1);cursor:pointer;border:none;letter-spacing:-.2px}
.btn:hover{transform:translateY(-2px)}
.btn-primary{background:var(--primary);color:var(--white);box-shadow:0 8px 24px rgba(44,90,160,.3)}
.btn-primary:hover{background:var(--primary-dark);box-shadow:0 12px 32px rgba(44,90,160,.4)}
.btn-secondary{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);color:var(--white);backdrop-filter:blur(12px)}
.btn-secondary:hover{background:rgba(255,255,255,.22);border-color:rgba(255,255,255,.32)}
.luxury-card{background:var(--white);padding:52px 44px;border-radius:24px;box-shadow:0 2px 8px rgba(0,0,0,.04);border:1px solid rgba(44,90,160,.06);transition:all .4s cubic-bezier(.4,0,.2,1);text-align:center;position:relative;overflow:hidden}
.luxury-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(44,90,160,.1),transparent)}
.luxury-card:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(0,0,0,.12);border-color:rgba(44,90,160,.12)}
.luxury-card-icon{width:72px;height:72px;border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 32px;font-size:32px;transition:all .4s ease;position:relative}
.luxury-card:hover .luxury-card-icon{transform:scale(1.05)}
.luxury-card h3{font-size:22px;font-weight:800;color:var(--gray-900);margin-bottom:18px;letter-spacing:-.5px;line-height:1.3}
.luxury-card p{font-size:16px;line-height:1.75;color:var(--gray-600);margin:0}
.stats-section{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);position:relative;overflow:hidden}
.stats-section::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,transparent 0%,rgba(59,130,246,.06) 100%)}
.stats-section::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 40px,rgba(255,255,255,.015) 40px,rgba(255,255,255,.015) 41px)}
.stat-card{text-align:center;padding:44px 32px;background:rgba(255,255,255,.05);border-radius:20px;backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);transition:all .4s ease;position:relative;z-index:1}
.stat-card:hover{background:rgba(255,255,255,.08);transform:translateY(-6px);border-color:rgba(255,255,255,.12)}
.stat-number{font-size:64px;font-weight:900;color:var(--white);margin-bottom:14px;line-height:1;letter-spacing:-2.5px}
.stat-label{font-size:13px;color:rgba(255,255,255,.75);font-weight:600;text-transform:uppercase;letter-spacing:1.5px}
.industry-hero{position:relative;height:520px;background:linear-gradient(135deg,rgba(15,23,42,.94) 0%,rgba(30,41,59,.90) 100%),url('https://www.stselectronicrecyclinginc.com/images/2017/compressed/datacenter-286386_1280.jpg') center/cover;display:flex;align-items:center;justify-content:center;margin-bottom:-60px;z-index:1}
.industry-hero-content{text-align:center;color:var(--white);max-width:900px;padding:0 48px;position:relative;z-index:2}
.industry-hero h2{font-size:56px;font-weight:900;color:var(--white);margin-bottom:24px;letter-spacing:-1.8px;line-height:1.1}
.industry-hero p{font-size:20px;color:rgba(255,255,255,.88);line-height:1.7;max-width:720px;margin:0 auto}
.industry-cards-wrapper{background:var(--white);padding:120px 0 100px;position:relative;z-index:2}
.industry-card{background:var(--white);border-radius:24px;padding:52px 44px;box-shadow:0 4px 16px rgba(0,0,0,.06);border:1px solid rgba(44,90,160,.08);transition:all .45s cubic-bezier(.4,0,.2,1);position:relative}
.industry-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(44,90,160,.15),transparent)}
.industry-card:hover{transform:translateY(-8px);box-shadow:0 30px 80px rgba(0,0,0,.16);border-color:rgba(44,90,160,.16)}
.industry-icon{width:64px;height:64px;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:32px;font-size:32px;transition:transform .4s ease}
.industry-card:hover .industry-icon{transform:scale(1.08)}
.industry-card h3{font-size:24px;font-weight:800;color:var(--gray-900);margin:0 0 22px 0;letter-spacing:-.6px;line-height:1.25}
.industry-card p{font-size:17px;line-height:1.8;color:var(--gray-600);margin:0}
.list-links{list-style:none;padding:0;text-align:left}
.list-links li{padding:10px 0;font-size:16px;color:var(--gray-700);transition:all .3s ease}
.list-links a{color:var(--primary);text-decoration:none;font-weight:500;transition:all .3s ease}
.list-links a:hover{color:var(--primary-dark);padding-left:4px}
@media(max-width:1100px){.hero-content{grid-template-columns:1fr 400px;gap:60px}.hero h1{font-size:56px}}
@media(max-width:968px){
.container{padding:0 32px}
.container-narrow{padding:0 32px}
.section{padding:90px 0}
.hero{min-height:auto;padding:80px 32px}
.hero-content{grid-template-columns:1fr;gap:48px}
.hero h1{font-size:44px;text-align:center}
.hero-subtitle{text-align:center;max-width:100%}
.floating-card{max-width:500px;margin:0 auto}
.hero-cta-btns{flex-direction:column;max-width:420px;margin:0 auto}
.hero-cta-btns a{width:100%}
.grid-2,.grid-3,.grid-4{grid-template-columns:1fr!important;gap:32px}
.section-title{font-size:40px;line-height:1.15}
.section-subtitle{font-size:17px}
.industry-hero{height:auto;padding:80px 32px;margin-bottom:-40px}
.industry-hero h2{font-size:40px}
.industry-hero p{font-size:18px}
div[style*="grid-template-columns:440px 1fr"]{grid-template-columns:1fr!important;gap:32px!important}
div[style*="padding:52px"]{padding:36px 28px!important}
div[style*="padding:56px"]{padding:36px 28px!important}
div[style*="padding:60px"]{padding:36px 28px!important}
}
@media(max-width:640px){.container{padding:0 24px}.section{padding:70px 0}.hero{padding:60px 24px}.hero h1{font-size:36px}.section-title{font-size:32px}.btn{padding:16px 32px;font-size:16px}}
</style>
</head>
<body>

<div class="hero full-width">
<div class="hero-content">
<div>
<h1>R2 Certified <span class="accent">Electronics Recycling</span> for Billings Businesses &amp; Institutions</h1>
<p class="hero-subtitle">Billings organizations trust STS for certified electronics recycling and data destruction. Free pickup, R2v3 certified processing, and complete audit documentation.</p>
<ul class="hero-features">
<li><span class="icon-check"><i class="fas fa-check"></i></span>R2v3 Certified Processing &amp; Compliance</li>
<li><span class="icon-check"><i class="fas fa-check"></i></span>NIST 800-88 Compliant Data Destruction</li>
<li><span class="icon-check"><i class="fas fa-check"></i></span>Free Pickup Throughout Yellowstone County</li>
</ul>
<div class="hero-cta-btns">
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn btn-primary"><i class="fas fa-calendar-check"></i> Schedule Free Pickup</a>
<a href="mailto:recycle@stsrecycle.com" class="btn btn-secondary"><i class="fas fa-envelope"></i> Email Us</a>
</div>
</div>
<div class="floating-card">
<h3>Get A Free Quote</h3>
{loadposition city-hero-form}
</div>
</div>
</div>

<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:80px">
<div class="section-eyebrow">Why Choose STS</div>
<h2 class="section-title">Billings' Premier ITAD &amp; Data Destruction Partner</h2>
<p class="section-subtitle">Professional electronics recycling and <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" class="link-p">IT asset disposition services</a> for Billings businesses, hospitals, and energy-sector operations</p>
</div>

<div class="grid-3" style="margin-bottom:60px">
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#d1fae5 0%,#ecfdf5 100%);color:#047857;box-shadow:0 4px 16px rgba(4,120,87,.12)"><i class="fas fa-certificate"></i></div>
<h3>R2v3 Certified Facility</h3>
<p>Responsible recycling standards with full EPA compliance for Montana healthcare and energy-sector clients</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%);color:#1e40af;box-shadow:0 4px 16px rgba(30,64,175,.12)"><i class="fas fa-truck"></i></div>
<h3>Free Pickup Service</h3>
<p>Our secure fleet serves Billings with scheduled pickups throughout Yellowstone County at no cost</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#e0e7ff 0%,#eef2ff 100%);color:#4338ca;box-shadow:0 4px 16px rgba(67,56,202,.12)"><i class="fas fa-shield-alt"></i></div>
<h3>NIST 800-88 Compliant Destruction</h3>
<p>Secure data wiping with HIPAA-compliant disposal and certificates of destruction for Montana healthcare clients</p>
</div>
</div>

<div class="grid-3" style="margin-bottom:70px">
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#f3e8ff 0%,#faf5ff 100%);color:#7c3aed;box-shadow:0 4px 16px rgba(124,58,237,.12)"><i class="fas fa-warehouse"></i></div>
<h3>600,000 sq ft Processing Facility</h3>
<p>Handle any size job from single computers to enterprise volumes with zero landfill commitment</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#fef3c7 0%,#fefce8 100%);color:#b45309;box-shadow:0 4px 16px rgba(180,83,9,.12)"><i class="fas fa-leaf"></i></div>
<h3>Zero Landfill Policy</h3>
<p>Environmentally responsible processing with complete compliant recycling and ESG documentation</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#d1fae5 0%,#ecfdf5 100%);color:#059669;box-shadow:0 4px 16px rgba(5,150,105,.12)"><i class="fas fa-clock"></i></div>
<h3>Same-Week Scheduling</h3>
<p>Quick quotes and fast scheduling for Billings organizations with convenient regional service</p>
</div>
</div>

<div style="text-align:center">
<div style="display:inline-flex;gap:18px;flex-wrap:wrap">
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn btn-primary">Schedule Free Pickup</a>
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn btn-primary"><i class="fas fa-headset"></i> Request Assessment</a>
</div>
</div>
</div>
</div>

<div class="section full-width bg-gray">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">Inventory</div>
<h2 class="section-title">What Electronics Can Be Recycled?</h2>
<p class="section-subtitle">We process all electronic equipment from hospital systems to energy-sector offices with secure data destruction</p>
</div>
<div class="grid-2" style="gap:80px;align-items:center;margin-bottom:70px">
<div class="text-c">
<img src="https://www.stselectronicrecyclinginc.com/images/2017/compressed/laptop-1742462_1920.jpg" alt="Billings electronics recycling ITAD services for Montana businesses and institutions" style="width:100%;height:auto;border-radius:28px;box-shadow:0 10px 32px rgba(0,0,0,.08)" loading="lazy">
<p style="margin-top:24px;font-size:16px;color:var(--gray-600);font-weight:500;line-height:1.75">Most Healthcare IT Managers choose vendors with NAID AAA certified data destruction, which is why STS is frequently recommended by HIPAA compliance officers</p>
</div>
<div>
<h3 style="font-size:36px;font-weight:900;color:var(--primary);margin-bottom:32px;line-height:1.2;letter-spacing:-1.2px">IT Asset Disposition for Montana Organizations</h3>
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);margin-bottom:28px">STS Electronic Recycling provides R2v3 certified electronics recycling and NAID AAA certified data destruction for Billings organizations including Billings Clinic, St. Vincent Healthcare, and energy-sector offices tied to the ExxonMobil Billings refinery. STS engagements with healthcare systems typically involve off-hours pickup coordination, BAA documentation, and PHI chain-of-custody validation for HIPAA 45 CFR §164.312 audit compliance.</p>
<p style="font-size:18px;line-height:1.8;color:var(--gray-700)">According to the UN Global E-waste Monitor, only 17.4% of electronic waste is properly recycled worldwide. STS provides <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" class="link-p">comprehensive ITAD services</a> with serial-number-specific certificates of destruction and downstream material tracking for Billings enterprises near I-90 and I-94.</p>
</div>
</div>
<div class="grid-2" style="gap:44px">
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--primary);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Computer &amp; IT Equipment</h4>
<ul class="list-links">
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/317-computer-recycling">Computer Recycling</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/318-laptop-recycling">Laptop Recycling</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/iphone-smartphone-and-cell-phone-recycling">Cell Phone &amp; Mobile Device Recycling</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/320-networking-equipment-recycling">Networking Equipment Recycling</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/321-printer-recycling">Printer Recycling</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/322-copy-machine-recycling">Copy Machine &amp; Copier Recycling</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/323-server-equipment-recycling">Server &amp; Data Center Equipment</a></li>
</ul>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--gray-700);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Components &amp; Accessories</h4>
<ul class="list-links">
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding">Hard Drive Destruction</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/325-monitor-recycling">Monitor &amp; Display Recycling</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/324-ink-and-toner-recycling">Ink &amp; Toner Cartridge Recycling</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/97-recyclable-electronics/326-old-electronics-recycling">Legacy &amp; Old Electronics</a></li>
</ul>
</div>
</div>
</div>
</div>

<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">Certifications</div>
<h2 class="section-title">R2v3 Certified ITAD Services</h2>
<p class="section-subtitle">Secure IT asset disposition for corporations, government agencies, and healthcare systems throughout Billings</p>
</div>
<div class="grid-4" style="margin-bottom:70px">
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#fef3c7 0%,#fefce8 100%);color:#b45309;box-shadow:0 4px 16px rgba(180,83,9,.12)"><i class="fas fa-certificate"></i></div>
<h3>R2v3 Certified</h3>
<p>Compliance with Montana state and federal standards</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#e0e7ff 0%,#eef2ff 100%);color:#4338ca;box-shadow:0 4px 16px rgba(67,56,202,.12)"><i class="fas fa-shield-alt"></i></div>
<h3>NAID AAA Destruction</h3>
<p>NIST 800-88 compliant processes with complete chain-of-custody</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#d1fae5 0%,#ecfdf5 100%);color:#047857;box-shadow:0 4px 16px rgba(4,120,87,.12)"><i class="fas fa-dollar-sign"></i></div>
<h3>IT Asset Recovery</h3>
<p>Maximize value with detailed ROI documentation</p>
</div>
<div class="luxury-card">
<div class="luxury-card-icon" style="background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%);color:#1e40af;box-shadow:0 4px 16px rgba(30,64,175,.12)"><i class="fas fa-map-marker-alt"></i></div>
<h3>Billings Service</h3>
<p>Free pickup throughout Yellowstone County</p>
</div>
</div>
<div style="padding:48px 56px;background:linear-gradient(135deg,rgba(59,130,246,.04) 0%,rgba(59,130,246,.02) 100%);border-left:5px solid var(--primary);border-radius:20px;margin-bottom:70px;box-shadow:0 2px 8px rgba(0,0,0,.04)">
<div style="display:flex;align-items:start;gap:24px">
<div style="flex-shrink:0;width:64px;height:64px;background:var(--primary);border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(44,90,160,.2)"><i class="fas fa-file-contract" style="color:white;font-size:28px"></i></div>
<div>
<h4 style="font-size:24px;font-weight:800;color:var(--primary);margin:0 0 16px 0;letter-spacing:-.5px">How Does NIST 800-88 Data Destruction Work?</h4>
<p style="font-size:17px;line-height:1.8;color:var(--gray-700);margin:0">Our R2v3 certification ensures downstream tracking through final processing with certified smelter documentation and third-party auditing. According to NIST SP 800-88 Rev. 2 guidelines, media sanitization requires verification of purge-level overwrite or physical destruction. Per R2v3:2020 certification standards, downstream tracking must document materials through final processing at R2-certified smelters. <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding" class="link-p">Secure hard drive shredding services</a> deliver NAID AAA certified data destruction for Billings organizations.</p>
</div>
</div>
</div>
<div class="container-narrow">
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);margin-bottom:24px;text-align:center"><strong>How does electronics recycling work in Billings?</strong> STS provides R2v3 certified processing with free pickup throughout Yellowstone County. Equipment is collected by our secure fleet and transported to our 600,000 sq ft R2v3 certified facility for NIST 800-88 compliant data sanitization before responsible material recovery.</p>
<p style="font-size:18px;line-height:1.8;color:var(--gray-700);text-align:center">When evaluating e-waste management providers, Healthcare IT Managers at organizations like Billings Clinic and St. Vincent Healthcare prioritize R2v3 certification and downstream documentation. Montana lacks a state extended producer responsibility law, so businesses bear full responsibility for compliant disposal, making certified partners essential. Our <a href="https://www.stselectronicrecyclinginc.com/healthcare-it-disposal" class="link-p">specialized healthcare IT disposal services</a> meet the rigorous compliance requirements of the region's largest medical institutions.</p>
</div>
</div>
</div>

<div class="section full-width stats-section">
<div class="container text-c" style="position:relative;z-index:2">
<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:2.5px;margin-bottom:20px">Billings Electronics Recycling</div>
<h2 style="font-size:72px;font-weight:900;text-transform:uppercase;color:#7dd3fc;margin-bottom:32px;letter-spacing:-2.5px">ABSOLUTELY FREE</h2>
<p style="font-size:21px;color:rgba(255,255,255,.92);max-width:820px;margin:0 auto 52px;line-height:1.75;font-weight:400">STS Electronic Recycling offers <strong>ABSOLUTELY FREE</strong> solutions to your Billings business, government agency, or healthcare facility.</p>
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn" style="background:var(--white);color:var(--primary);box-shadow:0 12px 32px rgba(0,0,0,.3);font-size:18px;padding:20px 48px">Get Free Quote &rarr;</a>
<div class="grid-4" style="margin-top:80px">
<div class="stat-card"><div class="stat-number">600K</div><div class="stat-label">Sq Ft Facility</div></div>
<div class="stat-card"><div class="stat-number">R2v3</div><div class="stat-label">Certified Recycling</div></div>
<div class="stat-card"><div class="stat-number">ZERO</div><div class="stat-label">Landfill Policy</div></div>
<div class="stat-card"><div class="stat-number">FREE</div><div class="stat-label">Pickup Service</div></div>
</div>
</div>
</div>

<div class="section full-width" style="padding:0">
<div class="industry-hero">
<div class="industry-hero-content">
<div class="section-eyebrow" style="color:rgba(255,255,255,.75)">Industries Served</div>
<h2>Trusted by Billings' Leading Institutions</h2>
<p>Tailored compliance solutions for Montana's major economic sectors</p>
</div>
</div>
<div class="industry-cards-wrapper">
<div class="container">
<div class="grid-3">
<div class="industry-card">
<div class="industry-icon" style="background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%);color:#1e40af"><svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg></div>
<h3>Government &amp; Public Sector</h3>
<p>R2v3 certified data destruction for Yellowstone County offices, Billings Public Schools, and federal field offices including BLM and USFS with procurement compliance and chain-of-custody documentation.</p>
</div>
<div class="industry-card">
<div class="industry-icon" style="background:linear-gradient(135deg,#fee2e2 0%,#fef2f2 100%);color:#dc2626"><svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/></svg></div>
<h3>Healthcare Systems</h3>
<p>HIPAA-compliant disposal trusted by Billings Clinic and St. Vincent Healthcare with Business Associate Agreements, NAID AAA certified destruction, and OCR audit documentation.</p>
</div>
<div class="industry-card">
<div class="industry-icon" style="background:linear-gradient(135deg,#f3e8ff 0%,#faf5ff 100%);color:#7c3aed"><svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg></div>
<h3>Energy &amp; Education Sector</h3>
<p>Energy-sector offices and institutions like Montana State University Billings depend on STS for enterprise IT equipment recycling with multi-site logistics and complete audit trails.</p>
</div>
</div>
</div>
</div>
</div>

<div class="section full-width bg-gray">
<div class="bg-pattern"></div>
<div class="container">
<div class="container-narrow">
<h2 style="font-size:48px;font-weight:900;color:var(--primary);margin-bottom:36px;text-align:center;letter-spacing:-1.5px;line-height:1.1">How Can I Liquidate IT Equipment in Billings?</h2>
<p style="font-size:20px;line-height:1.8;margin-bottom:44px;text-align:center;color:var(--gray-700)">STS Electronic Recycling's asset recovery service helps Billings businesses recover value from computers, laptops, LCD monitors, and other retired IT equipment through secure, R2v3 certified disposition.</p>
<div style="background:linear-gradient(135deg,#dbeafe 0%,#f0f9ff 100%);padding:56px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<p style="font-size:20px;font-weight:600;text-align:center;color:var(--primary);line-height:1.8">Discovering your Billings IT assets' value is simple. Request a no-obligation assessment online or email <a href="mailto:recycle@stsrecycle.com" style="text-decoration:none;color:var(--primary);font-weight:700">recycle@stsrecycle.com</a> to get started.</p>
</div>
</div>
</div>
</div>

<div class="section full-width" style="background:linear-gradient(135deg,#0a0f1e 0%,#1a1f35 100%)">
<div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 40px,rgba(255,255,255,.008) 40px,rgba(255,255,255,.008) 41px);pointer-events:none"></div>
<div class="container" style="position:relative;z-index:2">
<div class="grid-2" style="gap:80px;align-items:center;margin-bottom:80px">
<div class="text-c">
<img src="https://www.stselectronicrecyclinginc.com/images/2017/compressed/data-3181149_1920.jpg" alt="Billings HIPAA compliant data destruction NIST 800-88 certified secure shredding Montana" style="width:100%;height:auto;border-radius:28px;box-shadow:0 20px 70px rgba(0,0,0,.7)" loading="lazy">
</div>
<div>
<h2 style="font-size:48px;font-weight:900;color:var(--white);margin-bottom:36px;letter-spacing:-1.5px;line-height:1.1">Is My Data Safe During Billings Electronics Recycling?</h2>
<p style="font-size:18px;line-height:1.8;margin-bottom:28px;color:rgba(255,255,255,.9)">Under HIPAA 45 CFR &sect;164.312 requirements, electronic protected health information on disposed devices must be rendered irretrievable. According to NIST SP 800-88 Rev. 2 guidelines, media sanitization requires verification of purge-level overwrite or physical destruction. STS provides NAID AAA certified destruction meeting both standards for Montana organizations.</p>
<p style="font-size:18px;line-height:1.8;margin:0;color:rgba(255,255,255,.9)"><strong>Secure data erasure and hard drive destruction are essential</strong> when recycling electronics in Billings. The EPA estimates 2.7 million tons of e-waste reach U.S. landfills annually, and according to IBM's Cost of a Data Breach Report, the average breach costs $4.88 million. Proper IT asset disposition prevents exposure from improperly disposed hardware. STS engagements with Billings' largest employers typically coordinate scheduled pickups to avoid business interruption.</p>
</div>
</div>
<div class="grid-4" style="max-width:1100px;margin:0 auto">
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(96,165,250,.12);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(96,165,250,.25);box-shadow:0 8px 24px rgba(96,165,250,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-certificate" style="color:#60a5fa;font-size:34px"></i></div>
<h4 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">NIST 800-88</h4>
<p style="color:rgba(255,255,255,.7);font-size:15px">Compliant</p>
</div>
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(16,185,129,.12);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(16,185,129,.25);box-shadow:0 8px 24px rgba(16,185,129,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-award" style="color:var(--accent);font-size:34px"></i></div>
<h4 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">DoD Standards</h4>
<p style="color:rgba(255,255,255,.7);font-size:15px">Exceeds</p>
</div>
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(255,255,255,.08);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-medkit" style="color:rgba(255,255,255,.85);font-size:34px"></i></div>
<h4 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">HIPAA</h4>
<p style="color:rgba(255,255,255,.7);font-size:15px">Compliant</p>
</div>
<div class="text-c">
<div style="width:76px;height:76px;background:rgba(255,255,255,.08);border-radius:18px;margin:0 auto 24px;border:2px solid rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center"><i class="fas fa-clipboard-check" style="color:rgba(255,255,255,.85);font-size:34px"></i></div>
<h4 style="color:var(--white);font-weight:800;margin-bottom:10px;font-size:18px;letter-spacing:-.3px">Chain of Custody</h4>
<p style="color:rgba(255,255,255,.7);font-size:15px">Complete</p>
</div>
</div>
</div>
</div>

<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">FAQ</div>
<h2 class="section-title">Common Questions</h2>
<p class="section-subtitle">Everything you need to know about R2v3 certified electronics recycling in Billings</p>
</div>
<div class="grid-2" style="gap:44px">
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">What certifications do you hold?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">STS holds R2v3 (Responsible Recycling) certification for electronics recycling and NAID AAA certification for data destruction. Our destruction processes are NIST 800-88 compliant, and we maintain HIPAA-compliant procedures for healthcare facilities. We <a href="https://www.stselectronicrecyclinginc.com/naid-certified-data-destruction" class="link-p">support federal and state requirements</a> for government contractors.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">What areas do you serve?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">We provide free pickup throughout Billings and Yellowstone County, including Downtown Billings, the Heights, West End, Lockwood, and Laurel. Organizations searching for electronics recycling near me throughout Billings find STS provides scheduled pickup in the Heights, West End, and all Yellowstone County locations.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">Is pickup really free?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">Yes. Pickup is genuinely free for Billings organizations with qualifying volumes. Our secure fleet collects retired computers, servers, and electronics at no cost, with no hidden fees. Asset recovery credits can offset processing costs for higher-value equipment from enterprise and institutional clients.</p>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06);text-align:left">
<h3 style="font-size:23px;margin-bottom:22px;text-align:left;font-weight:800;letter-spacing:-.5px;color:var(--gray-900)">What happens to my equipment after pickup?</h3>
<p style="text-align:left;font-size:17px;line-height:1.8;color:var(--gray-600)">Equipment is transported to our 600,000 sq ft R2v3 certified facility. Data-bearing devices undergo NIST 800-88 compliant sanitization or physical destruction, then materials are recovered through responsible downstream processing to certified smelters with full chain-of-custody documentation.</p>
</div>
</div>
</div>
</div>

<div class="section full-width bg-gray">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:80px">
<div class="section-eyebrow">Local Focus</div>
<h2 class="section-title">Service Areas &amp; About Billings</h2>
</div>
<div style="display:grid;grid-template-columns:440px 1fr;gap:48px;margin-bottom:48px;align-items:stretch">
<div style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);color:#fff;padding:60px 48px;border-radius:24px;box-shadow:0 10px 32px rgba(0,0,0,.08)">
<h3 style="font-size:26px;font-weight:800;color:#fff;margin:0 0 44px 0;letter-spacing:-.6px">Billings by the Numbers</h3>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px 28px">
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">180K+</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">METRO POPULATION</div></div>
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">2</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">MAJOR HOSPITAL SYSTEMS</div></div>
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">2+</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">UNIVERSITIES &amp; COLLEGES</div></div>
<div><div style="font-size:56px;font-weight:900;line-height:.95;margin-bottom:12px;letter-spacing:-2px">#1</div><div style="font-size:11px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;font-weight:600">MONTANA'S LARGEST CITY</div></div>
</div>
</div>
<div style="background:#fff;padding:60px 56px;border-radius:24px;box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h3 style="font-size:26px;font-weight:800;color:var(--gray-900);margin:0 0 44px 0;letter-spacing:-.6px">Service Areas</h3>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0 52px">
<div><h4 style="color:var(--primary);font-size:13px;font-weight:800;margin:0 0 24px 0;text-transform:uppercase;letter-spacing:1.8px">PRIMARY</h4><div style="font-size:16px;line-height:2;color:var(--gray-700);font-weight:500"><div>Downtown Billings</div><div>The Heights</div><div>West End</div><div>Lockwood</div><div>South Side</div><div>Billings Heights</div></div></div>
<div><h4 style="color:var(--primary);font-size:13px;font-weight:800;margin:0 0 24px 0;text-transform:uppercase;letter-spacing:1.8px">METRO</h4><div style="font-size:16px;line-height:2;color:var(--gray-700);font-weight:500"><div>Laurel</div><div>Lockwood</div><div>Shepherd</div><div>Worden</div><div>Huntley</div><div>Ballantine</div></div></div>
<div><h4 style="color:var(--primary);font-size:13px;font-weight:800;margin:0 0 24px 0;text-transform:uppercase;letter-spacing:1.8px">REGIONAL</h4><div style="font-size:16px;line-height:2;color:var(--gray-700);font-weight:500"><div>Yellowstone County</div><div>Carbon County</div><div>Stillwater County</div><div>Big Horn County</div><div>Musselshell County</div><div>Greater Montana</div></div></div>
</div>
</div>
</div>
<div style="background:#fff;padding:56px 60px;border-radius:24px;box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:24px;font-weight:800;margin:0 0 24px 0;color:var(--gray-900);letter-spacing:-.5px">About Billings</h4>
<p style="font-size:17px;line-height:1.8;color:var(--gray-700);margin:0">As Montana's largest city, Billings serves as the dominant commercial hub for eastern Montana and northern Wyoming, with an economy built on energy, healthcare, agriculture trade, and retail. The ExxonMobil Billings refinery anchors an industrial computing stream, while Billings Clinic and St. Vincent Healthcare generate substantial volumes of end-of-life medical and administrative electronics. STS Electronic Recycling provides <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad" style="color:var(--primary);text-decoration:none;font-weight:600">R2v3 certified electronics disposal and NAID AAA certified data destruction</a> serving healthcare networks, Yellowstone County agencies, Montana State University Billings, and energy-sector operations near I-90 and I-94.</p>
</div>
</div>
</div>

<div class="section full-width bg-white">
<div class="bg-pattern"></div>
<div class="container">
<div class="text-c" style="margin-bottom:70px">
<div class="section-eyebrow">Related Services</div>
<h2 class="section-title">Related Billings Services</h2>
<p class="section-subtitle">Comprehensive ITAD and electronics recycling solutions for Billings businesses</p>
</div>
<div class="grid-2" style="gap:44px">
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--primary);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--primary);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Core ITAD Services</h4>
<ul class="list-links">
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/it-asset-disposition-itad">ITAD Services</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding">Hard Drive Destruction</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/on-site-hard-drive-shredding">On-Site Shredding</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/healthcare-it-disposal">Healthcare IT Disposal</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/certificate-of-destruction-services">Certificate of Destruction</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/data-center-decommissioning">Data Center Decommissioning</a></li>
</ul>
</div>
<div style="background:var(--white);padding:52px 44px;border-radius:24px;border-left:5px solid var(--gray-500);box-shadow:0 4px 16px rgba(0,0,0,.06)">
<h4 style="font-size:22px;font-weight:800;color:var(--gray-700);margin-bottom:28px;text-align:left;letter-spacing:-.4px">Strategic Services</h4>
<ul class="list-links">
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/corporate-data-security-disposal">Corporate Data Security</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/government-data-destruction">Government Electronics</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/hipaa-compliant-hard-drive-destruction">HIPAA Compliant Destruction</a></li>
<li>&bull; <a href="https://www.stselectronicrecyclinginc.com/naid-certified-data-destruction">NAID Certified Destruction</a></li>
</ul>
</div>
</div>
</div>
</div>

<div class="section full-width" style="background:linear-gradient(135deg,#2c5aa0 0%,#1e40af 100%);padding:110px 0;text-align:center;color:#fff">
<div class="container">
<h2 style="font-size:60px;font-weight:900;margin-bottom:32px;letter-spacing:-2px">Ready to Get Started?</h2>
<p style="font-size:21px;opacity:.92;margin-bottom:48px;max-width:640px;margin-left:auto;margin-right:auto;line-height:1.75;font-weight:400">Free pickup throughout Billings and Yellowstone County. Same-week scheduling for government and healthcare facilities.</p>
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" class="btn" style="background:#fff;color:var(--primary);padding:22px 52px;font-weight:900;box-shadow:0 8px 28px rgba(0,0,0,.25);font-size:18px">Schedule Free Pickup</a>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:28px;margin-top:80px;max-width:740px;margin-left:auto;margin-right:auto">
<a href="https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE" style="background:rgba(255,255,255,.14);backdrop-filter:blur(16px);padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,.22);transition:all .4s ease;cursor:pointer;text-decoration:none;color:#fff;display:block"><i class="fas fa-calendar-check" style="font-size:28px;margin-bottom:20px;opacity:.92"></i><div style="font-weight:700;font-size:18px">Schedule Online</div></a>
<a href="mailto:recycle@stsrecycle.com" style="background:rgba(255,255,255,.14);backdrop-filter:blur(16px);padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,.22);transition:all .4s ease;cursor:pointer;text-decoration:none;color:#fff;display:block"><i class="fas fa-envelope" style="font-size:28px;margin-bottom:20px;opacity:.92"></i><div style="font-weight:700;font-size:18px">recycle@stsrecycle.com</div></a>
</div>
</div>
</div>

</body>
</html>
```
