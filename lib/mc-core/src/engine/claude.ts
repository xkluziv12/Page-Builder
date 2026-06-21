import type Anthropic from "@anthropic-ai/sdk";
import type { RunContext } from "../types";
import { pageBuilderPrompt, schemaGeneratorPrompt, seoAuditPrompt } from "../prompts";
import type { AIEngine, EngineResult } from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 16000;

/** Extract plain text from an Anthropic message response. */
function textFrom(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Strip a leading/trailing ```html / ```json code fence if present. */
function unfence(raw: string): string {
  const fence = raw.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence && fence[1]) return fence[1].trim();
  return raw.trim();
}

function describeSeoIntel(ctx: RunContext): string {
  const intel = ctx.seoIntel;
  if (!intel) return "";
  const lines: string[] = [];
  if (intel.primaryKeyword) {
    const k = intel.primaryKeyword;
    lines.push(
      `Primary keyword: ${k.keyword} (volume: ${k.searchVolume ?? "n/a"}, difficulty: ${k.difficulty ?? "n/a"})`,
    );
  }
  const related = intel.relatedKeywords
    .slice(0, 12)
    .map((k) => (k.searchVolume != null ? `${k.keyword} (${k.searchVolume})` : k.keyword));
  if (related.length) lines.push(`Related keywords: ${related.join(", ")}`);
  if (intel.peopleAlsoAsk.length)
    lines.push(`People also ask (cover these):\n- ${intel.peopleAlsoAsk.join("\n- ")}`);
  const competitors = intel.topCompetitors
    .slice(0, 5)
    .map((c) => `- ${c.title} (${c.link})`);
  if (competitors.length) lines.push(`Top organic competitors:\n${competitors.join("\n")}`);
  lines.push(
    `SERP signals: ${intel.localPackCount} local-pack, ${intel.adsCount} ads, competition ${intel.competition} (score ${intel.competitionScore}).`,
  );
  return `\n\nLive SEO intelligence (use to target keywords and content gaps):\n${lines.join("\n")}`;
}

function describeContext(ctx: RunContext): string {
  const brief = ctx.researchBrief?.summary
    ? `\n\nResearch brief:\n${ctx.researchBrief.summary}`
    : "";
  const seo = describeSeoIntel(ctx);
  const handoff = ctx.handoff ? `\n\nHandoff notes:\n${ctx.handoff}` : "";
  const urls = ctx.existingUrls.length
    ? `\n\nExisting URLs to interlink:\n${ctx.existingUrls.join("\n")}`
    : "";
  const sacred = ctx.registry.sacredLinks
    .map((l) => `- ${l.label}: ${l.url}`)
    .join("\n");
  return [
    `City: ${ctx.city}, ${ctx.state}`,
    `Track: ${ctx.track}`,
    `Page type: ${ctx.pageType}`,
    `Classification: ${ctx.classification}`,
    `Competition: ${ctx.competition}`,
    `Niche: ${ctx.niche}`,
    ctx.blogTopic ? `Blog topic: ${ctx.blogTopic}` : "",
    `Base domain: ${ctx.registry.baseDomain}`,
    `Required sacred equipment links:\n${sacred}`,
    `Word-count floor: ${ctx.registry.wordCountFloor}`,
    brief,
    seo,
    handoff,
    urls,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The Claude implementation of the AIEngine seam. It owns ALL Anthropic-specific
 * concerns (model name, prompt selection, response parsing). The pipeline talks
 * to it only through the AIEngine interface.
 */
export class ClaudeEngine implements AIEngine {
  readonly name = "claude";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(client: Anthropic, model: string = DEFAULT_MODEL) {
    this.client = client;
    this.model = model;
  }

  private async complete(system: string, user: string): Promise<EngineResult> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    const raw = textFrom(message);
    return { content: unfence(raw), raw };
  }

  buildPage(ctx: RunContext): Promise<EngineResult> {
    return this.complete(
      pageBuilderPrompt,
      `Build the page for the following job:\n\n${describeContext(ctx)}`,
    );
  }

  auditPage(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    return this.complete(
      seoAuditPrompt,
      `Audit and improve the following page. Return the full corrected HTML.\n\nContext:\n${describeContext(
        ctx,
      )}\n\nCurrent HTML:\n${currentHtml}`,
    );
  }

  generateSchema(ctx: RunContext, currentHtml: string): Promise<EngineResult> {
    return this.complete(
      schemaGeneratorPrompt,
      `Generate JSON-LD schema for the following page.\n\nContext:\n${describeContext(
        ctx,
      )}\n\nPage HTML:\n${currentHtml}`,
    );
  }

  chatEdit(ctx: RunContext, currentHtml: string, instruction: string): Promise<EngineResult> {
    return this.complete(
      pageBuilderPrompt,
      `Apply this edit instruction to the page and return the full updated HTML.\n\nInstruction:\n${instruction}\n\nContext:\n${describeContext(
        ctx,
      )}\n\nCurrent HTML:\n${currentHtml}`,
    );
  }
}
