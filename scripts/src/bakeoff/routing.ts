import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeGrokComplete,
  makeOpenAIComplete,
  type CompleteFn,
} from "./providers.js";

/**
 * The model registry + per-phase routing for the two ADDITIVE production modes
 * the operator drives in plain language:
 *
 *  - "run this through 1 llm"        → SINGLE engine (one named model runs every
 *                                      phase through the same pipeline; handled by
 *                                      runConversation, not this table).
 *  - "run this through the multi llm" → ROUTED: a MAIN model per phase + a BACKUP
 *                                      that auto-takes over when the main errors,
 *                                      refuses, or emits invalid output (no HTML /
 *                                      invalid JSON-LD). See ROUTING_TABLE below.
 *
 * The existing 6-model comparison (`run.ts`) is untouched ("all of them").
 */

export interface RoutedModel {
  id: string;
  label: string;
  provider: string;
  /** The concrete provider model tag actually called. */
  model: string;
  complete: CompleteFn;
}

export type RoutedPhase =
  | "grounding"
  | "build"
  | "seo"
  | "seo-verify"
  | "schema"
  | "verify-links";

export interface PhaseRoute {
  main: RoutedModel;
  backup: RoutedModel;
}

export type ResolvedRouting = Record<RoutedPhase, PhaseRoute>;

interface ModelDef {
  label: string;
  provider: string;
  kind: "claude" | "gemini" | "openai" | "grok";
  /** Fixed model tag; omitted for grok, which is discovered at runtime. */
  tag?: string;
}

/** Known models, keyed by the SAME ids the comparison run uses. */
const MODEL_DEFS: Record<string, ModelDef> = {
  claude: { label: "Claude Opus 4.8", provider: "Anthropic", kind: "claude", tag: "claude-opus-4-8" },
  gemini: { label: "Gemini 3.1 Pro", provider: "Google", kind: "gemini", tag: "gemini-3.1-pro-preview" },
  openai: { label: "OpenAI GPT-5.5-PRO", provider: "OpenAI", kind: "openai", tag: "gpt-5.5-pro" },
  "openai-std": { label: "OpenAI GPT-5.5", provider: "OpenAI", kind: "openai", tag: "gpt-5.5" },
  "openai-54": { label: "OpenAI GPT-5.4", provider: "OpenAI", kind: "openai", tag: "gpt-5.4" },
  grok: { label: "Grok (xAI)", provider: "xAI", kind: "grok" },
};

/**
 * The operator-approved per-phase routing: MAIN per phase, with OpenAI GPT-5.4
 * as the BACKUP across the board (their explicit instruction).
 *
 * Build/SEO → Claude (richest builder); SEO-verify → Gemini (live web search);
 * schema + link-verify → Grok (tested best/cheapest on schema); shared research
 * grounding → Claude. The backup steps in only when the main errors, refuses, or
 * returns invalid output for the phase.
 *
 * CAVEAT (documented, intentional): GPT-5.4 was the model that REFUSED No-GMB
 * BUILDS in testing. As the BUILD backup it is therefore reliable for GMB pages
 * but may still refuse under a No-GMB build — in which case the build fails
 * loudly (both main and backup unable to produce HTML), per the fail-loud rule.
 */
export const ROUTING_TABLE: Record<RoutedPhase, { main: string; backup: string }> = {
  grounding: { main: "claude", backup: "openai-54" },
  build: { main: "claude", backup: "openai-54" },
  seo: { main: "claude", backup: "openai-54" },
  "seo-verify": { main: "gemini", backup: "openai-54" },
  schema: { main: "grok", backup: "openai-54" },
  "verify-links": { main: "grok", backup: "openai-54" },
};

/** Friendly aliases the operator may type for the single-engine mode. */
const ALIASES: Record<string, string> = {
  chatgpt: "openai",
  gpt: "openai",
  "gpt-5.5-pro": "openai",
  openai: "openai",
  "gpt-5.4": "openai-54",
  "gpt5.4": "openai-54",
  openai54: "openai-54",
  "openai-54": "openai-54",
  "gpt-5.5": "openai-std",
  "openai-std": "openai-std",
  claude: "claude",
  anthropic: "claude",
  gemini: "gemini",
  google: "gemini",
  grok: "grok",
  xai: "grok",
};

/** Resolve a user-typed model name/alias to a known registry id (fail loud). */
export function resolveModelId(alias: string): string {
  const key = alias.trim().toLowerCase();
  const id = ALIASES[key] ?? (MODEL_DEFS[key] ? key : undefined);
  if (!id) {
    throw new Error(
      `Unknown model "${alias}". Known ids: ${Object.keys(MODEL_DEFS).join(", ")} ` +
        `(aliases: chatgpt/gpt → openai, gpt-5.4 → openai-54, anthropic → claude, google → gemini, xai → grok).`,
    );
  }
  return id;
}

function makeComplete(def: ModelDef, tag: string): CompleteFn {
  switch (def.kind) {
    case "claude":
      return makeClaudeComplete(tag);
    case "gemini":
      return makeGeminiComplete(tag);
    case "openai":
      return makeOpenAIComplete(tag);
    case "grok":
      return makeGrokComplete(tag);
  }
}

/**
 * Construct ONLY the requested models (so a single OpenAI run never needs the
 * xAI/Anthropic keys, and grok is discovered only when actually used). Each
 * adapter requires its own provider key at construction time and fails loud.
 */
export async function buildModelsForIds(ids: string[]): Promise<Map<string, RoutedModel>> {
  const unique = Array.from(new Set(ids));
  const reg = new Map<string, RoutedModel>();
  for (const id of unique) {
    const def = MODEL_DEFS[id];
    if (!def) throw new Error(`Unknown model id "${id}".`);
    const tag = def.kind === "grok" ? await discoverNewestGrok() : def.tag!;
    reg.set(id, { id, label: def.label, provider: def.provider, model: tag, complete: makeComplete(def, tag) });
  }
  return reg;
}

/** Unique model ids referenced by the routing table (main + backup). */
export function routedModelIds(): string[] {
  const ids = new Set<string>();
  for (const r of Object.values(ROUTING_TABLE)) {
    ids.add(r.main);
    ids.add(r.backup);
  }
  return Array.from(ids);
}

/** Bind the routing table's ids to constructed models (fail loud on a gap). */
export function resolveRouting(reg: Map<string, RoutedModel>): ResolvedRouting {
  const get = (id: string): RoutedModel => {
    const m = reg.get(id);
    if (!m) throw new Error(`Routing references model "${id}" not present in the registry.`);
    return m;
  };
  const out = {} as ResolvedRouting;
  for (const [phase, r] of Object.entries(ROUTING_TABLE) as [RoutedPhase, { main: string; backup: string }][]) {
    out[phase] = { main: get(r.main), backup: get(r.backup) };
  }
  return out;
}
