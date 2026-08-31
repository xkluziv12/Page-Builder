import type { ResearchBrief } from "../types";
import type { ResearchInput, ResearchProvider } from "./provider";
import type { GroundedResearchFn } from "./perplexity";
import type { EntityFetchFn } from "./entities";
import { makeProvenance } from "../engine/provenance";

/** A function that structures grounded research text into a JSON brief string. */
export type SynthesizeFn = (system: string, user: string) => Promise<string>;

export interface DirectResearchDeps {
  /** Web-grounded research (e.g. Perplexity): prose + citations. */
  groundedResearch: GroundedResearchFn;
  /** Entity grounding (e.g. SerpAPI): candidate local entities. */
  fetchEntities: EntityFetchFn;
  /** Structuring LLM (e.g. Claude/Gemini): coerce grounded text into JSON. */
  synthesize: SynthesizeFn;
  /** Provider/model labels for the synthesis LLM, for accurate provenance only. */
  synthesizeProvider?: string;
  synthesizeModel?: string;
}

const SYNTHESIS_SYSTEM = [
  "You convert web-grounded local-market research into a strict JSON research brief.",
  "Output ONLY a JSON object — no prose, no markdown fences — with this exact shape:",
  '{ "summary": string, "entities": Array<{ "name": string, "employeeCount"?: string|number, "source"?: string, "verified"?: boolean }>, "sources": string[] }',
  "Rules:",
  "- summary: a tight local-market overview useful for building an SEO page.",
  "- entities: the local employers/competitors found in the research and the provided SERP list. Include employeeCount ONLY when the research gives a figure, and set source to the citation it came from. Do not invent counts.",
  "- Never fabricate sources or figures. If a figure is estimated, append \"(estimated)\" to its value.",
  "- sources: the citation URLs that back the brief.",
].join("\n");

function unfence(raw: string): string {
  const fence = raw.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence && fence[1]) return fence[1].trim();
  return raw.trim();
}

interface ParsedBrief {
  summary: string;
  entities: Record<string, unknown>[];
  sources: string[];
}

/**
 * Parse the synthesis LLM's JSON into the brief fields. Fails loudly on an
 * empty, non-JSON, or summary-less response so the research phase never emits a
 * partial or placeholder brief.
 */
function parseBriefJson(raw: string): ParsedBrief {
  const text = unfence(raw);
  if (!text) {
    throw new Error("Research synthesis returned an empty response; cannot build on missing research.");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Research synthesis returned malformed JSON: ${text.slice(0, 300)}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Research synthesis did not return a JSON object.");
  }
  const obj = data as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (!summary) {
    throw new Error("Research synthesis returned no summary; cannot build a page on missing research.");
  }
  const entities = Array.isArray(obj.entities)
    ? (obj.entities.filter((e) => e && typeof e === "object") as Record<string, unknown>[])
    : [];
  const sources = Array.isArray(obj.sources) ? (obj.sources as unknown[]).map(String).filter(Boolean) : [];
  return { summary, entities, sources };
}

function buildSynthesisUser(
  input: ResearchInput,
  groundedContent: string,
  entitySeeds: Record<string, unknown>[],
): string {
  const seeds = entitySeeds.length
    ? entitySeeds.map((e) => `- ${String(e.name)}${e.source ? ` (${String(e.source)})` : ""}`).join("\n")
    : "(none)";
  return [
    `Locality: ${input.city}, ${input.state} — niche: ${input.niche}, track: ${input.track}.`,
    input.blogTopic ? `Blog topic: ${input.blogTopic}.` : "",
    "\nWeb-grounded research:\n" + groundedContent,
    "\nLive SERP competitors (entity seeds):\n" + seeds,
    "\nReturn the JSON research brief now.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The direct-API {@link ResearchProvider}. It replaces the n8n `mark-ai-brain`
 * webhook with in-app calls: web-grounded research + citations (Perplexity),
 * live entity seeds (SerpAPI), and a structuring LLM (Claude/Gemini) that coerces
 * the result into the SAME {@link ResearchBrief} shape the rest of the pipeline
 * consumes. All external calls are injected so the provider is fully unit-
 * testable. Every step fails loudly rather than emitting a placeholder brief.
 */
export class DirectResearchProvider implements ResearchProvider {
  readonly name = "direct";
  private readonly deps: DirectResearchDeps;

  constructor(deps: DirectResearchDeps) {
    this.deps = deps;
  }

  async research(input: ResearchInput): Promise<ResearchBrief> {
    const grounded = await this.deps.groundedResearch(input);
    if (!grounded.content.trim()) {
      throw new Error("Web-grounded research returned no content; cannot build on missing research.");
    }
    const entitySeeds = await this.deps.fetchEntities(input);
    const rawSynthesis = await this.deps.synthesize(
      SYNTHESIS_SYSTEM,
      buildSynthesisUser(input, grounded.content, entitySeeds),
    );
    const parsed = parseBriefJson(rawSynthesis);

    const sources = Array.from(
      new Set([
        ...grounded.citations,
        ...parsed.sources,
        ...entitySeeds.map((e) => (typeof e.source === "string" ? e.source : "")).filter(Boolean),
      ]),
    );

    return {
      summary: parsed.summary,
      entities: parsed.entities,
      sources,
      flags: [],
      raw: JSON.stringify({ grounded, entitySeeds, synthesis: rawSynthesis }),
      provenance: makeProvenance({
        sourceKind: "direct-api",
        provider: this.deps.synthesizeProvider ?? null,
        model: this.deps.synthesizeModel ?? null,
        transport: "sdk",
        requestedEngine: "direct-research",
        engineMode: "direct",
        phase: "research",
        candidate: "none",
        status: "success",
      }),
    };
  }
}
