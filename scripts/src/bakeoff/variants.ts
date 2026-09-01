import { OPENAI_REASONING_EFFORT, isOpenAiReasoningTag } from "./providers.js";

/**
 * Model VARIANT identity for the bake-off.
 *
 * A "slot" used to be one model id per scenario (`gemini`, `openai`, ...), which
 * made two things impossible to record honestly:
 *
 *  1. Running the SAME provider/model at two reasoning-effort levels — both rows
 *     collapsed onto one id, so the second run silently overwrote the first.
 *  2. Telling a real low/medium run apart from a provider-default CONTROL run on
 *     a provider that has no effort knob at all (xAI Grok, DeepSeek v4).
 *
 * This module owns both: what effort levels a provider/tag genuinely accepts,
 * and how a requested variant turns into a collision-safe id. It is pure (no
 * network, no fs, no env beyond the already-exported OpenAI default) so the
 * rules below are unit-testable without touching a provider.
 */

/** Separator between a base model id and its effort suffix. Chosen to be safe in
 * a URL path segment, a filename (screenshots / transcripts are named after the
 * id), and a JSON key, and to never appear in an existing base id — so legacy
 * ids round-trip through {@link baseIdOf} unchanged. */
export const VARIANT_SEPARATOR = ".";

/** The base model id behind a variant id (`gemini-flash.low` -> `gemini-flash`).
 * Legacy ids (no separator) are returned unchanged. */
export function baseIdOf(id: string): string {
  const idx = id.indexOf(VARIANT_SEPARATOR);
  return idx === -1 ? id : id.slice(0, idx);
}

/** Compose a variant id. No effort -> the bare base id, so every pre-existing
 * result id (and its recorded screenshot/transcript path) stays valid. */
export function variantId(baseId: string, effort?: string | null): string {
  return effort ? `${baseId}${VARIANT_SEPARATOR}${effort}` : baseId;
}

/**
 * What a provider/tag genuinely exposes as a reasoning-effort control.
 *
 * `defaultEffort` is what {@link ModelResult.effort} must record when NO explicit
 * effort was requested, using the vocabulary already in the dataset:
 *  - a concrete level  — the adapter ALWAYS sends this value even unasked
 *                        (OpenAI's reasoning tier)
 *  - "provider-default" — the adapter sends no effort knob; the provider picks
 *  - "not-applicable"   — the tag exists but is not on an effort-gated tier
 *  - "not-supported"    — the provider has no effort control at all
 */
export interface EffortCapability {
  /** True only when a real, provider-accepted effort knob exists for this tag. */
  supported: boolean;
  /** Levels the provider's API actually accepts. Empty when unsupported. */
  levels: string[];
  /** Value to record when nothing was requested. */
  defaultEffort: string;
  /** Operator-facing explanation, reused verbatim in fail-loud messages. */
  reason: string;
}

/**
 * Resolve the effort capability for one provider/tag pair.
 *
 * Every entry mirrors what the matching adapter in `providers.ts` does, so this
 * can never claim a knob the adapter would refuse to send:
 *  - Anthropic / Google: an optional extended-thinking / thinking budget keyed by
 *    low|medium|high (`CLAUDE_THINKING_BUDGETS` / `GEMINI_THINKING_BUDGETS`).
 *    Unasked, the call carries no knob at all -> "provider-default".
 *  - OpenAI: only the reasoning-gated tags ("pro"/"luna") take `reasoning.effort`,
 *    and that API REJECTS "low" (medium|high|xhigh only). Those tags are always
 *    called with an explicit effort, so the unasked default is the configured
 *    `OPENAI_REASONING_EFFORT`, not "provider-default". Non-reasoning tags (e.g.
 *    `gpt-5.6-terra`) take no effort at all -> "not-applicable".
 *  - xAI Grok / DeepSeek v4: NO effort knob exists on these endpoints. Both
 *    adapters throw on an effort override rather than pretend, so a run of these
 *    is a single provider-default CONTROL cell, never a "low"/"medium" cell.
 */
export function effortCapability(provider: string, modelTag: string): EffortCapability {
  switch (provider.trim().toLowerCase()) {
    case "anthropic":
      return {
        supported: true,
        levels: ["low", "medium", "high"],
        defaultEffort: "provider-default",
        reason: "Anthropic extended thinking accepts a low/medium/high token budget",
      };
    case "google":
      return {
        supported: true,
        levels: ["low", "medium", "high"],
        defaultEffort: "provider-default",
        reason: "Gemini thinkingConfig accepts a low/medium/high thinking budget",
      };
    case "openai":
      return isOpenAiReasoningTag(modelTag)
        ? {
            supported: true,
            levels: ["medium", "high", "xhigh"],
            defaultEffort: OPENAI_REASONING_EFFORT,
            reason:
              `OpenAI reasoning-tier tag "${modelTag}" accepts reasoning.effort = medium|high|xhigh ` +
              `("low" is rejected by the API)`,
          }
        : {
            supported: false,
            levels: [],
            defaultEffort: "not-applicable",
            reason: `OpenAI tag "${modelTag}" is not on the reasoning-effort-gated tier, so it takes no reasoning.effort`,
          };
    case "xai":
      return {
        supported: false,
        levels: [],
        defaultEffort: "not-supported",
        reason: "xAI's Grok API exposes no effort/reasoning-budget knob",
      };
    case "deepseek":
      return {
        supported: false,
        levels: [],
        defaultEffort: "not-supported",
        reason: "DeepSeek's v4 API exposes no effort/reasoning-budget knob on this endpoint",
      };
    default:
      return {
        supported: false,
        levels: [],
        defaultEffort: "not-supported",
        reason: `no effort control is known for provider "${provider}"`,
      };
  }
}

/** A model slot the harness knows how to drive, before any variant is applied. */
export interface BaseModelSpec {
  id: string;
  label: string;
  provider: string;
  model: string;
}

/** One requested cell of the run matrix. */
export interface VariantRequest {
  /** Which base slot to run. */
  baseId: string;
  /** Requested reasoning effort. Omit for a provider-default / control cell. */
  effort?: string;
  /** Swap the provider tag for this cell only. */
  model?: string;
  /** Override the display label for this cell only. */
  label?: string;
  /**
   * Pin the recorded result id instead of deriving `<baseId>.<effort>`. Used by
   * the legacy `BAKEOFF_MODEL_OVERRIDES` path so ids already present in
   * `results.json` (and in every archived snapshot) keep resuming.
   */
  id?: string;
}

/** A fully resolved matrix cell: a collision-safe identity plus the truthful
 * effort provenance to record on the result. */
export interface ResolvedVariant {
  /** Result id, unique within a scenario. */
  id: string;
  /** Base slot this cell belongs to, so the UI can still group by model family. */
  baseId: string;
  label: string;
  provider: string;
  model: string;
  /** What the operator asked for; null when nothing was requested. */
  effortRequested: string | null;
  /** What to record as APPLIED — see {@link EffortCapability.defaultEffort}. */
  effort: string;
  /** Whether a real effort knob exists for this provider/tag at all. */
  effortSupported: boolean;
  /** Value handed to the provider adapter. `undefined` = send no effort knob. */
  effortArg: string | undefined;
}

/**
 * Turn requested matrix cells into resolved variants, or FAIL LOUD.
 *
 * The failures are the point — each one is a case where a run would otherwise
 * have produced a misleading dataset:
 *  - unknown base id                -> a silently dropped cell
 *  - effort on a knob-less provider -> a provider-default control run mislabelled
 *                                      as "low"/"medium"
 *  - effort outside the accepted set -> an API-rejected request surfacing later as
 *                                      a mysterious run error
 *  - duplicate id                    -> the second cell overwriting the first
 *  - duplicate effective config      -> two rows claiming different effort levels
 *                                      while having sent the provider the exact
 *                                      same request
 */
export function resolveVariants(
  bases: BaseModelSpec[],
  requests: VariantRequest[],
): ResolvedVariant[] {
  const byId = new Map(bases.map((b) => [b.id, b]));
  const resolved: ResolvedVariant[] = [];
  const seenIds = new Map<string, string>();
  const seenConfigs = new Map<string, string>();

  for (const req of requests) {
    const base = byId.get(req.baseId);
    if (!base) {
      throw new Error(
        `Variant references unknown model id "${req.baseId}" (known: ${[...byId.keys()].join(", ")}).`,
      );
    }
    const model = req.model?.trim() || base.model;
    const cap = effortCapability(base.provider, model);
    const requestedEffort = req.effort?.trim() || null;

    if (requestedEffort && !cap.supported) {
      throw new Error(
        `Variant "${req.baseId}" requested effort "${requestedEffort}" for ${model}, but ${cap.reason}. ` +
          `Run it as ONE provider-default control cell (omit "effort") instead — recording an ` +
          `unchanged control run as a low/medium tier would be a false comparison.`,
      );
    }
    if (requestedEffort && !cap.levels.includes(requestedEffort)) {
      throw new Error(
        `Variant "${req.baseId}" requested effort "${requestedEffort}" for ${model}, which the provider ` +
          `does not accept (${cap.reason}; accepted: ${cap.levels.join(", ")}).`,
      );
    }

    const id = req.id?.trim() || variantId(base.id, requestedEffort);
    const previousId = seenIds.get(id);
    if (previousId) {
      throw new Error(
        `Two variants resolve to the same result id "${id}" (${previousId} and ${req.baseId}). ` +
          `Give one an explicit effort or a distinct "id" — otherwise the second would overwrite the first.`,
      );
    }
    seenIds.set(id, req.baseId);

    const effort = requestedEffort ?? cap.defaultEffort;
    const configKey = `${base.id}|${model}|${effort}`;
    const previousConfig = seenConfigs.get(configKey);
    if (previousConfig) {
      throw new Error(
        `Variants "${previousConfig}" and "${id}" send ${model} the IDENTICAL request (effort: ${effort}), ` +
          `so they cannot be reported as two different effort levels.`,
      );
    }
    seenConfigs.set(configKey, id);

    resolved.push({
      id,
      baseId: base.id,
      label: req.label?.trim() || base.label,
      provider: base.provider,
      model,
      effortRequested: requestedEffort,
      effort,
      effortSupported: cap.supported,
      effortArg: requestedEffort ?? undefined,
    });
  }

  return resolved;
}

/** Parse `BAKEOFF_VARIANTS` — a JSON array of {@link VariantRequest}. Returns an
 * empty array when unset, and fails loud on anything malformed rather than
 * quietly running a smaller matrix than the operator asked for. */
export function parseVariantEnv(raw: string | undefined): VariantRequest[] {
  const text = raw?.trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `BAKEOFF_VARIANTS is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`BAKEOFF_VARIANTS must be a JSON ARRAY of { baseId, effort?, model?, label?, id? }.`);
  }
  return parsed.map((entry, i) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`BAKEOFF_VARIANTS[${i}] must be an object.`);
    }
    const { baseId, effort, model, label, id } = entry as Record<string, unknown>;
    if (typeof baseId !== "string" || !baseId.trim()) {
      throw new Error(`BAKEOFF_VARIANTS[${i}].baseId must be a non-empty string.`);
    }
    for (const [key, value] of Object.entries({ effort, model, label, id })) {
      if (value !== undefined && typeof value !== "string") {
        throw new Error(`BAKEOFF_VARIANTS[${i}].${key} must be a string when present.`);
      }
    }
    return {
      baseId: baseId.trim(),
      effort: effort as string | undefined,
      model: model as string | undefined,
      label: label as string | undefined,
      id: id as string | undefined,
    };
  });
}
