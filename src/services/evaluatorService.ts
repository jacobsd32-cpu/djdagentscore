import { buildPublicUrl } from '../config/public.js'
import { getActiveCertification, getRegistration } from '../db.js'
import { getRiskScore } from './riskService.js'

type EvaluatorDecision = 'approve' | 'review' | 'reject'
type EvaluatorCheckStatus = 'pass' | 'review' | 'fail'

interface EvaluatorServiceError {
  ok: false
  code: string
  message: string
  status: 400
  details?: Record<string, unknown>
}

interface EvaluatorServiceSuccess<T> {
  ok: true
  data: T
}

export type EvaluatorServiceResult<T> = EvaluatorServiceError | EvaluatorServiceSuccess<T>

export interface EvaluatorPreviewView {
  standard: 'erc-8183-evaluator-prototype'
  wallet: string
  decision: EvaluatorDecision
  confidence: number
  rationale: string
  score: {
    current_score: number
    current_tier: string
    score_confidence: number
    score_recommendation: string
    score_model_version: string
    last_scored_at: string
  }
  certification: {
    active: boolean
    tier: string | null
    granted_at: string | null
    expires_at: string | null
  }
  risk: {
    risk_score: number
    risk_level: string
    action: string
  }
  market_signals: {
    rating_count: number
    average_rating: number | null
    unique_raters: number
    intent_count: number
    conversion_rate: number
    active_creator_stakes: number
    active_score_boost: number
  }
  checks: Array<{
    key: string
    label: string
    status: EvaluatorCheckStatus
    details: Record<string, unknown>
  }>
  links: {
    full_score: string
    risk: string
    standards_document: string
    certification_status: string
  }
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function summarizeDecision(decision: EvaluatorDecision): string {
  switch (decision) {
    case 'approve':
      return 'Wallet meets the current DJD evaluator baseline for low-friction settlement.'
    case 'reject':
      return 'Wallet fails at least one hard guardrail and should not be auto-approved for settlement.'
    default:
      return 'Wallet shows enough positive signal to continue, but manual review is still warranted.'
  }
}

export async function getEvaluatorPreview(
  rawWallet: string | undefined,
): Promise<EvaluatorServiceResult<EvaluatorPreviewView>> {
  const risk = await getRiskScore(rawWallet)
  if (!risk.ok) {
    return risk
  }

  const wallet = risk.data.wallet
  const registration = getRegistration(wallet)
  const certification = getActiveCertification(wallet)
  const checks: EvaluatorPreviewView['checks'] = []

  const pushCheck = (
    key: string,
    label: string,
    status: EvaluatorCheckStatus,
    details: Record<string, unknown>,
  ): void => {
    checks.push({ key, label, status, details })
  }

  if (risk.data.current_score >= 75 && risk.data.score_confidence >= 0.6) {
    pushCheck('score_strength', 'Score strength', 'pass', {
      current_score: risk.data.current_score,
      current_tier: risk.data.current_tier,
      score_confidence: risk.data.score_confidence,
    })
  } else if (risk.data.current_score >= 60 && risk.data.score_confidence >= 0.4) {
    pushCheck('score_strength', 'Score strength', 'review', {
      current_score: risk.data.current_score,
      current_tier: risk.data.current_tier,
      score_confidence: risk.data.score_confidence,
    })
  } else {
    pushCheck('score_strength', 'Score strength', 'fail', {
      current_score: risk.data.current_score,
      current_tier: risk.data.current_tier,
      score_confidence: risk.data.score_confidence,
    })
  }

  if (risk.data.risk_level === 'critical') {
    pushCheck('risk_guardrail', 'Risk guardrail', 'fail', {
      risk_score: risk.data.risk_score,
      risk_level: risk.data.risk_level,
      action: risk.data.action,
    })
  } else if (risk.data.risk_level === 'elevated') {
    pushCheck('risk_guardrail', 'Risk guardrail', 'review', {
      risk_score: risk.data.risk_score,
      risk_level: risk.data.risk_level,
      action: risk.data.action,
    })
  } else {
    pushCheck('risk_guardrail', 'Risk guardrail', 'pass', {
      risk_score: risk.data.risk_score,
      risk_level: risk.data.risk_level,
      action: risk.data.action,
    })
  }

  if (certification) {
    pushCheck('certification', 'Certification status', 'pass', {
      active: true,
      tier: certification.tier,
      expires_at: certification.expires_at,
    })
  } else {
    pushCheck('certification', 'Certification status', 'review', {
      active: false,
      note: 'No active DJD certification on file',
    })
  }

  if (registration) {
    pushCheck('identity_registration', 'Identity registration', 'pass', {
      name: registration.name,
      github_verified: registration.github_verified === 1,
      website_url: registration.website_url,
    })
  } else {
    pushCheck('identity_registration', 'Identity registration', 'review', {
      registered: false,
    })
  }

  const averageRating = risk.data.summary.average_rating
  if (risk.data.summary.rating_count < 2 || averageRating === null || averageRating >= 4) {
    pushCheck('counterparty_sentiment', 'Counterparty sentiment', 'pass', {
      rating_count: risk.data.summary.rating_count,
      average_rating: averageRating,
      unique_raters: risk.data.summary.unique_raters,
    })
  } else if (averageRating >= 3) {
    pushCheck('counterparty_sentiment', 'Counterparty sentiment', 'review', {
      rating_count: risk.data.summary.rating_count,
      average_rating: averageRating,
      unique_raters: risk.data.summary.unique_raters,
    })
  } else {
    pushCheck('counterparty_sentiment', 'Counterparty sentiment', 'fail', {
      rating_count: risk.data.summary.rating_count,
      average_rating: averageRating,
      unique_raters: risk.data.summary.unique_raters,
    })
  }

  if (risk.data.summary.report_count === 0 && risk.data.summary.open_disputes === 0) {
    pushCheck('dispute_pressure', 'Dispute pressure', 'pass', {
      report_count: risk.data.summary.report_count,
      open_disputes: risk.data.summary.open_disputes,
    })
  } else if (risk.data.summary.report_count <= 1 && risk.data.summary.open_disputes === 0) {
    pushCheck('dispute_pressure', 'Dispute pressure', 'review', {
      report_count: risk.data.summary.report_count,
      open_disputes: risk.data.summary.open_disputes,
    })
  } else {
    pushCheck('dispute_pressure', 'Dispute pressure', 'fail', {
      report_count: risk.data.summary.report_count,
      open_disputes: risk.data.summary.open_disputes,
      total_penalty_applied: risk.data.summary.total_penalty_applied,
    })
  }

  const failCount = checks.filter((check) => check.status === 'fail').length
  const reviewCount = checks.filter((check) => check.status === 'review').length
  const decision: EvaluatorDecision = failCount > 0 ? 'reject' : reviewCount > 0 ? 'review' : 'approve'

  const confidence = round(
    Math.max(
      0.2,
      Math.min(
        0.98,
        risk.data.score_confidence * 0.4 +
          risk.data.risk_confidence * 0.4 +
          (checks.length - reviewCount - failCount) * 0.06 -
          reviewCount * 0.05 -
          failCount * 0.12,
      ),
    ),
  )

  return {
    ok: true,
    data: {
      standard: 'erc-8183-evaluator-prototype',
      wallet,
      decision,
      confidence,
      rationale: summarizeDecision(decision),
      score: {
        current_score: risk.data.current_score,
        current_tier: risk.data.current_tier,
        score_confidence: risk.data.score_confidence,
        score_recommendation: risk.data.score_recommendation,
        score_model_version: risk.data.score_model_version,
        last_scored_at: risk.data.last_scored_at,
      },
      certification: {
        active: certification !== undefined,
        tier: certification?.tier ?? null,
        granted_at: certification?.granted_at ?? null,
        expires_at: certification?.expires_at ?? null,
      },
      risk: {
        risk_score: risk.data.risk_score,
        risk_level: risk.data.risk_level,
        action: risk.data.action,
      },
      market_signals: {
        rating_count: risk.data.summary.rating_count,
        average_rating: risk.data.summary.average_rating,
        unique_raters: risk.data.summary.unique_raters,
        intent_count: risk.data.summary.intent_count,
        conversion_rate: round(risk.data.summary.conversion_rate),
        active_creator_stakes: risk.data.summary.active_creator_stakes,
        active_score_boost: risk.data.summary.active_score_boost,
      },
      checks,
      links: {
        full_score: buildPublicUrl(`/v1/score/full?wallet=${wallet}`),
        risk: buildPublicUrl(`/v1/score/risk?wallet=${wallet}`),
        standards_document: buildPublicUrl(`/v1/score/erc8004?wallet=${wallet}`),
        certification_status: buildPublicUrl(`/v1/certification/${wallet}`),
      },
    },
  }
}
