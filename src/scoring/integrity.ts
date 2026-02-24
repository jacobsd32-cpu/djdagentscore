/**
 * Integrity multiplier — combines sybil indicators, gaming indicators, and
 * fraud-report dampening into a single multiplicative trust modifier.
 *
 * Extracted from engine.ts to keep the scoring orchestrator focused on flow
 * rather than penalty arithmetic. This is a pure function with zero deps.
 */

// ---------- Factor lookup tables ----------
// Each value is the multiplicative penalty applied when the corresponding
// indicator fires.  Multiple indicators stack: multiplier = ∏(factors).

export const SYBIL_FACTORS: Record<string, number> = {
  self_funding_loop: 0.6,
  coordinated_creation: 0.65,
  single_source_funding: 0.75,
  zero_organic_activity: 0.7,
  velocity_anomaly: 0.8,
  fan_out_funding: 0.6,
  // Indicators emitted by sybil.ts:
  closed_loop_trading: 0.55,
  symmetric_transactions: 0.6,
  single_partner: 0.75,
  volume_without_diversity: 0.8,
  funded_by_top_partner: 0.6,
  tight_cluster: 0.55,
}

export const GAMING_FACTORS: Record<string, number> = {
  balance_window_dressing: 0.85,
  burst_and_stop: 0.8,
  nonce_inflation: 0.75,
  artificial_partner_diversity: 0.7,
  revenue_recycling: 0.8,
  // Indicators emitted by gaming.ts:
  velocity_spike: 0.8,
  deposit_and_score: 0.85,
  wash_trading: 0.5,
}

// ---------- Core function ----------

/**
 * Compute the integrity multiplier for a wallet.
 *
 * The multiplier stacks three penalty layers:
 *  1. Sybil indicators  (from sybil.ts detection)
 *  2. Gaming indicators  (from gaming.ts detection)
 *  3. Fraud-report dampening  (0.90^reportCount)
 *
 * Result is floored at 0.10 so a score is never completely zeroed out.
 */
export function computeIntegrityMultiplier(
  sybilIndicators: string[],
  gamingIndicators: string[],
  fraudReportCount: number,
): number {
  let multiplier = 1.0

  for (const ind of sybilIndicators) {
    multiplier *= SYBIL_FACTORS[ind] ?? 0.8
  }

  for (const ind of gamingIndicators) {
    multiplier *= GAMING_FACTORS[ind] ?? 0.85
  }

  if (fraudReportCount > 0) {
    multiplier *= 0.9 ** fraudReportCount
  }

  return Math.max(0.1, Math.round(multiplier * 1000) / 1000)
}
