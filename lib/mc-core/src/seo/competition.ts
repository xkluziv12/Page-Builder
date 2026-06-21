import type { Competition } from "./types";

export interface CompetitionSignals {
  /** Paid ads on the SERP (strong commercial-intent signal). */
  adsCount: number;
  /** Local-pack (map) results. */
  localPackCount: number;
  /** Organic results returned. */
  organicCount: number;
  /** Keyword difficulty 0-100 from DataForSEO, when available. */
  difficulty: number | null;
}

export interface CompetitionResult {
  competition: Competition;
  /** 0-100 score behind the bucket. */
  score: number;
}

/**
 * Derive a LOW/MEDIUM/HIGH competition bucket from live SERP signals. When
 * DataForSEO supplies a keyword difficulty we trust it as the primary signal;
 * otherwise we approximate from SERP density (ads + local pack + organic depth).
 * This is intentionally a transparent heuristic, not a black box.
 */
export function deriveCompetition(signals: CompetitionSignals): CompetitionResult {
  let score: number;
  if (signals.difficulty != null) {
    score = clamp(signals.difficulty, 0, 100);
  } else {
    score = clamp(
      signals.adsCount * 15 +
        signals.localPackCount * 3 +
        Math.min(signals.organicCount, 10) * 2,
      0,
      100,
    );
  }
  const competition: Competition = score >= 67 ? "HIGH" : score >= 34 ? "MEDIUM" : "LOW";
  return { competition, score: Math.round(score) };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
