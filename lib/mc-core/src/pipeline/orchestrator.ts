import { blockingErrorCount, runCheckers } from "../checkers";
import { computeStructuralHash } from "../checkers/structural-hash";
import type { AIEngine } from "../engine/types";
import type { JoomlaPublisher } from "../publisher/joomla";
import { logBlogEntry, type BlogLogEntry } from "../research/blog-log";
import { runEntityQualityGate } from "../research/entity-gate";
import { fetchResearchBrief } from "../research/n8n";
import { deriveJoomlaMeta, generateLocalBusinessSchema, parseSchema } from "../schema/generator";
import type {
  CheckerReport,
  JoomlaMeta,
  LinkAuditOverride,
  PhaseName,
  ResearchBrief,
  RunContext,
} from "../types";

const BUSINESS_NAME = "STS Electronic Recycling";

/** Shared checker arguments derived from the run context. */
function checkerBase(ctx: RunContext, html: string) {
  return {
    registry: ctx.registry,
    pageType: ctx.pageType,
    track: ctx.track,
    classification: ctx.classification,
    city: ctx.city,
    designBibleHash: ctx.designBibleHash,
    currentBibleHash: computeStructuralHash(html),
  } as const;
}

export interface PhaseState {
  researchBrief: ResearchBrief | null;
  html: string | null;
  schema: string | null;
  joomlaMeta: JoomlaMeta | null;
  checkerReport: CheckerReport | null;
  /**
   * A recorded human override of a failing link audit. When present, link-audit
   * errors no longer block publish (other checker errors still do). Null when no
   * override is in effect.
   */
  linkAuditOverride?: LinkAuditOverride | null;
}

export interface PhaseOutput {
  phase: PhaseName;
  state: PhaseState;
  summary: string;
  /**
   * Only set for the publish phase: whether the publisher actually confirmed an
   * atomic write. The stub (no JOOMLA_PUBLISH_URL) returns false — the caller
   * must NOT mark a run "published" unless this is true.
   */
  published?: boolean;
}

export interface PipelineDeps {
  engine: AIEngine;
  publisher: JoomlaPublisher;
  /** Override the research fetcher (e.g. for tests). */
  research?: (ctx: RunContext) => Promise<ResearchBrief>;
  /** Override the STS blog logger (e.g. for tests). Defaults to mark-blog-log. */
  blogLog?: (entry: BlogLogEntry) => Promise<void>;
}

/**
 * Run a single pipeline phase. The orchestrator depends ONLY on the AIEngine
 * and JoomlaPublisher interfaces — it never imports a concrete engine. Each
 * phase returns the new state so the caller can persist it and gate on approval
 * before advancing.
 */
export async function runPhase(
  phase: PhaseName,
  ctx: RunContext,
  prior: PhaseState,
  deps: PipelineDeps,
): Promise<PhaseOutput> {
  const state: PhaseState = { ...prior };

  switch (phase) {
    case "research": {
      const fetch = deps.research ?? defaultResearch;
      const brief = await fetch(ctx);
      // Entity data-quality gate: flag estimated/unsourced employee counts so the
      // VA must review them before approving. The brief must carry verified data,
      // not pass-through estimates.
      const gateFlags = runEntityQualityGate(brief);
      brief.flags = [...brief.flags, ...gateFlags];
      state.researchBrief = brief;
      const flagCount = brief.flags.length;
      return {
        phase,
        state,
        summary: flagCount
          ? `Research brief retrieved with ${flagCount} entity data-quality flag(s) to resolve before approval.`
          : brief.summary
            ? "Research brief retrieved; no entity data-quality flags."
            : "Research returned no summary; review before building.",
      };
    }

    case "build": {
      const ctxWithBrief: RunContext = { ...ctx, researchBrief: state.researchBrief };
      const result = await deps.engine.buildPage(ctxWithBrief);
      state.html = result.content;
      state.checkerReport = runCheckers({
        html: result.content,
        ...checkerBase(ctx, result.content),
        afterAudit: false,
      });
      return { phase, state, summary: phaseSummary("Page built", state.checkerReport) };
    }

    case "audit": {
      if (!state.html) throw new Error("Cannot audit before a page has been built.");
      const ctxWithBrief: RunContext = { ...ctx, researchBrief: state.researchBrief };
      const result = await deps.engine.auditPage(ctxWithBrief, state.html);
      state.html = result.content;
      state.checkerReport = runCheckers({
        html: result.content,
        ...checkerBase(ctx, result.content),
        afterAudit: true,
      });
      return { phase, state, summary: phaseSummary("Page audited", state.checkerReport) };
    }

    case "schema": {
      if (!state.html) throw new Error("Cannot generate schema before a page has been built.");
      const ctxWithBrief: RunContext = { ...ctx, researchBrief: state.researchBrief };
      const result = await deps.engine.generateSchema(ctxWithBrief, state.html);
      const valid = parseSchema(result.content);
      state.schema = valid ? result.content : generateLocalBusinessSchema(ctx);
      // Derive the Joomla meta now so it is persisted with the run before publish.
      state.joomlaMeta = deriveJoomlaMeta(state.html, ctx);
      state.checkerReport = runCheckers({
        html: state.html,
        ...checkerBase(ctx, state.html),
        afterAudit: true,
        schema: state.schema,
        businessName: BUSINESS_NAME,
        entities: state.researchBrief?.entities,
      });
      return {
        phase,
        state,
        summary: valid
          ? phaseSummary("Schema generated", state.checkerReport)
          : "Engine schema was invalid JSON; used deterministic LocalBusiness fallback.",
      };
    }

    case "publish": {
      if (!state.html) throw new Error("Cannot publish without page HTML.");
      if (!state.schema) throw new Error("Cannot publish without schema.");
      const report =
        state.checkerReport ??
        runCheckers({
          html: state.html,
          ...checkerBase(ctx, state.html),
          afterAudit: true,
          schema: state.schema,
          businessName: BUSINESS_NAME,
          entities: state.researchBrief?.entities,
        });
      state.checkerReport = report;
      const override = prior.linkAuditOverride ?? null;
      const blocking = blockingErrorCount(report, override !== null);
      if (blocking > 0) {
        throw new Error(
          `Publish blocked: ${blocking} checker error(s) must be resolved first.`,
        );
      }
      const meta = state.joomlaMeta ?? deriveJoomlaMeta(state.html, ctx);
      state.joomlaMeta = meta;
      const result = await deps.publisher.publish({
        title: meta.title ?? "",
        html: state.html,
        schema: state.schema,
        meta,
      });
      // STS blog track: log every blog publish to the existing n8n mark-blog-log
      // webhook. A logging failure is surfaced in the summary but does NOT roll
      // back the already-atomic Joomla publish. Only log when the publish was
      // actually confirmed — never record an unpublished page as "published".
      let summary = result.message;
      if (override !== null && !report.linkAudit.passed && result.published) {
        summary = `${summary} Link audit overridden by ${override.by} on ${override.at}${override.reason ? ` (${override.reason})` : ""}.`;
      }
      if (ctx.track === "blog" && result.published) {
        const blogLog = deps.blogLog ?? logBlogEntry;
        try {
          await blogLog({
            city: ctx.city,
            state: ctx.state,
            blogTopic: ctx.blogTopic,
            title: meta.title,
            url: meta.alias,
            status: "published",
            engine: deps.engine.name,
          });
          summary = `${summary} Blog logged to mark-blog-log.`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          summary = `${summary} WARNING: blog publish succeeded but mark-blog-log logging failed: ${msg}`;
        }
      }
      return { phase, state, summary, published: result.published };
    }

    default: {
      const exhaustive: never = phase;
      throw new Error(`Unknown phase: ${String(exhaustive)}`);
    }
  }
}

function defaultResearch(ctx: RunContext): Promise<ResearchBrief> {
  return fetchResearchBrief({
    city: ctx.city,
    state: ctx.state,
    niche: ctx.niche,
    track: ctx.track,
    blogTopic: ctx.blogTopic,
    verifiedCid: ctx.verifiedCid,
  });
}

function phaseSummary(label: string, report: CheckerReport): string {
  return `${label}: ${report.errorCount} error(s), ${report.warningCount} warning(s), ${report.wordCount} words.`;
}
