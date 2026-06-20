import type { JoomlaMeta, RunContext } from "../types";
import { stripTags } from "../checkers/text";

/**
 * Deterministic LocalBusiness JSON-LD fallback. The primary schema path goes
 * through the AIEngine (master schema prompt), but this gives the pipeline a
 * guaranteed-valid schema if the engine output cannot be parsed.
 */
export function generateLocalBusinessSchema(ctx: RunContext): string {
  const name = `STS Electronic Recycling — ${ctx.city}, ${ctx.state}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    url: ctx.registry.baseDomain,
    areaServed: { "@type": "City", name: ctx.city },
    address: {
      "@type": "PostalAddress",
      addressLocality: ctx.city,
      addressRegion: ctx.state,
      addressCountry: "US",
    },
    makesOffer: ctx.registry.sacredLinks.map((l) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: l.label, url: l.url },
    })),
  };
  return JSON.stringify(schema, null, 2);
}

/** Validate that a string is parseable JSON-LD. Returns null if invalid. */
export function parseSchema(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

/** Derive Joomla publishing metadata from the page HTML. */
export function deriveJoomlaMeta(html: string, ctx: RunContext): JoomlaMeta {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const descMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
  );
  const title =
    (titleMatch && stripTags(titleMatch[1]).trim()) ||
    (h1Match && stripTags(h1Match[1]).trim()) ||
    `Electronics Recycling in ${ctx.city}, ${ctx.state}`;
  const description = descMatch
    ? descMatch[1].trim()
    : stripTags(html).trim().slice(0, 160);
  const alias = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return {
    title,
    description,
    keywords: `electronics recycling, ${ctx.city}, ${ctx.state}, ${ctx.niche}`,
    alias,
  };
}
