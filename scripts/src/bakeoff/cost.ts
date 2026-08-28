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
  type PromptGmb,
} from "./miniPrompts.js";
import type { DesignFixtures } from "./fixtures.js";
import type { PhaseTiming, TokenUsage } from "./types.js";

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
  {
    test: /gemini-3\.[5-9]-?flash|gemini-3\.[5-9]\.\d+-?flash/i,
    label: "Gemini 3.7 Flash tier (introductory, through Dec 2026)",
    inputPerM: 0.75,
    outputPerM: 3.75,
  },
  { test: /gemini/i, label: "Gemini 3.1 Pro tier", inputPerM: 2, outputPerM: 12 },
  { test: /grok/i, label: "Grok 4.3 tier", inputPerM: 1.25, outputPerM: 2.5 },
  // DeepSeek's own published rates (api-docs.deepseek.com/quick_start/pricing),
  // off-peak / cache-miss input rate — the harness re-sends full history every
  // turn with no cache-hit tracking, so cache-miss is the honest default. The
  // v4-pro row MUST precede the v4-flash row's broader match.
  { test: /deepseek-v4-pro/i, label: "DeepSeek v4 Pro tier (off-peak)", inputPerM: 0.66, outputPerM: 1.98 },
  { test: /deepseek/i, label: "DeepSeek v4 Flash tier (off-peak)", inputPerM: 0.22, outputPerM: 0.66 },
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

/** Cached input is billed at ~10% of the standard input rate across the major
 * providers, so the discount factor is uniform (kept apples-to-apples). */
const CACHED_INPUT_DISCOUNT = 0.1;

/**
 * MEASURED cost from real, provider-reported token usage (summed across turns).
 * Unlike {@link estimateCost} (which reconstructs tokens from prompt characters)
 * this uses the exact counts the providers returned, bills the cached-input
 * subset at a discount, and folds hidden reasoning tokens into output (they are
 * already part of `outputTokens`). Prefer this whenever usage was captured.
 *
 * NOTE: provider-side web-search fees on the SEO-verify turn are billed
 * separately by each provider and are NOT represented in token usage, so they
 * are excluded here (same exclusion as the estimate).
 */
export function costFromUsage(modelTag: string, usage: TokenUsage): CostEstimate {
  const tier = priceFor(modelTag);
  const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
  const cached = Math.min(Math.max(0, usage.cachedInputTokens), usage.inputTokens);
  const uncachedInput = usage.inputTokens - cached;
  const inputUsd =
    (uncachedInput / 1_000_000) * tier.inputPerM +
    (cached / 1_000_000) * tier.inputPerM * CACHED_INPUT_DISCOUNT;
  const outputUsd = (usage.outputTokens / 1_000_000) * tier.outputPerM;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    inputUsd: round4(inputUsd),
    outputUsd: round4(outputUsd),
    totalUsd: round4(inputUsd + outputUsd),
    pricePerMInput: tier.inputPerM,
    pricePerMOutput: tier.outputPerM,
    basis:
      `Measured — real token usage reported by the provider, summed across all turns: ` +
      `${usage.inputTokens.toLocaleString()} input token(s) (${cached.toLocaleString()} served from ` +
      `prompt cache, billed at ${Math.round(CACHED_INPUT_DISCOUNT * 100)}% of the input rate) and ` +
      `${usage.outputTokens.toLocaleString()} output token(s)` +
      (usage.reasoningTokens > 0
        ? ` (incl. ${usage.reasoningTokens.toLocaleString()} hidden reasoning token(s))`
        : "") +
      `, priced at ${tier.label} list rates ($${tier.inputPerM}/$${tier.outputPerM} per 1M in/out). ` +
      `Provider-side web-search fees on the SEO-verify turn are billed separately and are excluded.`,
  };
}

/** The PromptVars the conversation derives for a given target context. Mirrors
 * `promptVars` in conversation.ts (kept in lockstep with it). `pageUrl` (verbatim
 * target URL) and `gmb` (verified NAP / GMB-aware branches) must match what the
 * conversation actually sent so the token estimate stays honest. */
function promptVars(ctx: RunContext, pageUrl?: string, gmb?: PromptGmb | null): PromptVars {
  return {
    city: ctx.city,
    state: ctx.state,
    url:
      pageUrl && pageUrl.trim()
        ? pageUrl.trim()
        : `${ctx.registry.baseDomain.replace(/\/$/, "")}/${ctx.city
            .toLowerCase()
            .replace(/\s+/g, "-")}-${ctx.state.toLowerCase()}`,
    niche: ctx.niche,
    pageName: `${ctx.city} ${ctx.niche}`,
    hubSpoke: ctx.existingUrls.length ? ctx.existingUrls.join("\n") : "",
    gmb: gmb ?? null,
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
  pageUrl?: string,
  gmb?: PromptGmb | null,
): string {
  const vars = promptVars(ctx, pageUrl, gmb);
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
  pageUrl?: string,
  gmb?: PromptGmb | null,
): number {
  const vars = promptVars(ctx, pageUrl, gmb);
  if (phase === "intro")
    return introUserText(ctx, fixtures, grounding, introEnrichment, pageUrl, gmb).length;
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
  if (phase === "verify-links")
    return (verifyLinksPrompt(vars) + ARTIFACT_TO_INLINE_OPTIONAL).length;
  if (phase.startsWith("verify-links-fix"))
    return (verifyLinksFixPrompt(vars) + ARTIFACT_TO_INLINE_OPTIONAL).length;
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
  /** The page's target URL (used verbatim) — must match what the conversation
   * actually sent, so the token estimate stays honest. Optional: falls back to
   * the derived city/state slug. */
  pageUrl?: string;
  /** The verified GMB NAP block for the GMB scenario (null for No-GMB), so the
   * estimate reflects the GMB-aware prompt branches. */
  gmb?: PromptGmb | null;
}

/**
 * Estimate the USD cost of one model's run by replaying its recorded turn
 * sequence: the conversation carries FULL history, so each API call re-bills all
 * prior messages plus the new user turn. Pure + deterministic given its inputs.
 */
export function estimateCost(args: EstimateCostArgs): CostEstimate {
  const { modelTag, timings, htmlChars, ctx, fixtures, grounding, introEnrichment, pageUrl, gmb } =
    args;
  const tier = priceFor(modelTag);

  let historyChars = 0;
  let billedInputChars = 0;
  let outputChars = 0;

  for (const t of timings) {
    const userChars = userCharsForPhase(
      t.phase,
      ctx,
      fixtures,
      grounding,
      introEnrichment,
      pageUrl,
      gmb,
    );
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
