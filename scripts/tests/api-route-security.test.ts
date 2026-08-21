import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "../../artifacts/api-server/node_modules/express/index.js";
import { afterEach, describe, expect, it } from "vitest";
import apiApp from "../../artifacts/api-server/src/app";
import githubSyncRouter from "../../artifacts/api-server/src/routes/github-sync";
import promptsRouter from "../../artifacts/api-server/src/routes/prompts";

const savedAdminToken = process.env.ADMIN_TOKEN;
const savedWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

afterEach(() => {
  if (savedAdminToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = savedAdminToken;

  if (savedWebhookSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
  else process.env.GITHUB_WEBHOOK_SECRET = savedWebhookSecret;
});

async function request(
  handler: express.Express | express.Router,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, body) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = body;
      },
    }),
  );
  app.use(handler);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, options);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("public GitHub write triggers", () => {
  it("rejects an unauthenticated manual mirror request", async () => {
    process.env.ADMIN_TOKEN = "test-admin-token";

    const response = await request(githubSyncRouter, "/github-sync/now", {
      method: "POST",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid or missing admin token.",
    });
  });

  it("does not enable the prompt-sync webhook without a signature secret", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;

    const response = await request(promptsRouter, "/prompts/sync/github", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: "refs/heads/main" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: "Webhook signature verification is not configured.",
    });
  });

  it("rejects a prompt-sync webhook with an invalid signature", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-webhook-secret";

    const response = await request(promptsRouter, "/prompts/sync/github", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256:not-a-valid-signature",
      },
      body: JSON.stringify({ ref: "refs/heads/main" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid webhook signature.",
    });
  });

  it("keeps GitHub sync status public and read-only", async () => {
    const response = await request(apiApp, "/api/github-sync/status");

    expect(response.status).toBe(200);
  });

  it("keeps prompt sync status public and read-only", async () => {
    const response = await request(apiApp, "/api/prompts/sync/status");

    expect(response.status).toBe(200);
  });
});