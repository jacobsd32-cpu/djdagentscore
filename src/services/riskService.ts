import {
  countDistinctReportersByTarget,
  countFraudDisputesByTarget,
  countFraudReportsByTarget,
  getCreatorStakeSummary,
  getFraudReasonBreakdown,
  getIntentSummaryByTarget,
  getRatingsSummaryForWallet,
  getScore,
  listFraudPatternsByNames,
  sumFraudPenaltyByTarget,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import { getOrCalculateScore } from '../scoring/engine.js'
import type { Address } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'

type RiskLevel = 'clear' | 'watch' | 'elevated' | 'critical'
type RiskAction = 'allow' | 'monitor' | 'review' | 'block'
type RiskFactorSeverity = 'low' | 'medium' | 'high' | 'critical'

interface RiskServiceError {
  ok: false
  code: string
  message: string
  status: 400
  details?: Record<string, unknown>
}

interface RiskServiceSuccess<T> {
  ok: true
  data: T
}

export type RiskServiceResult<T> = RiskServiceError | RiskServiceSuccess<T>

interface RiskFactorView {
  key: string
  label: string
  severity: RiskFactorSeverity
  contribution: number
  details: Record<string, unknown>
}

interface RiskPatternView {
  pattern_name: string
  risk_weight: number
  occurrences: number
  first_detected: string | null
  last_detected: string | null
}

export interface RiskScoreView {
  wallet: Address
  risk_score: number
  risk_level: RiskLevel
  risk_confidence: number
  action: RiskAction
  current_score: number
  current_tier: string
  score_confidence: number
  score_recommendation: string
  score_model_version: string
  last_scored_at: string
  summary: {
    report_count: number
    unique_reporters: number
    total_penalty_applied: number
    open_disputes: number
    resolved_disputes: number
    sybil_flagged: boolean
    sybil_indicators: string[]
    gaming_indicators: string[]
    rating_count: number
    average_rating: number | null
    unique_raters: number
    intent_count: number
    conversions: number
    conversion_rate: number
    active_creator_stakes: number
    active_staked_amount: number
    active_score_boost: number
    slashed_creator_stakes: number
    slashed_staked_amount: number
    reason_breakdown: Array<{
      reason: string
      count: number
    }>
  }
  factors: RiskFactorView[]
  matched_patterns: RiskPatternView[]
}

function invalidWalletError(): RiskServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_WALLET,
    message: 'Invalid or missing wallet address',
    status: 400,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  } catch {
    return []
  }
}

function classifyRiskLevel(riskScore: number): RiskLevel {
  if (riskScore >= 70) return 'critical'
  if (riskScore >= 45) return 'elevated'
  if (riskScore >= 20) return 'watch'
  return 'clear'
}

function actionForRiskLevel(level: RiskLevel): RiskAction {
  switch (level) {
    case 'critical':
      return 'block'
    case 'elevated':
      return 'review'
    case 'watch':
      return 'monitor'
    default:
      return 'allow'
  }
}

function severityForContribution(contribution: number): RiskFactorSeverity {
  if (contribution >= 25) return 'critical'
  if (contribution >= 15) return 'high'
  if (contribution >= 8) return 'medium'
  return 'low'
}

function addFactor(
  factors: RiskFactorView[],
  key: string,
  label: string,
  contribution: number,
  details: Record<string, unknown>,
): number {
  const normalizedContribution = Math.max(0, Math.round(contribution))
  if (normalizedContribution <= 0) return 0

  factors.push({
    key,
    label,
    severity: severityForContribution(normalizedContribution),
    contribution: normalizedContribution,
    details,
  })

  return normalizedContribution
}

export async function getRiskScore(rawWallet: string | undefined): Promise<RiskServiceResult<RiskScoreView>> {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) return invalidWalletError()

  const score = await getOrCalculateScore(wallet)
  const scoreRow = getScore(wallet)
  const reasonBreakdown = getFraudReasonBreakdown(wallet)
  const reportCount = countFraudReportsByTarget(wallet)
  const uniqueReporters = countDistinctReportersByTarget(wallet)
  const totalPenaltyApplied = sumFraudPenaltyByTarget(wallet)
  const openDisputes = countFraudDisputesByTarget(wallet, { status: 'open' })
  const resolvedDisputes = countFraudDisputesByTarget(wallet, { status: 'resolved' })
  const ratings = getRatingsSummaryForWallet(wallet)
  const intent = getIntentSummaryByTarget(wallet)
  const creatorStakes = getCreatorStakeSummary(wallet)
  const sybilIndicators = parseStringArray(scoreRow?.sybil_indicators)
  const gamingIndicators = scoreRow ? parseStringArray(scoreRow.gaming_indicators) : score.gamingIndicators

  const patternCandidates = [
    ...reasonBreakdown.map((entry) => entry.reason),
    ...(score.sybilFlag ? ['sybil_attack', ...sybilIndicators] : []),
    ...gamingIndicators,
  ]
  const matchedPatterns = listFraudPatternsByNames(patternCandidates)

  const factors: RiskFactorView[] = []
  let riskScore = 0

  riskScore += addFactor(factors, 'fraud_reports', 'Fraud report pressure', Math.min(42, reportCount * 8 + Math.max(0, uniqueReporters - 1) * 3 + Math.min(totalPenaltyApplied, 12)), {
    report_count: reportCount,
    unique_reporters: uniqueReporters,
    total_penalty_applied: totalPenaltyApplied,
    top_reason: reasonBreakdown[0]?.reason ?? null,
  })

  if (score.sybilFlag || sybilIndicators.length > 0) {
    riskScore += addFactor(factors, 'sybil_signals', 'Sybil detection signals', 22 + Math.min(10, sybilIndicators.length * 3), {
      sybil_flagged: score.sybilFlag,
      indicators: sybilIndicators,
    })
  }

  if (gamingIndicators.length > 0) {
    riskScore += addFactor(factors, 'gaming_signals', 'Gaming or manipulation indicators', Math.min(18, gamingIndicators.length * 5), {
      indicators: gamingIndicators,
    })
  }

  if (ratings.rating_count >= 2 && ratings.average_rating !== null && ratings.average_rating <= 3.5) {
    const contribution = ratings.average_rating <= 2.5 ? 12 : 6
    riskScore += addFactor(factors, 'counterparty_ratings', 'Low counterparty ratings', contribution, {
      average_rating: ratings.average_rating,
      rating_count: ratings.rating_count,
      unique_raters: ratings.unique_raters,
    })
  }

  if (intent.intent_count >= 5 && intent.conversion_rate <= 10) {
    riskScore += addFactor(factors, 'intent_conversion', 'Heavy evaluation with weak conversion', intent.conversion_rate === 0 ? 10 : 8, {
      intent_count: intent.intent_count,
      conversions: intent.conversions,
      conversion_rate: intent.conversion_rate,
    })
  }

  if (score.confidence >= 0.5 && score.score < 25) {
    riskScore += addFactor(factors, 'underlying_score', 'Underlying trust score is already in the danger zone', 10, {
      score: score.score,
      confidence: score.confidence,
      recommendation: score.recommendation,
    })
  } else if (score.confidence >= 0.7 && score.score < 50) {
    riskScore += addFactor(factors, 'underlying_score', 'Underlying trust score is below the safe band', 5, {
      score: score.score,
      confidence: score.confidence,
      recommendation: score.recommendation,
    })
  }

  if (matchedPatterns.length > 0) {
    const contribution = Math.min(18, Math.round(matchedPatterns.reduce((sum, pattern) => sum + pattern.risk_weight * 4, 0)))
    riskScore += addFactor(factors, 'fraud_patterns', 'Matched fraud-pattern signatures', contribution, {
      matched_patterns: matchedPatterns.map((pattern) => pattern.pattern_name),
      pattern_count: matchedPatterns.length,
    })
  }

  riskScore = clamp(Math.round(riskScore), 0, 100)
  const riskLevel = classifyRiskLevel(riskScore)
  const signalCount = factors.length
  const riskConfidence = round(
    clamp(
      score.confidence * 0.55 +
        signalCount * 0.08 +
        (reportCount > 0 ? 0.12 : 0) +
        (matchedPatterns.length > 0 ? 0.08 : 0) +
        (ratings.rating_count >= 2 ? 0.05 : 0) +
        (intent.intent_count >= 5 ? 0.05 : 0) -
        (openDisputes > 0 ? 0.1 : 0),
      riskScore === 0 ? 0.2 : 0.25,
      0.98,
    ),
  )

  return {
    ok: true,
    data: {
      wallet,
      risk_score: riskScore,
      risk_level: riskLevel,
      risk_confidence: riskConfidence,
      action: actionForRiskLevel(riskLevel),
      current_score: score.score,
      current_tier: score.tier,
      score_confidence: round(score.confidence),
      score_recommendation: score.recommendation,
      score_model_version: score.modelVersion,
      last_scored_at: score.computedAt,
      summary: {
        report_count: reportCount,
        unique_reporters: uniqueReporters,
        total_penalty_applied: totalPenaltyApplied,
        open_disputes: openDisputes,
        resolved_disputes: resolvedDisputes,
        sybil_flagged: score.sybilFlag,
        sybil_indicators: sybilIndicators,
        gaming_indicators: gamingIndicators,
        rating_count: ratings.rating_count,
        average_rating: ratings.average_rating,
        unique_raters: ratings.unique_raters,
        intent_count: intent.intent_count,
        conversions: intent.conversions,
        conversion_rate: intent.conversion_rate,
        active_creator_stakes: creatorStakes.active_stake_count,
        active_staked_amount: round(creatorStakes.active_staked_amount),
        active_score_boost: creatorStakes.active_score_boost,
        slashed_creator_stakes: creatorStakes.slashed_stake_count,
        slashed_staked_amount: round(creatorStakes.slashed_staked_amount),
        reason_breakdown: reasonBreakdown,
      },
      factors,
      matched_patterns: matchedPatterns.map((pattern) => ({
        pattern_name: pattern.pattern_name,
        risk_weight: round(pattern.risk_weight),
        occurrences: pattern.occurrences,
        first_detected: pattern.first_detected,
        last_detected: pattern.last_detected,
      })),
    },
  }
}
