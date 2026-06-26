import { describeContext, type RunContext } from "@workspace/mc-core";
import type { ChatMessage, CompleteFn } from "./providers.js";
import type { DesignFixtures } from "./fixtures.js";
import { extractHtmlDocument, tryExtractHtmlDocument } from "./extract.js";
import { evaluateDesignGate } from "./designGate.js";
import {
  ARTIFACT_TO_INLINE,
  ARTIFACT_TO_INLINE_OPTIONAL,
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
 * design-gate/rebuild loop → seo → seo-verify → schema(deterministic) →
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
  /** Deterministic schema generator for this scenario (No-GMB or GMB-aware). */
  schemaFn: (ctx: RunContext) => string;
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

function promptVars(ctx: RunContext): PromptVars {
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
function readVerdict(raw: string, pass: RegExp, fail: RegExp): "passed" | "failed" | null {
  const passIdx = lastMatchIndex(raw, pass);
  const failIdx = lastMatchIndex(raw, fail);
  if (passIdx === -1 && failIdx === -1) return null;
  return failIdx > passIdx ? "failed" : "passed";
}

const SEO_VERDICT_PASS = /seo verification passed/i;
const SEO_VERDICT_FAIL = /seo verification failed/i;
const LINKS_VERDICT_PASS = /links verified/i;
const LINKS_VERDICT_FAIL = /links failed/i;

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
function fileBlock(name: string, body: string): string {
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

  /** Send one user turn, append both sides to history, time it. */
  const send = async (phase: string, user: string, summary: string): Promise<string> => {
    messages.push({ role: "user", content: user });
    console.log(`    → ${phase}: sending (${messages.length} msgs in history)…`);
    const t0 = Date.now();
    const res = await complete(messages);
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
  ): Promise<void> => {
    let raw = await send(phase, prompt + ARTIFACT_TO_INLINE_OPTIONAL, summary);
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

  // 5. SEO verification (gated on the ✅/❌ FINAL VERDICT).
  await runVerification(
    "seo-verify",
    seoVerifyPrompt(vars),
    seoVerifyFixPrompt(),
    SEO_VERDICT_PASS,
    SEO_VERDICT_FAIL,
    "SEO verification audit (compliance + modern SEO).",
  );

  // 6. Schema — DETERMINISTIC, no AI turn (the tool's Auto-Generate Schema path).
  const schema = deps.schemaFn(ctx);
  turns.push({ phase: "schema", ms: 0, summary: "Deterministic schema (No-GMB: no CID, no street address)." });

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
