/**
 * Shared provenance vocabulary: every AI-engine (and non-AI, deterministic)
 * result in the pipeline can attach one of these to say EXACTLY what produced
 * it — never inferred, never assumed. Historical results that predate this
 * vocabulary simply have no `provenance` field; callers must treat that as
 * "not recorded", not silently backfill a guess (e.g. "claude" by default).
 */

/** How the content was actually produced. */
export type ProvenanceSourceKind =
  | "direct-api"
  | "claude-cli"
  | "claude-web"
  | "replit-agent"
  | "operator-input"
  | "deterministic"
  | "n8n-webhook"
  | "imported"
  | "unknown";

/** The wire mechanism used to reach the source, when known. */
export type ProvenanceTransport =
  | "sdk"
  | "http"
  | "webhook"
  | "operator-paste"
  | "none"
  | "unknown";

/** Which routed candidate produced this result. */
export type ProvenanceCandidate = "main" | "backup" | "none";

export type ProvenanceOutcome = "success" | "error" | "unknown";

export const PROVENANCE_SOURCE_KINDS: readonly ProvenanceSourceKind[] = [
  "direct-api",
  "claude-cli",
  "claude-web",
  "replit-agent",
  "operator-input",
  "deterministic",
  "n8n-webhook",
  "imported",
  "unknown",
];

export const PROVENANCE_TRANSPORTS: readonly ProvenanceTransport[] = [
  "sdk",
  "http",
  "webhook",
  "operator-paste",
  "none",
  "unknown",
];

/**
 * Attribution for a single produced artifact (a phase output, a chat edit, a
 * bake-off model result, a page-terminal export, ...). Never carries
 * credential values or prompt/response contents — only metadata about who/
 * what produced the artifact and how.
 */
export interface Provenance {
  sourceKind: ProvenanceSourceKind;
  /** Provider name (e.g. "anthropic", "openai", "google", "deepseek"). Null when unrecorded. */
  provider: string | null;
  /** Exact model id/name. Null when unrecorded. */
  model: string | null;
  transport: ProvenanceTransport;
  /** The engine/provider the caller asked for (e.g. "claude", "openai"). Null if not applicable. */
  requestedEngine: string | null;
  /** Free-form mode label, e.g. "routed", "replit", "direct". Null if not applicable. */
  engineMode: string | null;
  /** Pipeline phase this result belongs to (build/audit/schema/verify/chat/research/...). */
  phase: string | null;
  /** 1-based attempt number within the candidate. Null when not applicable (e.g. deterministic). */
  attempt: number | null;
  candidate: ProvenanceCandidate;
  status: ProvenanceOutcome;
  startedAt: string | null;
  completedAt: string | null;
  /** True when this result came from the backup candidate after main failed/exhausted. */
  fallback: boolean;
  fallbackReason: string | null;
  /** Optional content hashes for audit trail — never the content itself. */
  inputHash?: string | null;
  outputHash?: string | null;
}

/** A provenance object stating explicitly that nothing was recorded. */
export function unknownProvenance(partial: Partial<Provenance> = {}): Provenance {
  return {
    sourceKind: "unknown",
    provider: null,
    model: null,
    transport: "unknown",
    requestedEngine: null,
    engineMode: null,
    phase: null,
    attempt: null,
    candidate: "none",
    status: "unknown",
    startedAt: null,
    completedAt: null,
    fallback: false,
    fallbackReason: null,
    ...partial,
  };
}

/** Build a provenance object, filling required fields with explicit-unknown defaults. */
export function makeProvenance(partial: Partial<Provenance> & Pick<Provenance, "sourceKind">): Provenance {
  return { ...unknownProvenance(), ...partial };
}

/** A deterministic (non-model) pipeline step: publish, checkers, structural work. */
export function deterministicProvenance(
  partial: Partial<Provenance> = {},
): Provenance {
  return makeProvenance({
    sourceKind: "deterministic",
    transport: "none",
    candidate: "none",
    status: "success",
    ...partial,
  });
}
