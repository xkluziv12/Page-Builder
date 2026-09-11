# Scope

You are scoped to `scripts/src/precision-adapter/` only. Do not edit any file
outside this directory. Do not touch `scripts/src/bakeoff/**` (the STS
pipeline) — it must keep working exactly as it does today, byte for byte.

You MAY read (read-only, never write):
- `docs/precision-ecycle-page-factory-output-contract.md` (the output contract)
- `scripts/src/bakeoff/providers.ts` (existing provider adapters — Claude/OpenAI/Gemini/Grok
  completion pattern; reuse this shape, do not reinvent provider clients)
- `scripts/src/bakeoff/types.ts`

# Goal (this pass only — do not build more than this)

Prove ONE thing: that a model, given a Precision E-Cycle prompt pack, can
produce a single JSON object conforming to the `CityData` contract that
passes deterministic validation — WITHOUT emitting any HTML/JSX. This is a
target-adapter proof of concept, not the full runner extraction. Do not wire
this into the existing bake-off CLI, do not build routing/backup-model
failover, do not attempt to write into the actual precision-ecycle-platform
repo. Keep this self-contained and runnable with one command.

## Build these files only, inside this directory:

1. `prompt-pack/fact-layer.json` — Precision E-Cycle's canonical business
   facts from section 4 of the contract doc (company, phone, address, hours,
   confirmed service metros, services, held certifications). Zod-validated
   shape (define the schema in `prompt-pack/factLayer.schema.ts`).

2. `prompt-pack/gate.config.json` — the hard count contracts (section 2), the
   editorial rules (section 3), and the credential phrasing tiers table
   (section 3) as structured, machine-checkable data (not prose).

3. `cityDataSchema.ts` — a Zod schema mirroring the verbatim `CityData`
   TypeScript interface in section 1 of the contract doc, field for field.

4. `validate.ts` — deterministic validation, in code, no LLM calls:
   - Zod-parses the candidate JSON against `cityDataSchema`.
   - Enforces every hard count from `gate.config.json` (exactly 8 faqs, 4
     industries, 4 processSteps, 3 expandedSections, 3 complianceParagraphs,
     >=1500 visible words, seoTitle <=70 chars, seoDescription 140-160 chars).
   - Enforces editorial rules: no em/en dashes, no emoji, no sentence over 35
     words, no prices/dollar amounts, no operational thresholds/timeframes.
   - Enforces credential phrasing: scan all string fields for any of the
     "Never" phrasings in the tier table (e.g. "R2 certified", "NAID AAA",
     "e-Stewards", "NIST certified") and reject if found.
   - If `availabilityConfirmationRequired: true`, reject planning-market
     banned phrases (e.g. "our <city> facility", "<city> location", "service
     area") per section 3.
   - Returns `{ ok: true }` or `{ ok: false, errors: string[] }` — never
     throws for a normal validation failure, only for a malformed/missing
     input.

5. `buildRecord.ts` — calls ONE model (reuse the Claude adapter pattern from
   `scripts/src/bakeoff/providers.ts`, using `ANTHROPIC_API_KEY` /
   `CLAUDE_CODE_OAUTH_TOKEN` — check which is actually set and use that one;
   fail loud if neither is set, do not silently fall back) with a single
   prompt built from `fact-layer.json` + `gate.config.json` + the exact
   `CityData` field list, asking for ONE new city's planning-market record
   (pick a city that is NOT St. Louis and NOT one of the 7 confirmed metros —
   e.g. Milwaukee, WI). Parse the model's JSON response, run it through
   `validate.ts`. If validation fails, feed the errors back to the model in a
   second turn and ask it to fix ONLY the failing fields, then re-validate.
   Allow up to 3 repair turns before giving up and reporting the final error
   list. Fail loud (throw) on API errors — no bare catch, no silent fallback.

6. `run.ts` — a CLI entry point (`tsx run.ts`) that runs `buildRecord.ts` end
   to end and prints: the final validation result, the number of repair turns
   used, and (on success) the full JSON record.

7. `README.md` — 10-15 lines: what this proves, how to run it
   (`npx tsx scripts/src/precision-adapter/run.ts` from repo root), and what
   it deliberately does NOT do yet (no routing/failover, no repo write-back,
   not wired into the bake-off CLI).

# Rules

- No bare `catch` anywhere. Every catch must log what it caught and rethrow
  or return a structured error — never swallow into a generic message.
- No Replit-managed LLM integration or connector. Use the user's own API key
  from the environment exactly as `scripts/src/bakeoff/providers.ts` already
  does.
- Keep total new code minimal and readable. This is a proof of concept for
  one target-adapter question, not a framework.
- When done, run `npx tsx scripts/src/precision-adapter/run.ts` yourself and
  paste the actual output (pass or fail with reasons) into your final report.
  Do not report success without having actually run it.
