import { describe, expect, it, vi } from "vitest";
import {
  HttpJoomlaPublisher,
  StubJoomlaPublisher,
  createJoomlaPublisher,
} from "./joomla";
import type { JoomlaMeta } from "../types";

const meta: JoomlaMeta = {
  title: "STS Austin",
  description: "desc",
  keywords: "kw",
  alias: "austin-tx-electronics-recycling",
};

const fullInput = {
  title: "STS Austin",
  html: "<p>body</p>",
  schema: '{"@graph":[]}',
  meta,
};

describe("StubJoomlaPublisher", () => {
  it("aborts atomically when an artifact is missing", async () => {
    const pub = new StubJoomlaPublisher();
    await expect(pub.publish({ ...fullInput, schema: "" })).rejects.toThrow(/missing required artifact/i);
  });
  it("validates but does not report publishing without an endpoint", async () => {
    const pub = new StubJoomlaPublisher();
    const r = await pub.publish(fullInput);
    expect(r.published).toBe(false);
  });
});

describe("HttpJoomlaPublisher", () => {
  it("posts all three fields in one request and confirms an atomic write", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, articleId: 42, url: "/austin" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const pub = new HttpJoomlaPublisher({ endpoint: "https://h/publish", fetchImpl });
    const r = await pub.publish(fullInput);
    expect(r.published).toBe(true);
    expect(r.articleId).toBe("42");
    const body = JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.body).toBe("<p>body</p>");
    expect(body.schema).toBe('{"@graph":[]}');
    expect(body.meta.title).toBe("STS Austin");
    expect(body.published).toBe(false);
  });

  it("hard-fails when the helper does not confirm a full atomic write", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ wrote: { body: true, schema: false, meta: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const pub = new HttpJoomlaPublisher({ endpoint: "https://h/publish", fetchImpl });
    await expect(pub.publish(fullInput)).rejects.toThrow(/atomic write/i);
  });

  it("hard-fails on a non-OK response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("boom", { status: 500 }),
    ) as unknown as typeof fetch;
    const pub = new HttpJoomlaPublisher({ endpoint: "https://h/publish", fetchImpl });
    await expect(pub.publish(fullInput)).rejects.toThrow(/publish failed/i);
  });
});

describe("createJoomlaPublisher", () => {
  it("returns the HTTP publisher when an endpoint is configured", () => {
    expect(createJoomlaPublisher({ endpoint: "https://h/publish" }).name).toBe("joomla-http");
  });
  it("falls back to the stub when no endpoint is configured", () => {
    expect(createJoomlaPublisher({}).name).toBe("joomla-stub");
  });
});
