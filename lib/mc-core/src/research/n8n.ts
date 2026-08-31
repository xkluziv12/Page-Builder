import type { EntityFlag, ResearchBrief } from "../types";
import type { ResearchInput, ResearchProvider } from "./provider";
import { makeProvenance } from "../engine/provenance";

export const MARK_AI_BRAIN_WEBHOOK =
  "https://stsrecycling.app.n8n.cloud/webhook/mark-ai-brain";

export type { ResearchInput };

/**
 * Coerce whatever shape the n8n workflow returns into a ResearchBrief. The
 * webhook is an external dependency we do not control, so we are defensive about
 * the response shape but still fail loudly on transport errors.
 */
function toBrief(data: unknown): ResearchBrief {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const summary =
      typeof obj.summary === "string"
        ? obj.summary
        : typeof obj.brief === "string"
          ? obj.brief
          : typeof obj.output === "string"
            ? obj.output
            : null;
    const entities = Array.isArray(obj.entities)
      ? (obj.entities as Record<string, unknown>[])
      : [];
    const sources = Array.isArray(obj.sources)
      ? (obj.sources as unknown[]).map(String)
      : [];
    const flags = Array.isArray(obj.flags) ? (obj.flags as EntityFlag[]) : [];
    return { summary, entities, sources, flags, raw: JSON.stringify(data), provenance: n8nProvenance() };
  }
  return {
    summary: typeof data === "string" ? data : null,
    entities: [],
    sources: [],
    flags: [],
    raw: typeof data === "string" ? data : JSON.stringify(data),
    provenance: n8nProvenance(),
  };
}

/** The n8n workflow is opaque to us: webhook transport, model unknown. */
function n8nProvenance() {
  return makeProvenance({
    sourceKind: "n8n-webhook",
    provider: null,
    model: null,
    transport: "webhook",
    requestedEngine: "n8n",
    engineMode: "webhook",
    phase: "research",
    candidate: "none",
    status: "success",
  });
}

/**
 * Call the M.A.R.K. research webhook. Plain JSON POST, no auth header. Throws on
 * any non-OK response so the research phase fails loudly rather than building a
 * page on missing intelligence.
 */
export async function fetchResearchBrief(input: ResearchInput): Promise<ResearchBrief> {
  const res = await fetch(MARK_AI_BRAIN_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: "STS Electronic Recycling",
      city: input.city,
      state: input.state,
      niche: input.niche,
      track: input.track,
      blogTopic: input.blogTopic ?? null,
      verifiedCid: input.verifiedCid ?? null,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Research webhook failed (${res.status} ${res.statusText}): ${body.slice(0, 500)}`,
    );
  }

  const text = await res.text();
  if (text.trim() === "") {
    throw new Error(
      "Research webhook returned an empty response. The M.A.R.K. brain produced no intelligence for this run; cannot build a page on missing research.",
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  let data: unknown = text;
  if (contentType.includes("application/json")) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return toBrief(data);
}

/**
 * The n8n-backed {@link ResearchProvider}. Wraps {@link fetchResearchBrief} so
 * the external `mark-ai-brain` webhook can still be selected as an explicit
 * fallback for the research phase. Not the default — see
 * `researchProviderFromEnv` in the api-server runtime.
 */
export class N8nResearchProvider implements ResearchProvider {
  readonly name = "n8n";

  research(input: ResearchInput): Promise<ResearchBrief> {
    return fetchResearchBrief(input);
  }
}
