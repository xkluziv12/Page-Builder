import { describe, expect, it } from "vitest";
import { runPhase, type PhaseState } from "./orchestrator";
import type { AIEngine, EngineResult } from "../engine/types";
import type { JoomlaPublisher, PublishResult } from "../publisher/joomla";
import { buildRegistry } from "../registry";
import type { RunContext } from "../types";

const PAGE_HTML =
  "<h1>STS Electronic Recycling Austin</h1>" +
  "<p>STS Electronic Recycling provides certified electronics recycling in Austin.</p>".repeat(60);
const SCHEMA = '{"@context":"https://schema.org","@type":"LocalBusiness","name":"STS Electronic Recycling"}';

function fakeEngine(): AIEngine {
  const result = (content: string): EngineResult => ({ content, model: "fake" });
  return {
    name: "claude",
    buildPage: async () => result(PAGE_HTML),
    auditPage: async (_ctx, html) => result(html),
    generateSchema: async () => result(SCHEMA),
    chatEdit: async (_ctx, html) => result(html ?? ""),
  };
}

function ctx(): RunContext {
  return {
    city: "Austin",
    state: "TX",
    track: "page",
    classification: "NEW_BUILD",
    competition: "LOW",
    pageType: "SPOKE",
    niche: "general",
    existingUrls: [],
    handoff: null,
    verifiedCid: null,
    designBibleHash: null,
    blogTopic: null,
    researchBrief: { summary: "ok", entities: [], sources: [], flags: [], raw: null },
    registry: buildRegistry(),
  };
}

function priorState(): PhaseState {
  return {
    researchBrief: { summary: "ok", entities: [], sources: [], flags: [], raw: null },
    html: PAGE_HTML,
    schema: SCHEMA,
    joomlaMeta: { title: "STS Austin", description: "d", keywords: "k", alias: "austin" },
    // A passing report so the publish gate is satisfied — this test exercises the
    // publish-result -> status threading, not the checker suite itself.
    checkerReport: {
      passed: true,
      errorCount: 0,
      warningCount: 0,
      wordCount: 600,
      ranAt: new Date().toISOString(),
      checks: [],
    },
  };
}

describe("runPhase publish state", () => {
  it("reports published:false when the stub publisher does not actually publish", async () => {
    const publisher: JoomlaPublisher = {
      name: "stub",
      publish: async (): Promise<PublishResult> => ({
        published: false,
        url: null,
        articleId: null,
        message: "no endpoint configured; nothing published",
      }),
    };
    const out = await runPhase("publish", ctx(), priorState(), { engine: fakeEngine(), publisher });
    expect(out.published).toBe(false);
  });

  it("reports published:true only when the publisher confirms an atomic write", async () => {
    const publisher: JoomlaPublisher = {
      name: "http",
      publish: async (): Promise<PublishResult> => ({
        published: true,
        url: "/austin",
        articleId: "42",
        message: "published atomically",
      }),
    };
    const out = await runPhase("publish", ctx(), priorState(), { engine: fakeEngine(), publisher });
    expect(out.published).toBe(true);
  });

  it("marks the publish phase's provenance as deterministic, reflecting the actual write outcome", async () => {
    const publisher: JoomlaPublisher = {
      name: "http",
      publish: async (): Promise<PublishResult> => ({
        published: true,
        url: "/austin",
        articleId: "42",
        message: "published atomically",
      }),
    };
    const out = await runPhase("publish", ctx(), priorState(), { engine: fakeEngine(), publisher });
    expect(out.provenance?.sourceKind).toBe("deterministic");
    expect(out.provenance?.status).toBe("success");
  });

  it("does not log a blog entry when publish was not confirmed", async () => {
    let logged = false;
    const publisher: JoomlaPublisher = {
      name: "stub",
      publish: async (): Promise<PublishResult> => ({
        published: false,
        url: null,
        articleId: null,
        message: "nothing published",
      }),
    };
    const blogCtx = { ...ctx(), track: "blog" as const, blogTopic: "recycling" };
    await runPhase("publish", blogCtx, priorState(), {
      engine: fakeEngine(),
      publisher,
      blogLog: async () => {
        logged = true;
      },
    });
    expect(logged).toBe(false);
  });
});
