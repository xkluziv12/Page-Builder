import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, promptsTable } from "@workspace/db";
import {
  ListPromptsQueryParams,
  ListPromptsResponse,
  GetPromptParams,
  GetPromptResponse,
  UpdatePromptParams,
  UpdatePromptBody,
  UpdatePromptResponse,
  PublishPromptParams,
  PublishPromptBody,
  PublishPromptResponse,
} from "@workspace/api-zod";
import { requireAdmin, isAdminRequest } from "../middlewares/adminAuth";
import { publishPromptTargets } from "../lib/promptSync";
import { syncFromGit, getSyncStatus } from "../lib/gitSync";
import type { Prompt } from "@workspace/db";

const router: IRouter = Router();

/**
 * Hide unpublished draft text from non-admin (VA / public) readers: the `content`
 * field is the editable draft, so for ungated reads we replace it with the
 * published snapshot. VAs only ever receive published prompt content.
 */
function redactDraft(prompt: Prompt): Prompt {
  return { ...prompt, content: prompt.publishedContent ?? "" };
}

// Inbound auto-sync status (read-only, ungated — exposes no secrets).
router.get("/prompts/sync/status", (_req, res): void => {
  res.json(getSyncStatus());
});

// Manual, admin-gated full resync from the source-of-truth repo.
router.post(
  "/prompts/sync",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const summary = await syncFromGit({ force: true });
    res.status(summary.ok ? 200 : 502).json(summary);
  },
);

// GitHub push webhook → instant resync. If GITHUB_WEBHOOK_SECRET is set, the
// X-Hub-Signature-256 HMAC is verified against the raw body; otherwise the
// endpoint runs unauthenticated (it only triggers a read-only resync).
router.post("/prompts/sync/github", (req, res): void => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (secret) {
    const signature = req.get("x-hub-signature-256") ?? "";
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!raw) {
      res.status(400).json({ message: "Missing raw body for signature check." });
      return;
    }
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const valid =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      res.status(401).json({ message: "Invalid webhook signature." });
      return;
    }
  }
  // Acknowledge fast; run the sync in the background.
  res.status(202).json({ accepted: true });
  void syncFromGit({ force: true });
});

router.get("/prompts", async (req, res): Promise<void> => {
  const query = ListPromptsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: query.error.message });
    return;
  }

  const rows = query.data.brand
    ? await db
        .select()
        .from(promptsTable)
        .where(eq(promptsTable.brand, query.data.brand))
        .orderBy(asc(promptsTable.name))
    : await db
        .select()
        .from(promptsTable)
        .orderBy(asc(promptsTable.brand), asc(promptsTable.name));

  const visible = isAdminRequest(req) ? rows : rows.map(redactDraft);
  res.json(ListPromptsResponse.parse(visible));
});

router.get("/prompts/:id", async (req, res): Promise<void> => {
  const params = GetPromptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const [prompt] = await db
    .select()
    .from(promptsTable)
    .where(eq(promptsTable.id, params.data.id));

  if (!prompt) {
    res.status(404).json({ message: "Prompt not found." });
    return;
  }

  const visible = isAdminRequest(req) ? prompt : redactDraft(prompt);
  res.json(GetPromptResponse.parse(visible));
});

router.patch(
  "/prompts/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdatePromptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const body = UpdatePromptBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: body.error.message });
      return;
    }

    const [prompt] = await db
      .update(promptsTable)
      .set({
        content: body.data.content,
        ...(body.data.name ? { name: body.data.name } : {}),
        updatedAt: new Date(),
      })
      .where(eq(promptsTable.id, params.data.id))
      .returning();

    if (!prompt) {
      res.status(404).json({ message: "Prompt not found." });
      return;
    }

    res.json(UpdatePromptResponse.parse(prompt));
  },
);

router.post(
  "/prompts/:id/publish",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = PublishPromptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const body = PublishPromptBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ message: body.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(promptsTable)
      .where(eq(promptsTable.id, params.data.id));

    if (!existing) {
      res.status(404).json({ message: "Prompt not found." });
      return;
    }

    // Persist the content + bump version BEFORE syncing, so the DB copy is
    // never lost even if both external targets fail (targets stay retryable).
    const nextContent = body.data.content ?? existing.content;
    const [saved] = await db
      .update(promptsTable)
      .set({
        content: nextContent,
        version: existing.version + 1,
        publishedContent: nextContent,
        publishedVersion: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(promptsTable.id, existing.id))
      .returning();

    const outcome = await publishPromptTargets(saved!);

    res.json(
      PublishPromptResponse.parse({
        prompt: outcome.prompt,
        git: outcome.git,
        drive: outcome.drive,
      }),
    );
  },
);

export default router;
