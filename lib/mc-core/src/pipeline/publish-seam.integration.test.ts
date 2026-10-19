import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { runPhase, type PhaseState } from "./orchestrator";
import { createJoomlaPublisher } from "../publisher/joomla";
import type { AIEngine, EngineResult } from "../engine/types";
import { buildRegistry } from "../registry";
import type { RunContext } from "../types";

// End-to-end coverage of the atomic publish seam: the orchestrator's publish
// phase wired to the REAL HttpJoomlaPublisher talking to a REAL (in-process)
// HTTP endpoint. This complements joomla.test.ts (publisher unit, mocked fetch)
// and orchestrator.test.ts (publish-result threading, fake publisher) by
// exercising the full runPhase -> publisher -> network path against a stub
// Joomla helper. Local-only: it never touches an external service.

const PAGE_HTML =
  "<h1>STS Electronic Recycling Austin</h1>" +
  "<p>STS Electronic Recycling provides certified electronics recycling in Austin.</p>".repeat(60);
const SCHEMA = '{"@context":"https://schema.org","@type":"LocalBusiness","name":"STS Electronic Recycling"}';

type StubMode = "atomic-ok" | "partial-write";
let stubMode: StubMode = "atomic-ok";
const received: Array<Record<string, unknown>> = [];

const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    received.push(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
    res.setHeader("content-type", "application/json");
    if (stubMode === "partial-write") {
      // Acknowledge only a partial write: the seam must treat this as a hard
      // failure so a half-published page is never reported live.
      res.end(JSON.stringify({ wrote: { body: true, schema: false, meta: true } }));
      return;
    }
    res.end(JSON.stringify({ ok: true, articleId: 4242, url: "/austin-tx-electronics-recycling" }));
  });
});

let endpoint = "";
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") endpoint = `http://127.0.0.1:${addr.port}/publish`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

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

function ctx(track: "page" | "blog" = "page"): RunContext {
  return {
    city: "Austin",
    state: "TX",
    track,
    classification: "NEW_BUILD",
    competition: "LOW",
    pageType: "SPOKE",
    niche: "general",
    existingUrls: [],
    handoff: null,
    verifiedCid: null,
    designBibleHash: null,
    blogTopic: track === "blog" ? "e-waste recycling" : null,
    researchBrief: { summary: "ok", entities: [], sources: [], flags: [], raw: null },
    registry: buildRegistry(),
  };
}

function passingState(): PhaseState {
  return {
    researchBrief: { summary: "ok", entities: [], sources: [], flags: [], raw: null },
    html: PAGE_HTML,
    schema: SCHEMA,
    joomlaMeta: { title: "STS Austin", description: "d", keywords: "k", alias: "austin-tx-electronics-recycling" },
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

function failingState(): PhaseState {
  const s = passingState();
  s.checkerReport = {
    passed: false,
    errorCount: 1,
    warningCount: 0,
    wordCount: 600,
    ranAt: new Date().toISOString(),
    checks: [
      {
        id: "word-count",
        label: "Word count",
        severity: "error",
        passed: false,
        message: "Page is too short.",
        details: [],
      },
    ],
  };
  return s;
}

describe("atomic publish seam (orchestrator -> HttpJoomlaPublisher -> real endpoint)", () => {
  it("publishes atomically end-to-end and posts body + schema + meta in one request", async () => {
    stubMode = "atomic-ok";
    received.length = 0;
    const publisher = createJoomlaPublisher({ endpoint });
    expect(publisher.name).toBe("joomla-http");

    const out = await runPhase("publish", ctx("page"), passingState(), {
      engine: fakeEngine(),
      publisher,
    });

    expect(out.published).toBe(true);
    expect(out.templateStyle?.status).toBe("unsupported");
    expect(received).toHaveLength(1);
    const payload = received[0];
    expect(payload.body).toBe(PAGE_HTML);
    expect(payload.schema).toBe(SCHEMA);
    expect((payload.meta as Record<string, unknown>).title).toBe("STS Austin");
    // New pages always publish UNPUBLISHED for human review, atomically.
    expect(payload.published).toBe(false);
    expect(payload.atomic).toBe(true);
  });

  it("logs the blog entry only after a confirmed atomic blog publish", async () => {
    stubMode = "atomic-ok";
    received.length = 0;
    let logged: Record<string, unknown> | null = null;
    const publisher = createJoomlaPublisher({ endpoint });

    const out = await runPhase("publish", ctx("blog"), passingState(), {
      engine: fakeEngine(),
      publisher,
      blogLog: async (entry) => {
        logged = entry as unknown as Record<string, unknown>;
      },
    });

    expect(out.published).toBe(true);
    expect(logged).not.toBeNull();
    expect(logged!.status).toBe("published");
    expect(logged!.city).toBe("Austin");
    expect(logged!.engine).toBe("claude");
  });

  it("refuses to publish and never calls the endpoint when a checker error is unresolved", async () => {
    stubMode = "atomic-ok";
    received.length = 0;
    const publisher = createJoomlaPublisher({ endpoint });

    await expect(
      runPhase("publish", ctx("page"), failingState(), { engine: fakeEngine(), publisher }),
    ).rejects.toThrow(/Publish blocked/i);
    expect(received).toHaveLength(0);
  });

  it("hard-fails (no false publish) when the endpoint confirms only a partial write", async () => {
    stubMode = "partial-write";
    received.length = 0;
    const publisher = createJoomlaPublisher({ endpoint });

    await expect(
      runPhase("publish", ctx("page"), passingState(), { engine: fakeEngine(), publisher }),
    ).rejects.toThrow(/atomic write/i);
    expect(received).toHaveLength(1);
  });
});
