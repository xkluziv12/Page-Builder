import { describeContext, type RunContext, type Provenance } from "@workspace/mc-core";
import type { ChatMessage, CompleteFn } from "./providers.js";
import type { TokenUsage } from "./types.js";
import type { DesignFixtures } from "./fixtures.js";
import { extractHtmlDocument, extractSchemaJson, tryExtractHtmlDocument } from "./extract.js";
import { evaluateDesignGate } from "./designGate.js";
import {
  ARTIFACT_TO_INLINE,
  ARTIFACT_TO_INLINE_OPTIONAL,
  INTRO_NEUTRALIZE,
  SCHEMA_TO_INLINE,
  buildPrompt,
  introPrompt,
  rebuildPrompt,
  seoPrompt,
  seoVerifyFixPrompt,
  seoVerifyPrompt,
  verifyLinksFixPrompt,
  verifyLinksPrompt,
  type PromptGmb,
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
  /**
   * The page's target URL, used VERBATIM for the build/seo/schema prompts. The
   * GMB scenario passes the GMB `pageUrl`; the No-GMB scenario passes the target
   * URL. Optional: when absent the URL falls back to the derived city/state slug.
   */
  pageUrl?: string;
  /**
   * The verified GMB NAP block (per-scenario, NOT per-model) that switches the
   * build/seo/verify prompts to their GMB-aware branches. Null for the faithful
   * No-GMB path (prompts stay byte-identical).
   */
  gmb?: PromptGmb | null;
  /** Max design-gate rebuild attempts before failing loudly. */
  rebuildCap?: number;
  /**
   * Optional mutable sink for the full per-turn transcript. When provided, every
   * turn (successful OR the one that threw) is pushed here as it happens, so the
   * caller keeps a partial transcript even when the conversation fails loud
   * mid-run. Purely observational — it never changes what is sent to the model.
   */
  transcript?: TranscriptEntry[];
}

/**
 * One turn of the raw conversation, captured for after-the-fact inspection: the
 * exact user prompt sent, the model's raw reply, the wall time, any parsed
 * verdict, the real token usage, and — for the turn that failed — the error.
 */
export interface TranscriptEntry {
  phase: string;
  summary: string;
  webSearch: boolean;
  /** The full user prompt sent on this turn (this turn's new message only). */
  user: string;
  /** The model's raw reply, or "" when the turn threw before replying. */
  assistant: string;
  ms: number;
  verdict?: "passed" | "failed" | null;
  usage: TokenUsage | null;
  /** Set to the error message when THIS turn threw; null otherwise. */
  error: string | null;
  /** Accepted attribution for this turn (direct-api provider/model/transport). Absent on turns that threw before returning. */
  provenance?: Provenance;
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

/**
 * Build the prompt variables for a model's conversation. `pageUrl`, when a
 * non-empty string, is used VERBATIM as the page's target URL (the dead-simple
 * "give me a URL" input); otherwise the URL falls back to the derived
 * `${baseDomain}/${city}-${state}` slug (the faithful No-GMB default). `gmb`,
 * when supplied, switches the build/seo/verify prompts to their GMB-aware
 * branches. This function is intentionally DUPLICATED in `cost.ts` as a private
 * mirror — keep the two in lockstep.
 */
export function promptVars(
  ctx: RunContext,
  pageUrl?: string,
  gmb?: PromptGmb | null,
): PromptVars {
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
    url:
      pageUrl && pageUrl.trim()
        ? pageUrl.trim()
        : `${ctx.registry.baseDomain.replace(/\/$/, "")}/${ctx.city.toLowerCase().replace(/\s+/g, "-")}-${ctx.state.toLowerCase()}`,
    niche: ctx.niche,
    pageName: `${ctx.city} ${ctx.niche}`,
    hubSpoke,
    gmb: gmb ?? null,
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
/** Regex for a wrong-model STOP or explicit refusal to proceed/build. Shared so
 * the routed pipeline's phase validators detect the same refusals uniformly. */
export const REFUSAL_RE =
  /🚫|wrong model|cannot proceed|can'?t proceed|unable to proceed|(will not|won'?t) (proceed|build|continue|create)|cannot continue|can'?t continue|i (cannot|can'?t) build|refuse to (proceed|build|continue)/i;

/**
 * Throw if `raw` is empty/whitespace or contains a STOP/refusal. Shared by the
 * intro handshake and the routed phase validators so an empty or refusing main
 * model is treated as invalid output (→ backup takes over / fail loud) uniformly
 * across every model — never special-cased.
 */
export function assertNotRefusal(raw: string, where: string): void {
  if (!raw || !raw.trim()) {
    throw new Error(`${where}: model returned empty output.`);
  }
  if (REFUSAL_RE.test(raw)) {
    throw new Error(
      `${where} hit a STOP / refusal — run cannot proceed. First 200 chars: ${raw
        .slice(0, 200)
        .replace(/\s+/g, " ")}`,
    );
  }
}

function assertIntroNotBlocked(raw: string): void {
  assertNotRefusal(raw, "Intro handshake");
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
  const vars = promptVars(ctx, deps.pageUrl, deps.gmb);
  const files = [
    fileBlock("STS SEO Data 2026", deps.fixtures.seoData),
    fileBlock("Master Page Builder", deps.fixtures.pageBuilder),
    fileBlock("Master Design (Tier 2)", deps.fixtures.designTier2),
  ].join("\n");
  const grounding = `${RULE}\n📄 LOCAL MARKET RESEARCH (shared brief)\n${RULE}\n${deps.grounding.trim()}\n`;
  const context = `${RULE}\nBUILD CONTEXT (registry facts)\n${RULE}\n${describeContext(ctx)}\n`;
  const enrichment = deps.introEnrichment.trim() ? `\n${deps.introEnrichment.trim()}\n` : "";
  return [introPrompt(vars), INTRO_NEUTRALIZE, files, grounding, context, enrichment]
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
  const vars = promptVars(ctx, deps.pageUrl, deps.gmb);
  const cap = Math.max(1, deps.rebuildCap ?? Number(process.env.BAKEOFF_REBUILD_CAP ?? 2));

  const transcript = deps.transcript;
  const messages: ChatMessage[] = [];
  const turns: ConversationTurn[] = [];
  let totalMs = 0;

  /** Set the ✅/❌ verdict on the latest turn AND its transcript entry (kept in
   * lockstep — both arrays gain their newest element on the same `send`). */
  const setLastVerdict = (verdict: "passed" | "failed" | null): void => {
    if (turns.length) turns[turns.length - 1].verdict = verdict;
    if (transcript?.length) transcript[transcript.length - 1].verdict = verdict;
  };

  /** Send one user turn, append both sides to history, time it. The optional
   * `webSearch` switches on the provider's native web-search tool for THIS turn
   * only (used by the SEO-verify turn, whose prompt mandates a live web search).
   * Every turn is also recorded into the optional transcript sink — including the
   * turn that throws, so a failed run stays inspectable. */
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
    const entry: TranscriptEntry = {
      phase,
      summary,
      webSearch,
      user,
      assistant: "",
      ms: 0,
      verdict: null,
      usage: null,
      error: null,
    };
    transcript?.push(entry);
    const t0 = Date.now();
    try {
      const res = await complete(messages, undefined, webSearch ? { webSearch: true } : undefined);
      const ms = Date.now() - t0;
      totalMs += ms;
      messages.push({ role: "assistant", content: res.raw });
      turns.push({ phase, ms, summary });
      entry.ms = ms;
      entry.assistant = res.raw;
      entry.usage = res.usage;
      entry.provenance = res.provenance;
      console.log(`    ← ${phase}: ${(ms / 1000).toFixed(1)}s, ${res.raw.length} chars`);
      return res.raw;
    } catch (err) {
      entry.ms = Date.now() - t0;
      entry.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
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
  // before proceeding" contract — run a BOUNDED corrective re-verify loop until
  // the model emits an explicit ✅ PASS, failing loud otherwise. A FAILED verdict
  // AND a null verdict (no ✅/❌ line emitted) BOTH require resolution: the loop
  // re-prompts up to the cap, and if the verdict is still not an explicit PASS it
  // FAILS LOUD. A verification turn must never silently pass with no verdict.
  // Uniform for every model — same prompts, same gate.
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
    setLastVerdict(verdict);
    console.log(`    ⚖ ${phase}: verdict=${verdict ?? "none"}`);

    let fixes = 0;
    // Re-verify on BOTH a FAILED and a null (no-verdict) result — a verification
    // turn must end on an explicit ✅ PASS, never silently pass with no verdict.
    while (verdict !== "passed" && fixes < cap) {
      fixes++;
      const fixPhase = `${phase}-fix-${fixes}`;
      raw = await send(
        fixPhase,
        fixPrompt + ARTIFACT_TO_INLINE_OPTIONAL,
        `Corrective re-verify ${fixes}/${cap} after a ${verdict === "failed" ? "FAILED" : "MISSING (no ✅/❌)"} ${phase} verdict.`,
        webSearch,
      );
      doc = tryExtractHtmlDocument(raw);
      if (doc) html = doc;
      verdict = readVerdict(raw, pass, fail);
      setLastVerdict(verdict);
      console.log(`    ⚖ ${fixPhase}: verdict=${verdict ?? "none"}`);
    }
    if (verdict !== "passed") {
      throw new Error(
        `${phase} did not reach an explicit ✅ PASS after ${cap} corrective attempt(s) ` +
          `(final verdict: ${verdict === "failed" ? "FAILED" : "none — no ✅/❌ line emitted"}).`,
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
    verifyLinksPrompt(vars),
    verifyLinksFixPrompt(vars),
    LINKS_VERDICT_PASS,
    LINKS_VERDICT_FAIL,
    "Final link verification (emails, contact button, no invented URLs).",
  );

  return { html, schema, rebuilds, turns, totalMs };
}
