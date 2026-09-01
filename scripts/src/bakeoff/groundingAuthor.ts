import {
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeGrokComplete,
  makeDeepSeekComplete,
  type CompleteFn,
} from "./providers.js";

/**
 * Who authors the ONE shared research grounding.
 *
 * The harness used to hard-wire that job to `makeClaudeComplete(CLAUDE_MODEL)`,
 * so ANTHROPIC_API_KEY was a hard prerequisite for ANY first run against a new
 * target, even when every participating cell was on another provider. A run
 * against a fresh city with no Anthropic key therefore died before the first
 * model cell, with a bare "ANTHROPIC_API_KEY is not set".
 *
 * This module makes the author an explicit, env-selected choice instead. What it
 * deliberately does NOT do:
 *
 *  - It does not fall back. An unknown provider, or a selected provider whose
 *    credential is absent, FAILS LOUD. Silently switching authors would change
 *    the research input for every model while looking identical in the output.
 *  - It does not change the grounding contract. Exactly one brief is authored,
 *    once, and handed byte-identically to every cell. Which model wrote it is
 *    recorded in the provenance `source` string, never in the shared content, so
 *    no cell can tell who authored its brief.
 *  - It does not construct anything eagerly. Every adapter factory calls
 *    `requireEnv` at construction time, so building the whole registry up front
 *    would reintroduce the exact startup abort this replaces. `make()` is called
 *    only when a grounding actually has to be authored.
 *
 * Authoring the shared brief with a participating model is the pre-existing
 * design (Claude was both author and a competitor); selecting a different
 * participating model changes nothing about that fairness property, because the
 * output is one identical input handed to all cells.
 */

/** One selectable grounding author. `make` is a provider factory from
 * `providers.ts` — a direct SDK/API-key adapter, no proxy or router. */
export interface GroundingAuthorOption {
  /** Display provider name, matching the `provider` field used on model rows. */
  provider: string;
  /** Model tag used when `BAKEOFF_GROUNDING_MODEL` is not set. */
  defaultModel: string;
  /** Environment variable holding this provider's own API key. */
  credentialEnv: string;
  /** Direct-provider adapter factory. Calls `requireEnv` when invoked. */
  make: (model: string) => CompleteFn;
}

/**
 * Selectable authors, keyed by the lowercase token an operator puts in
 * `BAKEOFF_GROUNDING_PROVIDER`. Every entry is a direct provider integration
 * reading this project's own key from the environment.
 */
export const GROUNDING_AUTHORS: Record<string, GroundingAuthorOption> = {
  anthropic: {
    provider: "Anthropic",
    defaultModel: "claude-sonnet-5",
    credentialEnv: "ANTHROPIC_API_KEY",
    make: (model) => makeClaudeComplete(model),
  },
  google: {
    provider: "Google",
    defaultModel: "gemini-3.7-flash",
    credentialEnv: "GEMINI_API_KEY",
    make: (model) => makeGeminiComplete(model),
  },
  openai: {
    provider: "OpenAI",
    defaultModel: "gpt-5.6-terra",
    credentialEnv: "OPENAI_API_KEY",
    make: (model) => makeOpenAIComplete(model),
  },
  xai: {
    provider: "xAI",
    defaultModel: "grok-4.5",
    credentialEnv: "XAI_API_KEY",
    make: (model) => makeGrokComplete(model),
  },
  deepseek: {
    provider: "DeepSeek",
    defaultModel: "deepseek-v4-pro",
    credentialEnv: "Deepseek",
    make: (model) => makeDeepSeekComplete(model),
  },
};

/** The historical author. Unset env reproduces the pre-existing Claude behaviour
 * exactly, including which credential the run requires. */
export const DEFAULT_GROUNDING_AUTHOR = "anthropic";

export interface ResolvedGroundingAuthor {
  /** Registry key actually selected (`anthropic`, `google`, ...). */
  key: string;
  provider: string;
  model: string;
  credentialEnv: string;
  /** True when neither grounding env var was set (historical default path). */
  isDefault: boolean;
  /** Provenance fragment recorded on the grounding's `source` string. */
  label: string;
  /**
   * Build the adapter. DEFERRED: constructing it calls `requireEnv`, so this is
   * invoked only at the moment a grounding must actually be authored. A run that
   * reuses the grounding already recorded in results.json never touches any
   * provider credential.
   */
  make: () => CompleteFn;
}

/** Presence-only credential check for the SELECTED author. Never reads or
 * reports the value. */
export function assertGroundingCredential(
  env: Record<string, string | undefined>,
  option: Pick<GroundingAuthorOption, "provider" | "credentialEnv">,
  model: string,
): void {
  const value = env[option.credentialEnv];
  if (!value || !value.trim()) {
    throw new Error(
      `Shared grounding author is ${option.provider} ${model}, but ${option.credentialEnv} is not set. ` +
        `Set that key, or select an author whose credential IS configured with ` +
        `BAKEOFF_GROUNDING_PROVIDER=<${Object.keys(GROUNDING_AUTHORS).join("|")}>. ` +
        `The harness will not fall back to another provider on its own, because that would ` +
        `silently change the research input handed to every model.`,
    );
  }
}

/**
 * Resolve the shared-grounding author from the environment, or FAIL LOUD.
 *
 * Selection is validated here (pure string work, no credentials, no network) so
 * a typo aborts the run immediately rather than after the first provider call.
 * The credential check lives inside {@link ResolvedGroundingAuthor.make} so a
 * missing key for an UNRELATED provider can never abort startup.
 *
 * @param env             Environment to read (injected so this is testable).
 * @param defaultModel    Model tag for the historical default author, supplied
 *                        by `run.ts` so the Claude tag has exactly one
 *                        definition. Ignored once a provider is named.
 */
export function resolveGroundingAuthor(
  env: Record<string, string | undefined>,
  defaultModel?: string,
): ResolvedGroundingAuthor {
  const rawProvider = env.BAKEOFF_GROUNDING_PROVIDER?.trim() ?? "";
  const rawModel = env.BAKEOFF_GROUNDING_MODEL?.trim() ?? "";

  if (rawModel && !rawProvider) {
    throw new Error(
      `BAKEOFF_GROUNDING_MODEL="${rawModel}" was set without BAKEOFF_GROUNDING_PROVIDER. ` +
        `Name the provider explicitly (one of: ${Object.keys(GROUNDING_AUTHORS).join(", ")}) so the tag ` +
        `is dispatched to the adapter it belongs to and the recorded provenance cannot be wrong.`,
    );
  }

  const key = rawProvider ? rawProvider.toLowerCase() : DEFAULT_GROUNDING_AUTHOR;
  const option = GROUNDING_AUTHORS[key];
  if (!option) {
    throw new Error(
      `BAKEOFF_GROUNDING_PROVIDER="${rawProvider}" is not a known shared-grounding author ` +
        `(known: ${Object.keys(GROUNDING_AUTHORS).join(", ")}).`,
    );
  }

  const fallbackModel =
    !rawProvider && defaultModel?.trim() ? defaultModel.trim() : option.defaultModel;
  const model = rawModel || fallbackModel;

  return {
    key,
    provider: option.provider,
    model,
    credentialEnv: option.credentialEnv,
    isDefault: !rawProvider && !rawModel,
    label: `${option.provider} ${model}`,
    make: () => {
      assertGroundingCredential(env, option, model);
      return option.make(model);
    },
  };
}
