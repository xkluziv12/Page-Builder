import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { build } from "esbuild";

// Regression coverage for the composed router's mount order (src/routes/index.ts).
// `mcRouter` gates ALL of its own paths with a router-level `router.use(requireAdmin)`
// that has no path prefix, so it matches every request Express hands it — not just
// "/mc/*". If a public router (health, github-sync status, prompts) is ever mounted
// AFTER mcRouter, its requests never reach their own handler: they get swallowed by
// mcRouter's blanket admin gate and 401 instead. This exact regression shipped once
// (prompts got shadowed by the admin gate) and was fixed by reordering the
// `router.use(...)` calls in index.ts — nothing before caught a reorder like that,
// since the other auth tests only mount individual routers in isolation.

const TEST_ADMIN_TOKEN = "route-mount-order-test-token";
const originalAdminToken = process.env.ADMIN_TOKEN;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

let server;
let baseUrl;
let bundleDirectory;

before(async () => {
  process.env.DATABASE_URL ??= "postgresql://mission-control-test:unused@127.0.0.1:5432/unused";
  process.env.ADMIN_TOKEN = TEST_ADMIN_TOKEN;
  process.env.NODE_ENV = "production";
  delete process.env.GITHUB_WEBHOOK_SECRET;

  bundleDirectory = await mkdtemp(join(tmpdir(), "route-mount-order-"));
  const outfile = join(bundleDirectory, "router.cjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../src/routes/index.ts", import.meta.url))],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node24",
    outfile,
    logLevel: "silent",
  });

  const routerModule = await import(pathToFileURL(outfile).href);
  const composedRouter = routerModule.default.default;
  assert.equal(typeof composedRouter, "function", "bundled module must export the composed router");
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(composedRouter);

  server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
    candidate.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string", "test server must use a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (bundleDirectory) {
    await rm(bundleDirectory, { recursive: true, force: true });
  }

  if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = originalAdminToken;

  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalWebhookSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
  else process.env.GITHUB_WEBHOOK_SECRET = originalWebhookSecret;
});

describe("composed router mount order (src/routes/index.ts)", () => {
  it("does not gate the public health check behind the Mission Control admin router", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
  });

  it("does not gate the public GitHub mirror status behind the Mission Control admin router", async () => {
    const response = await fetch(`${baseUrl}/github-sync/status`);
    assert.equal(response.status, 200);
  });

  it("does not gate the public prompt-sync webhook behind the Mission Control admin router", async () => {
    // No GITHUB_WEBHOOK_SECRET configured: the route itself must answer 503
    // (webhook disabled). A 401 here would mean mcRouter's blanket admin gate
    // shadowed this route before it ever ran its own logic.
    const response = await fetch(`${baseUrl}/prompts/sync/github`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 503);
  });

  it("still requires the admin token for the Mission Control run routes", async () => {
    const response = await fetch(`${baseUrl}/mc/runs`, { method: "POST" });
    assert.equal(response.status, 401);
  });

  it("still requires the admin token for the canonical work-log routes", async () => {
    const response = await fetch(`${baseUrl}/mc/work-log`);
    assert.equal(response.status, 401);
  });
});
