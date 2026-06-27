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
  type PromptGmb,
} from "./miniPrompts.js";
import {
  LINKS_VERDICT_FAIL,
  LINKS_VERDICT_PASS,
  SEO_VERDICT_FAIL,
  SEO_VERDICT_PASS,
  assertNotRefusal,
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
  /** The page's target URL, used verbatim for the prompts (GMB pageUrl for the
   * GMB scenario, else TARGET.url). */
  pageUrl?: string;
  /** Verified GMB NAP block for the GMB scenario; null for the No-GMB path. */
  gmb?: PromptGmb | null;
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
  const vars = promptVars(ctx, deps.pageUrl, deps.gmb);
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
    // A refusal / empty main response is structurally invalid → the backup steps
    // in (or the phase fails loud if both refuse). Report-primary output (HTML) is
    // still optional, so a model that audits without re-emitting HTML is fine.
    const first = await runPhase(
      phase,
      route,
      [sharedContext, htmlBlock(html), prompt + ARTIFACT_TO_INLINE_OPTIONAL].join("\n\n"),
      (raw) => assertNotRefusal(raw, phase),
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
    // Re-verify on BOTH a FAILED and a null (no-verdict) result — a verification
    // turn must end on an explicit ✅ PASS, never silently pass with no verdict.
    while (verdict !== "passed" && fixes < cap) {
      fixes++;
      const fixPhase = `${phase}-fix-${fixes}`;
      raw = await callModel(
        fixPhase,
        model,
        [sharedContext, htmlBlock(html), fixPrompt + ARTIFACT_TO_INLINE_OPTIONAL].join("\n\n"),
        `Corrective re-verify ${fixes}/${cap} after a ${verdict === "failed" ? "FAILED" : "MISSING (no ✅/❌)"} ${phase} verdict.`,
        webSearch,
      );
      doc = tryExtractHtmlDocument(raw);
      if (doc) html = doc;
      verdict = readVerdict(raw, pass, fail);
      turns[turns.length - 1].verdict = verdict;
      console.log(`    ⚖ ${fixPhase}: verdict=${verdict ?? "none"}`);
    }
    if (verdict !== "passed") {
      throw new Error(
        `${phase} did not reach an explicit ✅ PASS after ${cap} corrective attempt(s) ` +
          `(final verdict: ${verdict === "failed" ? "FAILED" : "none — no ✅/❌ line emitted"}).`,
      );
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
    verifyLinksPrompt(vars),
    verifyLinksFixPrompt(vars),
    LINKS_VERDICT_PASS,
    LINKS_VERDICT_FAIL,
    "Final link verification (emails, contact button, no invented URLs).",
  );

  return { html, schema, rebuilds, turns, totalMs, attribution };
}
