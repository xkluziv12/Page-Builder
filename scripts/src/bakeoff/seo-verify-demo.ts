import { readFile } from "node:fs/promises";
import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeGrokComplete,
  type ChatMessage,
  type CompleteFn,
} from "./providers.js";
import { ARTIFACT_TO_INLINE_OPTIONAL, seoVerifyPrompt, type PromptVars } from "./miniPrompts.js";
import { tryExtractHtmlDocument } from "./extract.js";
import { loadReferenceHtml, resolveTarget } from "./target.js";

/**
 * Cheap, single-turn DEMO of the live-web-search SEO-verify capability: instead
 * of running the whole bake-off pipeline, it loads an already-built HTML page,
 * seeds it into the chat as the prior "build" turn, and sends the EXACT
 * seoVerifyPrompt() with web search switched ON — exactly as the real run does
 * at the seo-verify step. Prints the model's report so you can see the live
 * search + MODERN SEO SCORE in action without re-running every model/turn.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run bakeoff:seo-verify-demo
 *   SEO_DEMO_MODEL=gemini SEO_DEMO_HTML=/path/to/page.html pnpm ... run bakeoff:seo-verify-demo
 */
const TARGET = resolveTarget();

function promptVars(): PromptVars {
  return {
    city: TARGET.city,
    state: TARGET.state,
    url: TARGET.url,
    niche: TARGET.niche,
    pageName: `${TARGET.city} ${TARGET.niche}`,
    hubSpoke: "",
  };
}

async function pickModel(id: string): Promise<{ label: string; complete: CompleteFn }> {
  switch (id) {
    case "claude":
      return { label: "Claude Opus 4.8", complete: makeClaudeComplete("claude-opus-4-8") };
    case "gemini":
      return { label: "Gemini 3.1 Pro", complete: makeGeminiComplete("gemini-3.1-pro-preview") };
    case "openai":
      return { label: "OpenAI gpt-5.5", complete: makeOpenAIComplete("gpt-5.5") };
    case "grok": {
      const tag = await discoverNewestGrok();
      return { label: `Grok (${tag})`, complete: makeGrokComplete(tag) };
    }
    default:
      throw new Error(`Unknown SEO_DEMO_MODEL=${id} (use: claude | gemini | openai | grok).`);
  }
}

async function main(): Promise<void> {
  const modelId = (process.env.SEO_DEMO_MODEL ?? "claude").trim();
  const htmlPath = process.env.SEO_DEMO_HTML?.trim();

  // The page under review: an explicit SEO_DEMO_HTML wins; otherwise pull the
  // per-target reference page (checked-in fixture or a live fetch of the target
  // URL) so the demo works for ANY city, not just the Billings fixture.
  let html: string;
  let pageSource: string;
  if (htmlPath) {
    html = await readFile(htmlPath, "utf8");
    pageSource = htmlPath;
  } else {
    const reference = await loadReferenceHtml(TARGET);
    if (!reference.html.trim()) {
      throw new Error(
        `No page to review for ${TARGET.city}, ${TARGET.state}: no reference fixture and live fetch of ` +
          `${TARGET.url} failed. Set SEO_DEMO_HTML=/path/to/page.html to supply one.`,
      );
    }
    html = reference.html;
    pageSource = `${reference.source} (${TARGET.url})`;
  }

  const { label, complete } = await pickModel(modelId);
  console.log(`SEO-verify demo → ${label}`);
  console.log(`Target: ${TARGET.city}, ${TARGET.state} — ${TARGET.url}`);
  console.log(`Page under review: ${pageSource} (${html.length} chars)`);
  console.log(`Live web search: ON (this turn only)\n`);

  // Seed the chat exactly as the pipeline reaches seo-verify: the built page is
  // the prior assistant turn, then we send the verbatim seo-verify prompt.
  const messages: ChatMessage[] = [
    { role: "user", content: "Build the landing page now. Output the complete HTML artifact." },
    { role: "assistant", content: html },
  ];
  messages.push({ role: "user", content: seoVerifyPrompt(promptVars()) + ARTIFACT_TO_INLINE_OPTIONAL });

  const t0 = Date.now();
  const res = await complete(messages, undefined, { webSearch: true });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`=== ${label} reply (${secs}s, ${res.raw.length} chars) ===\n`);
  console.log(res.raw);

  const updated = tryExtractHtmlDocument(res.raw);
  console.log(
    `\n=== summary ===\nUpdated HTML emitted: ${updated ? `yes (${updated.length} chars)` : "no"}`,
  );
}

main().catch((err) => {
  console.error("seo-verify demo failed:", err);
  process.exitCode = 1;
});
