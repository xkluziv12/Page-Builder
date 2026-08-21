import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { build } from "esbuild";

const TEST_ADMIN_TOKEN = "mission-control-route-test-token";
const originalAdminToken = process.env.ADMIN_TOKEN;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;

let server;
let baseUrl;
let bundleDirectory;

const protectedRoutes = [
  { name: "list Mission Control runs", method: "GET", path: "/mc/runs" },
  { name: "create a run", method: "POST", path: "/mc/runs" },
  { name: "edit page HTML", method: "PUT", path: "/mc/runs/42/html" },
  { name: "approve a phase", method: "POST", path: "/mc/runs/42/phases/research/approve" },
  { name: "publish a page", method: "POST", path: "/mc/runs/42/phases/publish/run" },
  { name: "delete a run", method: "DELETE", path: "/mc/runs/42" },
];

async function request(route, authorization) {
  return fetch(`${baseUrl}${route.path}`, {
    method: route.method,
    headers: authorization ? { authorization } : undefined,
  });
}

before(async () => {
  // Importing the real router also imports the DB package. No protected request
  // reaches a DB operation in this suite, but the package requires a connection
  // string while it is being initialized.
  process.env.DATABASE_URL ??= "postgresql://mission-control-test:unused@127.0.0.1:5432/unused";
  process.env.ADMIN_TOKEN = TEST_ADMIN_TOKEN;
  process.env.NODE_ENV = "production";

  // Bundle the source router the same way the API package does. Node's direct
  // TypeScript loader cannot resolve this workspace's extensionless directory
  // imports, while esbuild supports the workspace source layout used in prod.
  bundleDirectory = await mkdtemp(join(tmpdir(), "mc-auth-router-"));
  const outfile = join(bundleDirectory, "mc-router.cjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../src/routes/mc.ts", import.meta.url))],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node24",
    outfile,
    logLevel: "silent",
  });

  const routerModule = await import(pathToFileURL(outfile).href);
  const mcRouter = routerModule.default.default;
  assert.equal(typeof mcRouter, "function", "bundled module must export the Mission Control router");
  const app = express();
  app.use(express.json());
  app.use(mcRouter);

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

  if (originalAdminToken === undefined) {
    delete process.env.ADMIN_TOKEN;
  } else {
    process.env.ADMIN_TOKEN = originalAdminToken;
  }
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("Mission Control admin route gate", () => {
  for (const credential of [
    { label: "no bearer token", authorization: undefined },
    { label: "an invalid bearer token", authorization: "Bearer not-the-admin-token" },
  ]) {
    for (const route of protectedRoutes) {
      it(`returns 401 for ${credential.label} when attempting to ${route.name}`, async () => {
        const response = await request(route, credential.authorization);

        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { message: "Invalid or missing admin token." });
      });
    }
  }

  it("allows a configured bearer token to reach the route handler without echoing it", async () => {
    const response = await request(
      { name: "create a run", method: "POST", path: "/mc/runs" },
      `Bearer ${TEST_ADMIN_TOKEN}`,
    );
    const body = await response.json();

    // An empty create request is rejected by the route itself, rather than by
    // the auth middleware. This avoids DB or external-service work while proving
    // the valid-token path reaches the protected route layer.
    assert.equal(response.status, 400);
    assert.deepEqual(body, { error: "vaName and url are required" });
    assert.doesNotMatch(JSON.stringify(body), new RegExp(TEST_ADMIN_TOKEN));
  });
});
