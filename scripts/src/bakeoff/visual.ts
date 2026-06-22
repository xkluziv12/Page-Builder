import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * The true visual judge for the bake-off.
 *
 * Instead of comparing CSS design tokens (a weak proxy), this renders each
 * model's final HTML and the real reference page to PNG screenshots with a
 * headless Chromium, then scores how close they LOOK:
 *   - perceptual: pixel-diff similarity (pixelmatch) over identical-size shots
 *   - vision-LLM: an optional "how close does this look?" rating from Claude
 *
 * Screenshots are captured at a fixed viewport so every image has identical
 * dimensions and the pixel diff is directly comparable across models.
 */

/** Fixed capture frame — identical dims make pixelmatch directly comparable. */
export const SHOT_VIEWPORT = { width: 1280, height: 2400 } as const;

/** Resolve the Chromium binary (Nix store path moves, so resolve at runtime). */
function resolveChromium(): string {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }
  for (const cmd of ["chromium", "chromium-browser", "google-chrome", "chrome"]) {
    const found = spawnSync("which", [cmd], { encoding: "utf8" }).stdout?.trim();
    if (found && existsSync(found)) return found;
  }
  throw new Error(
    "Chromium not found. Install it (Nix `chromium`) or set CHROMIUM_PATH to a Chrome/Chromium binary.",
  );
}

/**
 * Renders HTML strings to fixed-size PNG screenshots with headless Chromium.
 * Launch once, render many, then close.
 */
export class ScreenshotRenderer {
  // playwright-core types are loaded lazily so the module imports cleanly even
  // when the browser isn't needed.
  private browser: import("playwright-core").Browser | null = null;

  async start(): Promise<void> {
    if (this.browser) return;
    const { chromium } = await import("playwright-core");
    this.browser = await chromium.launch({
      executablePath: resolveChromium(),
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars"],
    });
  }

  /** Render one HTML document to a fixed {@link SHOT_VIEWPORT}-sized PNG buffer. */
  async render(html: string): Promise<Buffer> {
    if (!this.browser) throw new Error("ScreenshotRenderer.start() must be called first.");
    const context = await this.browser.newContext({
      viewport: { ...SHOT_VIEWPORT },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    try {
      // Inline-render the document. External assets (images/fonts) may or may
      // not resolve in this environment — give them a chance, but never hang.
      await page.setContent(html, { waitUntil: "load", timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(800);
      const buf = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: SHOT_VIEWPORT.width, height: SHOT_VIEWPORT.height },
      });
      return buf;
    } finally {
      await context.close();
    }
  }

  async stop(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}

/**
 * Perceptual similarity (0-100) between two equal-size PNG screenshots.
 * 100 = pixel-identical; lower = more visually different.
 */
export function perceptualSimilarity(a: Buffer, b: Buffer): number {
  const ia = PNG.sync.read(a);
  const ib = PNG.sync.read(b);
  if (ia.width !== ib.width || ia.height !== ib.height) {
    throw new Error(
      `Screenshot dimensions differ (${ia.width}x${ia.height} vs ${ib.width}x${ib.height}); both must use SHOT_VIEWPORT.`,
    );
  }
  const { width, height } = ia;
  const diff = new PNG({ width, height });
  const numDiff = pixelmatch(ia.data, ib.data, diff.data, width, height, { threshold: 0.1 });
  const total = width * height;
  return Math.max(0, Math.min(100, Math.round((1 - numDiff / total) * 100)));
}

/**
 * Optional vision-LLM rating (0-100): asks Claude how visually close the model's
 * rendered page is to the real page. Returns null if the Anthropic integration
 * isn't configured or the call fails — the perceptual score still stands.
 */
export async function visionRating(
  modelPng: Buffer,
  refPng: Buffer,
  model = "claude-sonnet-4-6",
): Promise<number | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) return null;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 200,
      system:
        "You are a meticulous visual QA judge. You compare two screenshots of web pages and rate how visually similar they are — overall layout, section order, color palette, typography, spacing and visual density. Respond with ONLY a JSON object of the form {\"score\": <0-100 integer>, \"reason\": \"<one short sentence>\"} and nothing else. 100 means visually indistinguishable; 0 means completely different.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "REFERENCE (the real published page):" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: refPng.toString("base64") } },
            { type: "text", text: "CANDIDATE (a model's generated page):" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: modelPng.toString("base64") } },
            { type: "text", text: "How visually close is the CANDIDATE to the REFERENCE? Reply with the JSON object only." },
          ],
        },
      ],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { score?: unknown };
    const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score);
    if (!Number.isFinite(score)) return null;
    return Math.max(0, Math.min(100, Math.round(score)));
  } catch {
    return null;
  }
}

export interface VisualVerdict {
  /** Pixel-diff perceptual similarity (0-100). Always present. */
  pixel: number;
  /** Vision-LLM "how close does it look" rating (0-100), or null if unavailable. */
  llm: number | null;
  /** Combined headline visual score: mean of pixel + llm when llm is present. */
  combined: number;
}

/** Combine the perceptual + vision scores into one headline visual score. */
export function combineVisual(pixel: number, llm: number | null): VisualVerdict {
  const combined = llm == null ? pixel : Math.round((pixel + llm) / 2);
  return { pixel, llm, combined };
}

/** A model whose final HTML can be screenshotted and judged. */
export interface JudgeableModel {
  id: string;
  status: string;
  html: string | null;
}

export interface JudgeOptions {
  /** Absolute directory to write the PNG screenshots into. */
  outDir: string;
  /** Path prefix stored in results (relative to the viewer's public dir), e.g. "screenshots". */
  pathPrefix: string;
  /** Whether to also request the vision-LLM rating (needs the Anthropic integration). */
  vision: boolean;
}

export interface JudgeResult {
  /** Relative path to the rendered reference screenshot. */
  referenceScreenshot: string;
  /** Visual verdict per model id (only for successful models with HTML). */
  verdicts: Map<string, VisualVerdict>;
  /** Relative screenshot path per model id. */
  screenshots: Map<string, string>;
}

/**
 * Render the reference page + every successful model's HTML to screenshots,
 * write the PNGs to {@link JudgeOptions.outDir}, and score each model's visual
 * closeness to the reference (perceptual pixel-diff + optional vision-LLM).
 *
 * This is the heart of the "true visual judge": it actually looks at how the
 * pages render rather than diffing CSS tokens.
 */
export async function judgeVisual(
  models: JudgeableModel[],
  referenceHtml: string,
  opts: JudgeOptions,
): Promise<JudgeResult> {
  await mkdir(opts.outDir, { recursive: true });
  const renderer = new ScreenshotRenderer();
  await renderer.start();

  const verdicts = new Map<string, VisualVerdict>();
  const screenshots = new Map<string, string>();
  try {
    const refPng = await renderer.render(referenceHtml);
    const refRel = `${opts.pathPrefix}/reference.png`;
    await writeFile(join(opts.outDir, "reference.png"), refPng);

    for (const m of models) {
      if (m.status !== "ok" || !m.html) continue;
      const png = await renderer.render(m.html);
      const rel = `${opts.pathPrefix}/${m.id}.png`;
      await writeFile(join(opts.outDir, `${m.id}.png`), png);
      screenshots.set(m.id, rel);

      const pixel = perceptualSimilarity(png, refPng);
      const llm = opts.vision ? await visionRating(png, refPng) : null;
      verdicts.set(m.id, combineVisual(pixel, llm));
    }
    return { referenceScreenshot: refRel, verdicts, screenshots };
  } finally {
    await renderer.stop();
  }
}
