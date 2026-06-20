import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  mcChatMessagesTable,
  mcPageVersionsTable,
  mcRunsTable,
  type McRun,
} from "@workspace/db";
import {
  deriveLinkAudit,
  runCheckers,
  runPhase,
  type AIEngine,
  type CheckResult,
  type LinkAuditOverride,
  type PhaseName,
} from "@workspace/mc-core";
import {
  engineFor,
  replitEngineFor,
  initialPhases,
  loadRegistry,
  nextPhase,
  publisher,
  serializeRun,
  toRunContext,
  PHASE_ORDER,
  SUPPORTED_ENGINES,
  type PhaseLadderEntry,
} from "../lib/mc-runtime";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PHASE_SET = new Set(PHASE_ORDER);

function isPhase(value: string): value is PhaseName {
  return PHASE_SET.has(value as PhaseName);
}

async function loadRun(id: number): Promise<McRun | undefined> {
  const [row] = await db.select().from(mcRunsTable).where(eq(mcRunsTable.id, id));
  return row;
}

/** Patch a single phase's status fields within the phases ladder. */
function patchPhase(
  phases: PhaseLadderEntry[],
  phase: PhaseName,
  patch: Partial<PhaseLadderEntry>,
): PhaseLadderEntry[] {
  return phases.map((p) => (p.phase === phase ? { ...p, ...patch } : p));
}

type PhaseExecResult = { run: McRun; ok: boolean; error?: string };

/**
 * Execute one pipeline phase and persist its result. This is the single
 * orchestration seam shared by run creation (auto-runs Research), approval
 * (auto-runs the next phase), and the manual retry endpoint. It never throws:
 * a phase failure is recorded on the ladder (status "failed") and reported via
 * the returned `ok=false`, so the approve/create flow can still respond with
 * the run's current state. Phase-gate enforcement lives in the callers, not
 * here — this helper assumes the phase is cleared to run.
 */
async function executePhase(
  run: McRun,
  phase: PhaseName,
  engineOverride?: AIEngine,
): Promise<PhaseExecResult> {
  let engine: AIEngine;
  try {
    // Replit-mode runs supply their own ReplitEngine (seeded with the operator's
    // Agent-produced artifact) via engineOverride; Dashboard (claude) runs are
    // auto-resolved here. Either way the rest of the phase — checkers,
    // persistence, parity gates — is identical, so a Replit page must clear the
    // same bar as a Claude page.
    engine = engineOverride ?? (await engineFor(run.engine));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unsupported engine";
    const failed = patchPhase(run.phases as unknown as PhaseLadderEntry[], phase, {
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    const [updated] = await db
      .update(mcRunsTable)
      .set({ phases: failed as unknown as Record<string, unknown>[], status: "failed", updatedAt: new Date() })
      .where(eq(mcRunsTable.id, run.id))
      .returning();
    return { run: updated!, ok: false, error: message };
  }

  const registry = await loadRegistry(run.handoff ? [run.handoff] : [], run.existingUrls ?? []);
  const ctx = toRunContext(run, registry);

  const startedPhases = patchPhase(run.phases as unknown as PhaseLadderEntry[], phase, {
    status: "running",
    startedAt: new Date().toISOString(),
    error: null,
  });
  await db
    .update(mcRunsTable)
    .set({ phases: startedPhases as unknown as Record<string, unknown>[], status: "running", updatedAt: new Date() })
    .where(eq(mcRunsTable.id, run.id));

  try {
    const output = await runPhase(
      phase,
      ctx,
      {
        researchBrief: (run.researchBrief as never) ?? null,
        html: run.pageHtml,
        schema: run.generatedSchema,
        joomlaMeta: (run.joomlaMeta as never) ?? null,
        checkerReport: (run.checkerReport as never) ?? null,
        linkAuditOverride: (run.linkAuditOverride as never) ?? null,
      },
      { engine, publisher },
    );

    // A publish phase only "completes" (run -> published, phase -> approved)
    // when the publisher confirmed an atomic write. The stub publisher (no
    // JOOMLA_PUBLISH_URL configured) returns published:false, so the run stays
    // in review with the publisher's "nothing was published" message surfaced —
    // never report a half/no-write as published.
    const publishConfirmed = phase === "publish" && output.published === true;
    const completedPhases = patchPhase(startedPhases, phase, {
      status: publishConfirmed ? "approved" : "review",
      summary: output.summary,
      completedAt: new Date().toISOString(),
    });

    if (output.state.html && output.state.html !== run.pageHtml) {
      await db.insert(mcPageVersionsTable).values({
        runId: run.id,
        phase,
        html: output.state.html,
        schema: output.state.schema ?? null,
      });
    }

    const status = publishConfirmed ? "published" : "review";
    // A link-audit override is tied to the exact HTML it was applied to. Once a
    // phase regenerates the page, the prior override is stale and must be
    // dropped so a fresh human decision is required against the new content.
    const htmlChanged = !!output.state.html && output.state.html !== run.pageHtml;
    const [updated] = await db
      .update(mcRunsTable)
      .set({
        phases: completedPhases as unknown as Record<string, unknown>[],
        researchBrief: (output.state.researchBrief as never) ?? null,
        pageHtml: output.state.html,
        generatedSchema: output.state.schema,
        joomlaMeta: (output.state.joomlaMeta as never) ?? run.joomlaMeta ?? null,
        checkerReport: (output.state.checkerReport as never) ?? null,
        linkAuditOverride: htmlChanged ? null : (run.linkAuditOverride ?? null),
        status,
        updatedAt: new Date(),
      })
      .where(eq(mcRunsTable.id, run.id))
      .returning();
    return { run: updated!, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Phase failed";
    logger.error({ err, phase, runId: run.id }, "Phase execution failed");
    const failedPhases = patchPhase(startedPhases, phase, {
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    const [updated] = await db
      .update(mcRunsTable)
      .set({ phases: failedPhases as unknown as Record<string, unknown>[], status: "failed", updatedAt: new Date() })
      .where(eq(mcRunsTable.id, run.id))
      .returning();
    return { run: updated!, ok: false, error: message };
  }
}

// GET /mc/runs — list
router.get("/mc/runs", async (_req, res) => {
  const rows = await db.select().from(mcRunsTable).orderBy(desc(mcRunsTable.createdAt));
  res.json(rows.map(serializeRun));
});

// POST /mc/runs — create
router.post("/mc/runs", async (req, res) => {
  const body = req.body ?? {};
  if (!body.city || !body.state) {
    res.status(400).json({ error: "city and state are required" });
    return;
  }
  const engine = body.engine ?? "claude";
  if (!SUPPORTED_ENGINES.includes(engine)) {
    res.status(400).json({
      error: `Engine "${engine}" is not supported in Dashboard mode yet. Available engines: ${SUPPORTED_ENGINES.join(", ")}.`,
    });
    return;
  }
  // Replit-mode runs are operator-driven, so they are created "queued" and wait
  // for a human operator to pick them up via the run-book — the server never
  // auto-runs them. Dashboard (claude) runs start "running" and execute Research
  // immediately.
  const isReplit = engine === "replit";
  const [row] = await db
    .insert(mcRunsTable)
    .values({
      city: String(body.city),
      state: String(body.state),
      track: body.track ?? "page",
      engine,
      classification: body.classification ?? "NEW_BUILD",
      niche: body.niche ?? "general",
      competition: body.competition ?? "LOW",
      pageType: body.pageType ?? "SPOKE",
      existingUrls: Array.isArray(body.existingUrls) ? body.existingUrls : [],
      handoff: body.handoff ?? null,
      verifiedCid: body.verifiedCid ?? null,
      designBibleHash: body.designBibleHash ?? null,
      blogTopic: body.blogTopic ?? null,
      status: isReplit ? "queued" : "running",
      currentPhase: "research",
      phases: initialPhases() as unknown as Record<string, unknown>[],
    })
    .returning();

  if (isReplit) {
    // Hand off to the Replit operator queue: Research stays "ready" for pickup.
    res.status(201).json(serializeRun(row!));
    return;
  }

  // "Go" runs the pipeline: Research executes immediately, then pauses at the
  // first review gate. Subsequent phases auto-run on approval (see approve).
  const result = await executePhase(row!, "research");
  res.status(201).json(serializeRun(result.run));
});

// GET /mc/summary — dashboard counts + recent
router.get("/mc/summary", async (_req, res) => {
  const counts = await db
    .select({ status: mcRunsTable.status, count: sql<number>`count(*)::int` })
    .from(mcRunsTable)
    .groupBy(mcRunsTable.status);
  const recent = await db
    .select()
    .from(mcRunsTable)
    .orderBy(desc(mcRunsTable.createdAt))
    .limit(5);
  const total = counts.reduce((sum, c) => sum + Number(c.count), 0);
  res.json({
    total,
    byStatus: counts.map((c) => ({ status: c.status, count: Number(c.count) })),
    recent: recent.map(serializeRun),
  });
});

// GET /mc/registry — the merged safeguard registry
router.get("/mc/registry", async (_req, res) => {
  const registry = await loadRegistry();
  res.json({
    baseDomain: registry.baseDomain,
    sacredLinks: registry.sacredLinks,
    imageLibrary: registry.imageLibrary,
    industryLinks: registry.industryLinks,
    allowlist: registry.allowlist,
    wordCountFloor: registry.wordCountFloor,
  });
});

// GET /mc/runs/:id — single run
router.get("/mc/runs/:id", async (req, res) => {
  const id = Number(req.params.id);
  const run = await loadRun(id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(serializeRun(run));
});

// DELETE /mc/runs/:id
router.delete("/mc/runs/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(mcRunsTable).where(eq(mcRunsTable.id, id));
  res.status(204).send();
});

// POST /mc/runs/:id/phases/:phase/run — execute a phase
router.post("/mc/runs/:id/phases/:phase/run", async (req, res) => {
  const id = Number(req.params.id);
  const phase = String(req.params.phase);
  if (!isPhase(phase)) {
    res.status(400).json({ error: `Unknown phase: ${phase}` });
    return;
  }
  const run = await loadRun(id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  // Server-side phase-gate enforcement: a phase can only run when it is the
  // ready (next-approved) rung, or when re-running a phase still in review, or
  // retrying a failed phase. This prevents skipping the approve-before-advance
  // ladder via direct API calls (e.g. running "build" before "research" is
  // approved).
  const ladder = run.phases as unknown as PhaseLadderEntry[];
  const entry = ladder.find((p) => p.phase === phase);
  const runnable = entry && ["ready", "review", "failed"].includes(entry.status);
  if (!runnable) {
    res.status(409).json({
      error: `Phase "${phase}" is not runnable in its current state (${entry?.status ?? "unknown"}). Approve the prior phase first.`,
      run: serializeRun(run),
    });
    return;
  }

  // Manual (re)run — used to retry a failed phase or re-run one still in review.
  // The normal forward flow is automated (create auto-runs Research; approve
  // auto-runs the next phase), so this endpoint is the retry escape hatch.
  const result = await executePhase(run, phase);
  if (!result.ok) {
    res.status(400).json({ error: result.error ?? "Phase failed", run: serializeRun(result.run) });
    return;
  }
  res.json(serializeRun(result.run));
});

// POST /mc/runs/:id/phases/:phase/replit — submit an operator/Agent-produced
// artifact for a Replit-mode run and execute the phase against it. This is the
// handoff seam the run-book CLI calls: the Replit Agent builds the HTML/schema,
// the operator submits it here, and it flows through the SAME orchestrator,
// checkers, and parity gates as a Claude run.
router.post("/mc/runs/:id/phases/:phase/replit", async (req, res) => {
  const id = Number(req.params.id);
  const phase = String(req.params.phase);
  if (!isPhase(phase)) {
    res.status(400).json({ error: `Unknown phase: ${phase}` });
    return;
  }
  const run = await loadRun(id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  if (run.engine !== "replit") {
    res.status(400).json({
      error: `Run #${id} is a "${run.engine}" run. The Replit phase endpoint only drives Replit-mode runs.`,
    });
    return;
  }

  // Same phase-gate ladder as Dashboard mode: a phase only runs when it is the
  // ready rung, still in review (re-submit), or being retried after a failure.
  const ladder = run.phases as unknown as PhaseLadderEntry[];
  const entry = ladder.find((p) => p.phase === phase);
  const runnable = entry && ["ready", "review", "failed"].includes(entry.status);
  if (!runnable) {
    res.status(409).json({
      error: `Phase "${phase}" is not runnable in its current state (${entry?.status ?? "unknown"}). Type "next" to approve the prior phase first.`,
      run: serializeRun(run),
    });
    return;
  }

  // The Build/Audit phases need operator HTML; Schema needs the JSON-LD. Research
  // reuses the shared n8n research fetch (parity with Dashboard) and Publish uses
  // the shared publisher — neither needs a submitted artifact.
  const body = req.body ?? {};
  const html = typeof body.html === "string" ? body.html : undefined;
  const schema = typeof body.schema === "string" ? body.schema : undefined;
  if ((phase === "build" || phase === "audit") && !html) {
    res.status(400).json({ error: `Phase "${phase}" requires { html } produced by the Replit Agent.` });
    return;
  }
  if (phase === "schema" && !schema) {
    res.status(400).json({ error: `Phase "schema" requires { schema } (JSON-LD) produced by the Replit Agent.` });
    return;
  }

  const result = await executePhase(run, phase, replitEngineFor({ html, schema }));
  if (!result.ok) {
    res.status(400).json({ error: result.error ?? "Phase failed", run: serializeRun(result.run) });
    return;
  }
  res.json(serializeRun(result.run));
});

// POST /mc/runs/:id/phases/:phase/approve — approve and unlock next
router.post("/mc/runs/:id/phases/:phase/approve", async (req, res) => {
  const id = Number(req.params.id);
  const phase = String(req.params.phase);
  if (!isPhase(phase)) {
    res.status(400).json({ error: `Unknown phase: ${phase}` });
    return;
  }
  const run = await loadRun(id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  // A phase can only be approved once it has actually run and is awaiting review.
  // Without this, a caller could approve "research" immediately (unlocking
  // "build") without ever running it — skipping the research-before-HTML gate.
  const ladder = run.phases as unknown as PhaseLadderEntry[];
  const entry = ladder.find((p) => p.phase === phase);
  if (!entry || entry.status !== "review") {
    res.status(409).json({
      error: `Phase "${phase}" cannot be approved from its current state (${entry?.status ?? "unknown"}). A phase must be run and in review before it can be approved.`,
      run: serializeRun(run),
    });
    return;
  }
  let phases = patchPhase(ladder, phase, { status: "approved" });
  const next = nextPhase(phase);
  if (next) {
    phases = patchPhase(phases, next, { status: "ready" });
  }
  const [updated] = await db
    .update(mcRunsTable)
    .set({
      phases: phases as unknown as Record<string, unknown>[],
      currentPhase: next ?? phase,
      status: next ? "running" : "approved",
      updatedAt: new Date(),
    })
    .where(eq(mcRunsTable.id, id))
    .returning();

  // Dashboard (claude) mode: approving a phase advances the pipeline — the next
  // phase runs automatically and then pauses at its own review gate. The VA only
  // ever approves; they never manually trigger each phase. The final phase
  // (publish) has no "next", so approving schema auto-runs publish.
  //
  // Replit mode: "Approve" (the operator typing "next") only opens the gate —
  // it never auto-runs, because the next artifact must be produced by the Replit
  // Agent and submitted via the Replit phase endpoint. The next phase is left
  // "ready" for operator pickup.
  if (next && updated!.engine !== "replit") {
    const result = await executePhase(updated!, next);
    res.json(serializeRun(result.run));
    return;
  }
  res.json(serializeRun(updated!));
});

// POST /mc/runs/:id/check — run checker suite on current HTML
router.post("/mc/runs/:id/check", async (req, res) => {
  const id = Number(req.params.id);
  const run = await loadRun(id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const registry = await loadRegistry(run.handoff ? [run.handoff] : [], run.existingUrls ?? []);
  const report = runCheckers({
    html: run.pageHtml ?? "",
    registry,
    pageType: run.pageType as never,
    track: run.track === "blog" ? "blog" : "page",
    classification: run.classification as never,
    city: run.city,
    designBibleHash: run.designBibleHash,
    afterAudit: true,
    schema: run.generatedSchema,
    businessName: "STS Electronic Recycling",
    entities: (run.researchBrief as { entities?: Record<string, unknown>[] } | null)?.entities,
  });
  await db
    .update(mcRunsTable)
    .set({ checkerReport: report as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(mcRunsTable.id, id));
  res.json(report);
});

// POST /mc/runs/:id/link-audit/override — record a human override of a failing
// link audit so publish can proceed past it. The override is recorded with who
// applied it and when (auditable), and only excuses link-audit errors — every
// other checker error still blocks publish.
router.post("/mc/runs/:id/link-audit/override", async (req, res) => {
  const id = Number(req.params.id);
  const by = typeof req.body?.by === "string" ? req.body.by.trim() : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!by) {
    res.status(400).json({ error: "An operator name ('by') is required to record an override." });
    return;
  }
  const run = await loadRun(id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  // Recompute the link audit against the current HTML so an override can only be
  // recorded when there is actually a failing link audit to excuse.
  const registry = await loadRegistry(run.handoff ? [run.handoff] : [], run.existingUrls ?? []);
  const report = runCheckers({
    html: run.pageHtml ?? "",
    registry,
    pageType: run.pageType as never,
    track: run.track === "blog" ? "blog" : "page",
    classification: run.classification as never,
    city: run.city,
    designBibleHash: run.designBibleHash,
    afterAudit: true,
    schema: run.generatedSchema,
    businessName: "STS Electronic Recycling",
    entities: (run.researchBrief as { entities?: Record<string, unknown>[] } | null)?.entities,
  });
  if (report.linkAudit.passed) {
    res.status(409).json({
      error: "The link audit currently passes — there is nothing to override.",
      run: serializeRun(run),
    });
    return;
  }
  const override: LinkAuditOverride = {
    by,
    at: new Date().toISOString(),
    reason: reason || null,
  };
  const [updated] = await db
    .update(mcRunsTable)
    .set({
      linkAuditOverride: override as unknown as Record<string, unknown>,
      checkerReport: report as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(mcRunsTable.id, id))
    .returning();
  res.json(serializeRun(updated!));
});

// DELETE /mc/runs/:id/link-audit/override — revoke a recorded override.
router.delete("/mc/runs/:id/link-audit/override", async (req, res) => {
  const id = Number(req.params.id);
  const run = await loadRun(id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const [updated] = await db
    .update(mcRunsTable)
    .set({ linkAuditOverride: null, updatedAt: new Date() })
    .where(eq(mcRunsTable.id, id))
    .returning();
  res.json(serializeRun(updated!));
});

// GET /mc/runs/:id/chat — chat history
router.get("/mc/runs/:id/chat", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(mcChatMessagesTable)
    .where(eq(mcChatMessagesTable.runId, id))
    .orderBy(mcChatMessagesTable.createdAt);
  res.json(
    rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      createdAt: r.createdAt?.toISOString?.() ?? null,
    })),
  );
});

// POST /mc/runs/:id/chat — surgical AI edit
router.post("/mc/runs/:id/chat", async (req, res) => {
  const id = Number(req.params.id);
  const message = req.body?.message;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }
  const run = await loadRun(id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  if (run.engine === "replit") {
    res.status(400).json({
      error:
        "AI Edit Chat is a Dashboard-mode (Claude) feature. In Replit mode, edit the page with the Replit Agent and re-submit the Build or Audit phase via the run-book (POST /mc/runs/:id/phases/:phase/replit).",
    });
    return;
  }
  if (!run.pageHtml) {
    res.status(400).json({ error: "Build a page before requesting edits." });
    return;
  }

  await db.insert(mcChatMessagesTable).values({ runId: id, role: "user", content: message });

  const registry = await loadRegistry(run.handoff ? [run.handoff] : [], run.existingUrls ?? []);
  const ctx = toRunContext(run, registry);
  const engine = await engineFor(run.engine);

  try {
    const result = await engine.chatEdit(ctx, run.pageHtml, message);
    const report = runCheckers({
      html: result.content,
      registry,
      pageType: run.pageType as never,
      track: run.track === "blog" ? "blog" : "page",
      classification: run.classification as never,
      city: run.city,
      designBibleHash: run.designBibleHash,
      afterAudit: true,
      schema: run.generatedSchema,
      businessName: "STS Electronic Recycling",
      entities: (run.researchBrief as { entities?: Record<string, unknown>[] } | null)?.entities,
    });
    const reply = `Applied your edit. Checks: ${report.errorCount} error(s), ${report.warningCount} warning(s), ${report.wordCount} words.`;
    await db.insert(mcChatMessagesTable).values({ runId: id, role: "assistant", content: reply });
    await db.insert(mcPageVersionsTable).values({
      runId: id,
      phase: "chat",
      html: result.content,
      schema: run.generatedSchema ?? null,
    });
    await db
      .update(mcRunsTable)
      .set({
        pageHtml: result.content,
        checkerReport: report as unknown as Record<string, unknown>,
        // A chat edit changes the page, so any prior link-audit override is now
        // stale and is dropped — a fresh decision is required against new HTML.
        linkAuditOverride: null,
        updatedAt: new Date(),
      })
      .where(eq(mcRunsTable.id, id));
    res.json({ reply, pageHtml: result.content, report });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : "Edit failed";
    req.log.error({ err }, "Chat edit failed");
    await db
      .insert(mcChatMessagesTable)
      .values({ runId: id, role: "assistant", content: `Edit failed: ${errMessage}` });
    res.status(400).json({ error: errMessage });
  }
});

export default router;
