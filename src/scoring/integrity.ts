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
  self_funding_loop: 0.60,
  coordinated_creation: 0.65,
  single_source_funding: 0.75,
  zero_organic_activity: 0.70,
  velocity_anomaly: 0.80,
  fan_out_funding: 0.60,
  // Indicators emitted by sybil.ts:
  closed_loop_trading: 0.55,
  symmetric_transactions: 0.60,
  single_partner: 0.75,
  volume_without_diversity: 0.80,
  funded_by_top_partner: 0.60,
  tight_cluster: 0.55,
}

export const GAMING_FACTORS: Record<string, number> = {
  balance_window_dressing: 0.85,
  burst_and_stop: 0.80,
  nonce_inflation: 0.75,
  artificial_partner_diversity: 0.70,
  revenue_recycling: 0.80,
  // Indicators emitted by gaming.ts:
  velocity_spike: 0.80,
  deposit_and_score: 0.85,
  wash_trading: 0.50,
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
    multiplier *= SYBIL_FACTORS[ind] ?? 0.80
  }

  for (const ind of gamingIndicators) {
    multiplier *= GAMING_FACTORS[ind] ?? 0.85
  }

  if (fraudReportCount > 0) {
    multiplier *= Math.pow(0.90, fraudReportCount)
  }

  return Math.max(0.10, Math.round(multiplier * 1000) / 1000)
}
