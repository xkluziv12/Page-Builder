import type { RunContext } from "../types";

/**
 * Format the live SEO intelligence block for an engine prompt. Returns "" when
 * no intel is attached so the prompt simply omits the section.
 */
export function describeSeoIntel(ctx: RunContext): string {
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

/**
 * Build the shared, provider-agnostic context block that every engine prompt
 * (build / audit / schema / chat-edit) embeds. Extracted here so both the
 * production ClaudeEngine and any out-of-tree experimental engine format the run
 * context identically — the prompt is the comparison's controlled variable.
 */
export function describeContext(ctx: RunContext): string {
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
