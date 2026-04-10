import { createHash, randomUUID } from 'node:crypto'
import { buildPublicUrl } from '../config/public.js'
import {
  buildEscrowIdHash,
  DJD_DECISION_CODES,
  DJD_EVALUATOR_ORACLE_CALLBACK_FUNCTION,
  DJD_EVALUATOR_ORACLE_CALLBACK_INTERFACE,
  DJD_RECOMMENDATION_CODES,
  encodeEvaluatorOracleCallback,
  ZERO_ADDRESS,
} from '../contracts/djdEvaluatorOracleCallback.js'
import {
  countScoreHistory,
  getActiveCertification,
  getRegistration,
  getEvaluatorVerdict as getStoredEvaluatorVerdict,
  insertEvaluatorVerdict,
  listEvaluatorVerdictsByWallet,
  listFraudReportsByTarget,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import { normalizeWallet } from '../utils/walletUtils.js'
import { getCertificationTierByStoredValue, getDefaultCertificationTier } from './certificationTiers.js'
import {
  buildEvaluatorVerdictAttestation,
  buildEvaluatorVerdictTypedData,
  type EvaluatorVerdictAttestationInput,
  type EvaluatorVerdictAttestationView,
} from './evaluatorAttestationService.js'
import {
  findEvaluatorNetworkByChainId,
  getDefaultEvaluatorNetwork,
  getEvaluatorVerdictChainId,
  listEvaluatorNetworks,
  resolveEvaluatorNetwork,
} from './evaluatorNetworkService.js'
import { getRiskScore, type RiskScoreView } from './riskService.js'

type EvaluatorDecision = 'approve' | 'review' | 'reject'
type EvaluatorCheckStatus = 'pass' | 'review' | 'fail'
type EvaluatorArtifactStatus = 'included' | 'recommended' | 'missing'
type EvaluatorArtifactCategory = 'score' | 'identity' | 'certification' | 'forensics' | 'market'
type EvaluatorRecommendation = 'release' | 'manual_review' | 'dispute' | 'reject'

interface EvaluatorServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 404
  details?: Record<string, unknown>
}

interface EvaluatorServiceSuccess<T> {
  ok: true
  data: T
}

export type EvaluatorServiceResult<T> = EvaluatorServiceError | EvaluatorServiceSuccess<T>

interface EvaluatorLinks {
  evaluator_preview: string
  full_score: string
  risk: string
  standards_document: string
  certification_status: string
  forensics_summary: string
  forensics_timeline: string
  forensics_reports: string
  evidence_packet: string
}

interface EvaluatorOracleLinks {
  standards_document: string
  certification_status: string
  forensics_summary: string
  evidence_packet: string
  verdict_record: string
  verdict_history: string
}

interface EvaluatorCheckView {
  key: string
  label: string
  status: EvaluatorCheckStatus
  details: Record<string, unknown>
}

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
  checks: EvaluatorCheckView[]
  links: EvaluatorLinks
}

export interface EvaluatorEvidencePacketView {
  standard: 'erc-8183-evaluator-evidence-prototype'
  wallet: string
  packet_id: string
  packet_hash: string
  generated_at: string
  evaluator: {
    decision: EvaluatorDecision
    confidence: number
    rationale: string
  }
  baseline: {
    profile: 'djd-transactional-settlement-v1'
    settlement_tier: string
    score_floor: number
    certification_floor: string
    review_triggers: string[]
    reject_triggers: string[]
  }
  evidence: {
    score: EvaluatorPreviewView['score']
    certification: EvaluatorPreviewView['certification']
    risk: EvaluatorPreviewView['risk']
    market_signals: EvaluatorPreviewView['market_signals']
    checks: EvaluatorPreviewView['checks']
    forensics: {
      score_history_entries: number
      report_count: number
      unique_reporters: number
      total_penalty_applied: number
      open_disputes: number
      resolved_disputes: number
      reason_breakdown: RiskScoreView['summary']['reason_breakdown']
      recent_reports: Array<{
        report_id: string
        reason: string
        created_at: string
        penalty_applied: number
      }>
    }
  }
  artifacts: Array<{
    key: string
    label: string
    category: EvaluatorArtifactCategory
    status: EvaluatorArtifactStatus
    href: string
    summary: string
  }>
  links: EvaluatorLinks
}

export interface EvaluatorOracleView {
  standard: 'erc-8183-evaluator-oracle-prototype'
  verdict_id: string
  wallet: string
  counterparty_wallet: string | null
  escrow_id: string | null
  decision: EvaluatorDecision
  approved: boolean
  recommendation: EvaluatorRecommendation
  confidence: number
  agent_score_provider: number
  score_model_version: string
  certification_valid: boolean
  certification_tier: string | null
  risk_level: string
  risk_score: number
  sla_metrics: {
    baseline_profile: 'djd-transactional-settlement-v1'
    settlement_tier: string
    score_floor: number
    score_floor_passed: boolean
    certification_floor: string
    certification_floor_passed: boolean
    risk_guardrail_passed: boolean
    dispute_guardrail_passed: boolean
    failed_checks: string[]
    review_checks: string[]
  }
  forensic_trace_id: string
  packet_hash: string
  generated_at: string
  attestation: EvaluatorVerdictAttestationView
  links: EvaluatorOracleLinks
}

export interface EvaluatorStoredVerdictView extends EvaluatorOracleView {
  recorded_at: string
}

export interface EvaluatorVerdictHistoryView {
  standard: 'djd-evaluator-verdict-history-v1'
  wallet: string
  total: number
  limit: number
  summary: {
    approvals: number
    manual_review: number
    disputes: number
    rejects: number
  }
  items: Array<{
    verdict_id: string
    recorded_at: string
    decision: EvaluatorDecision
    recommendation: EvaluatorRecommendation
    approved: boolean
    confidence: number
    current_score: number
    current_tier: string
    risk_level: string
    certification_valid: boolean
    certification_tier: string | null
    escrow_id: string | null
    counterparty_wallet: string | null
    forensic_trace_id: string
    packet_hash: string
    attestation_status: 'signed' | 'unsigned'
    attestation_signer: string | null
  }>
}

export interface EvaluatorContractCallbackView {
  standard: 'djd-evaluator-oracle-callback-v1'
  ready: boolean
  reason: string | null
  verdict_id: string
  interface: {
    contract: 'IDJDEvaluatorOracleCallback'
    function: 'receiveVerdict'
    chain_id: number
  }
  verification: {
    status: 'signed' | 'unsigned'
    signer: string | null
    digest: string
    signature: string | null
    scheme: 'eip712'
  }
  verdict: {
    wallet: string
    counterparty_wallet: string | null
    escrow_id: string | null
    escrow_id_hash: string
    decision: EvaluatorDecision
    decision_code: number
    recommendation: EvaluatorRecommendation
    recommendation_code: number
    approved: boolean
    confidence: number
    agent_score_provider: number
    certification_valid: boolean
    risk_score: number
    packet_hash: string
  }
  callback: {
    selector: string | null
    calldata: string | null
    args: {
      escrow_id_hash: string
      provider: string
      counterparty: string
      decision_code: number
      recommendation_code: number
      approved: boolean
      confidence: number
      agent_score_provider: number
      certification_valid: boolean
      risk_score: number
      packet_hash: string
      attestation_digest: string
      attestation_signature: string | null
    }
  }
  transaction: {
    to: string | null
    data: string | null
    value: '0'
  }
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function invalidWalletError(field = 'wallet'): EvaluatorServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_WALLET,
    message: `Invalid or missing ${field} address`,
    status: 400,
  }
}

function invalidVerdictIdError(): EvaluatorServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_EVALUATOR_VERDICT_ID,
    message: 'Invalid or missing evaluator verdict id',
    status: 400,
  }
}

function invalidNetworkError(rawNetwork: string | undefined, details?: Record<string, unknown>): EvaluatorServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_NETWORK,
    message: 'Invalid or unsupported network',
    status: 400,
    details: {
      network: rawNetwork ?? null,
      supported_networks: listEvaluatorNetworks().map((network) => network.key),
      ...(details ?? {}),
    },
  }
}

function verdictNotFoundError(verdictId: string): EvaluatorServiceError {
  return {
    ok: false,
    code: ErrorCodes.EVALUATOR_VERDICT_NOT_FOUND,
    message: 'Evaluator verdict not found',
    status: 404,
    details: { verdict_id: verdictId },
  }
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

function buildEvaluatorLinks(wallet: string): EvaluatorLinks {
  return {
    evaluator_preview: buildPublicUrl(`/v1/score/evaluator?wallet=${wallet}`),
    full_score: buildPublicUrl(`/v1/score/full?wallet=${wallet}`),
    risk: buildPublicUrl(`/v1/score/risk?wallet=${wallet}`),
    standards_document: buildPublicUrl(`/v1/score/erc8004?wallet=${wallet}`),
    certification_status: buildPublicUrl(`/v1/certification/${wallet}`),
    forensics_summary: buildPublicUrl(`/v1/forensics/summary?wallet=${wallet}`),
    forensics_timeline: buildPublicUrl(`/v1/forensics/timeline?wallet=${wallet}`),
    forensics_reports: buildPublicUrl(`/v1/forensics/reports?wallet=${wallet}`),
    evidence_packet: buildPublicUrl(`/v1/score/evaluator/evidence?wallet=${wallet}`),
  }
}

function buildPacketHash(payload: Record<string, unknown>): string {
  return `0x${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
}

function buildVerdictLinks(wallet: string, verdictId: string): EvaluatorOracleLinks {
  return {
    standards_document: buildPublicUrl(`/v1/score/erc8004?wallet=${wallet}`),
    certification_status: buildPublicUrl(`/v1/certification/${wallet}`),
    forensics_summary: buildPublicUrl(`/v1/forensics/summary?wallet=${wallet}`),
    evidence_packet: buildPublicUrl(`/v1/score/evaluator/evidence?wallet=${wallet}`),
    verdict_record: buildPublicUrl(`/v1/score/evaluator/verdict?id=${encodeURIComponent(verdictId)}`),
    verdict_history: buildPublicUrl(`/v1/score/evaluator/verdicts?wallet=${wallet}`),
  }
}

function buildArtifact(params: {
  key: string
  label: string
  category: EvaluatorArtifactCategory
  status: EvaluatorArtifactStatus
  href: string
  summary: string
}): EvaluatorEvidencePacketView['artifacts'][number] {
  return params
}

function getCheckStatus(checks: EvaluatorCheckView[], key: string): EvaluatorCheckStatus | null {
  return checks.find((check) => check.key === key)?.status ?? null
}

function buildRecommendation(checks: EvaluatorCheckView[], decision: EvaluatorDecision): EvaluatorRecommendation {
  if (decision === 'approve') return 'release'

  const failedChecks = new Set(checks.filter((check) => check.status === 'fail').map((check) => check.key))
  const reviewChecks = new Set(checks.filter((check) => check.status === 'review').map((check) => check.key))

  if (failedChecks.has('dispute_pressure')) return 'dispute'
  if (failedChecks.has('risk_guardrail') || failedChecks.has('score_strength')) return 'reject'
  if (reviewChecks.has('dispute_pressure')) return 'dispute'

  return 'manual_review'
}

function parseStoredVerdictPayload(payloadJson: string): EvaluatorOracleView | null {
  try {
    return JSON.parse(payloadJson) as EvaluatorOracleView
  } catch {
    return null
  }
}

function buildVerdictAttestationInput(params: {
  verdict_id: string
  wallet: string
  counterparty_wallet: string | null
  escrow_id: string | null
  decision: EvaluatorDecision
  recommendation: EvaluatorRecommendation
  approved: boolean
  confidence: number
  agent_score_provider: number
  score_model_version: string
  certification_valid: boolean
  certification_tier: string | null
  risk_level: string
  risk_score: number
  forensic_trace_id: string
  packet_hash: string
  generated_at: string
}): EvaluatorVerdictAttestationInput {
  return {
    verdict_id: params.verdict_id,
    wallet: params.wallet as `0x${string}`,
    counterparty_wallet: (params.counterparty_wallet as `0x${string}` | null) ?? null,
    escrow_id: params.escrow_id,
    decision: params.decision,
    recommendation: params.recommendation,
    approved: params.approved,
    confidence: params.confidence,
    agent_score_provider: params.agent_score_provider,
    score_model_version: params.score_model_version,
    certification_valid: params.certification_valid,
    certification_tier: params.certification_tier,
    risk_level: params.risk_level,
    risk_score: params.risk_score,
    forensic_trace_id: params.forensic_trace_id,
    packet_hash: params.packet_hash as `0x${string}`,
    generated_at: params.generated_at,
  }
}

function resolveRequestedEvaluatorNetwork(
  rawNetwork: string | undefined,
): EvaluatorServiceResult<ReturnType<typeof getDefaultEvaluatorNetwork>> {
  const network = resolveEvaluatorNetwork(rawNetwork)
  if (!network) {
    return invalidNetworkError(rawNetwork)
  }

  return { ok: true, data: network }
}

function resolveStoredVerdictNetwork(
  verdict: Pick<EvaluatorStoredVerdictView, 'attestation' | 'verdict_id'>,
  rawNetwork: string | undefined,
): EvaluatorServiceResult<ReturnType<typeof getDefaultEvaluatorNetwork>> {
  const verdictChainId = getEvaluatorVerdictChainId(verdict.attestation)
  const verdictNetwork = findEvaluatorNetworkByChainId(verdictChainId) ?? getDefaultEvaluatorNetwork()

  if (rawNetwork === undefined || rawNetwork.trim() === '') {
    return { ok: true, data: verdictNetwork }
  }

  const requestedNetwork = resolveEvaluatorNetwork(rawNetwork)
  if (!requestedNetwork) {
    return invalidNetworkError(rawNetwork)
  }

  if (requestedNetwork.chainId !== verdictChainId) {
    return invalidNetworkError(rawNetwork, {
      verdict_id: verdict.verdict_id,
      verdict_chain_id: verdictChainId,
      verdict_network: verdictNetwork.key,
      requested_chain_id: requestedNetwork.chainId,
      requested_network: requestedNetwork.key,
      suggestion: `Request a fresh evaluator oracle verdict with network=${requestedNetwork.key} before generating contract calldata.`,
    })
  }

  return { ok: true, data: requestedNetwork }
}

function hydrateStoredAttestation(
  stored: ReturnType<typeof getStoredEvaluatorVerdict>,
  payload: Partial<EvaluatorOracleView>,
): EvaluatorVerdictAttestationView {
  const input = buildVerdictAttestationInput({
    verdict_id: payload.verdict_id ?? stored?.id ?? '',
    wallet: payload.wallet ?? stored?.wallet ?? '0x0000000000000000000000000000000000000000',
    counterparty_wallet: payload.counterparty_wallet ?? stored?.counterparty_wallet ?? null,
    escrow_id: payload.escrow_id ?? stored?.escrow_id ?? null,
    decision: (payload.decision ?? stored?.decision ?? 'review') as EvaluatorDecision,
    recommendation: (payload.recommendation ?? stored?.recommendation ?? 'manual_review') as EvaluatorRecommendation,
    approved: payload.approved ?? stored?.approved === 1,
    confidence: payload.confidence ?? stored?.confidence ?? 0,
    agent_score_provider: payload.agent_score_provider ?? stored?.current_score ?? 0,
    score_model_version: payload.score_model_version ?? 'unknown',
    certification_valid: payload.certification_valid ?? stored?.certification_active === 1,
    certification_tier: payload.certification_tier ?? stored?.certification_tier ?? null,
    risk_level: payload.risk_level ?? stored?.risk_level ?? 'watch',
    risk_score: payload.risk_score ?? stored?.risk_score ?? 0,
    forensic_trace_id: payload.forensic_trace_id ?? stored?.forensic_trace_id ?? '',
    packet_hash: payload.packet_hash ?? stored?.packet_hash ?? `0x${'0'.repeat(64)}`,
    generated_at: payload.generated_at ?? stored?.created_at ?? new Date(0).toISOString(),
  })
  const { digest, typed_data } = buildEvaluatorVerdictTypedData(input)

  const legacyAttestation = payload.attestation
  if (legacyAttestation) {
    return {
      ...legacyAttestation,
      typed_data: legacyAttestation.typed_data ?? typed_data,
      digest: legacyAttestation.digest ?? digest,
    }
  }

  return {
    status: stored?.attestation_status === 'signed' ? 'signed' : 'unsigned',
    scheme: 'eip712',
    source: stored?.attestation_signer ? 'publisher_fallback' : 'unconfigured',
    signer: stored?.attestation_signer ?? null,
    signature: stored?.attestation_signature ?? null,
    digest: stored?.attestation_digest || digest,
    issued_at: stored?.attested_at ?? stored?.created_at ?? new Date(0).toISOString(),
    reason: stored?.attestation_reason ?? (stored?.attestation_signer ? null : 'No oracle signing key configured'),
    typed_data,
  }
}

function buildAssessment(
  risk: RiskScoreView,
  registration: ReturnType<typeof getRegistration>,
  certification: ReturnType<typeof getActiveCertification>,
): Omit<EvaluatorPreviewView, 'standard'> {
  const wallet = risk.wallet
  const links = buildEvaluatorLinks(wallet)
  const checks: EvaluatorCheckView[] = []

  const pushCheck = (
    key: string,
    label: string,
    status: EvaluatorCheckStatus,
    details: Record<string, unknown>,
  ): void => {
    checks.push({ key, label, status, details })
  }

  if (risk.current_score >= 75 && risk.score_confidence >= 0.6) {
    pushCheck('score_strength', 'Score strength', 'pass', {
      current_score: risk.current_score,
      current_tier: risk.current_tier,
      score_confidence: risk.score_confidence,
      settlement_floor: 75,
    })
  } else if (risk.current_score >= 60 && risk.score_confidence >= 0.4) {
    pushCheck('score_strength', 'Score strength', 'review', {
      current_score: risk.current_score,
      current_tier: risk.current_tier,
      score_confidence: risk.score_confidence,
      settlement_floor: 75,
    })
  } else {
    pushCheck('score_strength', 'Score strength', 'fail', {
      current_score: risk.current_score,
      current_tier: risk.current_tier,
      score_confidence: risk.score_confidence,
      settlement_floor: 75,
    })
  }

  if (risk.risk_level === 'critical') {
    pushCheck('risk_guardrail', 'Risk guardrail', 'fail', {
      risk_score: risk.risk_score,
      risk_level: risk.risk_level,
      action: risk.action,
    })
  } else if (risk.risk_level === 'elevated') {
    pushCheck('risk_guardrail', 'Risk guardrail', 'review', {
      risk_score: risk.risk_score,
      risk_level: risk.risk_level,
      action: risk.action,
    })
  } else {
    pushCheck('risk_guardrail', 'Risk guardrail', 'pass', {
      risk_score: risk.risk_score,
      risk_level: risk.risk_level,
      action: risk.action,
    })
  }

  const settlementTier = getDefaultCertificationTier()
  const certificationTier = getCertificationTierByStoredValue(certification?.tier ?? null)
  if (certification && certificationTier && certificationTier.level >= settlementTier.level) {
    pushCheck('certification', 'Certification baseline', 'pass', {
      active: true,
      tier: certification.tier,
      normalized_tier: certificationTier.label,
      settlement_baseline: settlementTier.label,
      expires_at: certification.expires_at,
    })
  } else if (certification && certificationTier) {
    pushCheck('certification', 'Certification baseline', 'review', {
      active: true,
      tier: certification.tier,
      normalized_tier: certificationTier.label,
      settlement_baseline: settlementTier.label,
      note: `${certificationTier.label} certification is below the default ${settlementTier.label} settlement baseline`,
      expires_at: certification.expires_at,
    })
  } else if (certification) {
    pushCheck('certification', 'Certification baseline', 'review', {
      active: true,
      tier: certification.tier,
      settlement_baseline: settlementTier.label,
      note: 'Certification exists, but the tier could not be normalized to the current baseline ladder',
      expires_at: certification.expires_at,
    })
  } else {
    pushCheck('certification', 'Certification baseline', 'review', {
      active: false,
      settlement_baseline: settlementTier.label,
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

  const averageRating = risk.summary.average_rating
  if (risk.summary.rating_count < 2 || averageRating === null || averageRating >= 4) {
    pushCheck('counterparty_sentiment', 'Counterparty sentiment', 'pass', {
      rating_count: risk.summary.rating_count,
      average_rating: averageRating,
      unique_raters: risk.summary.unique_raters,
    })
  } else if (averageRating >= 3) {
    pushCheck('counterparty_sentiment', 'Counterparty sentiment', 'review', {
      rating_count: risk.summary.rating_count,
      average_rating: averageRating,
      unique_raters: risk.summary.unique_raters,
    })
  } else {
    pushCheck('counterparty_sentiment', 'Counterparty sentiment', 'fail', {
      rating_count: risk.summary.rating_count,
      average_rating: averageRating,
      unique_raters: risk.summary.unique_raters,
    })
  }

  if (risk.summary.report_count === 0 && risk.summary.open_disputes === 0) {
    pushCheck('dispute_pressure', 'Dispute pressure', 'pass', {
      report_count: risk.summary.report_count,
      open_disputes: risk.summary.open_disputes,
    })
  } else if (risk.summary.report_count <= 1 && risk.summary.open_disputes === 0) {
    pushCheck('dispute_pressure', 'Dispute pressure', 'review', {
      report_count: risk.summary.report_count,
      open_disputes: risk.summary.open_disputes,
    })
  } else {
    pushCheck('dispute_pressure', 'Dispute pressure', 'fail', {
      report_count: risk.summary.report_count,
      open_disputes: risk.summary.open_disputes,
      total_penalty_applied: risk.summary.total_penalty_applied,
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
        risk.score_confidence * 0.4 +
          risk.risk_confidence * 0.4 +
          (checks.length - reviewCount - failCount) * 0.06 -
          reviewCount * 0.05 -
          failCount * 0.12,
      ),
    ),
  )

  return {
    wallet,
    decision,
    confidence,
    rationale: summarizeDecision(decision),
    score: {
      current_score: risk.current_score,
      current_tier: risk.current_tier,
      score_confidence: risk.score_confidence,
      score_recommendation: risk.score_recommendation,
      score_model_version: risk.score_model_version,
      last_scored_at: risk.last_scored_at,
    },
    certification: {
      active: certification !== undefined,
      tier: certification?.tier ?? null,
      granted_at: certification?.granted_at ?? null,
      expires_at: certification?.expires_at ?? null,
    },
    risk: {
      risk_score: risk.risk_score,
      risk_level: risk.risk_level,
      action: risk.action,
    },
    market_signals: {
      rating_count: risk.summary.rating_count,
      average_rating: risk.summary.average_rating,
      unique_raters: risk.summary.unique_raters,
      intent_count: risk.summary.intent_count,
      conversion_rate: round(risk.summary.conversion_rate),
      active_creator_stakes: risk.summary.active_creator_stakes,
      active_score_boost: risk.summary.active_score_boost,
    },
    checks,
    links,
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
  const assessment = buildAssessment(risk.data, registration, certification)

  return {
    ok: true,
    data: {
      standard: 'erc-8183-evaluator-prototype',
      ...assessment,
    },
  }
}

export async function getEvaluatorEvidencePacket(
  rawWallet: string | undefined,
): Promise<EvaluatorServiceResult<EvaluatorEvidencePacketView>> {
  const risk = await getRiskScore(rawWallet)
  if (!risk.ok) {
    return risk
  }

  const wallet = risk.data.wallet
  const registration = getRegistration(wallet)
  const certification = getActiveCertification(wallet)
  const assessment = buildAssessment(risk.data, registration, certification)
  const recentReports = listFraudReportsByTarget(wallet, { limit: 3 }).map((report) => ({
    report_id: report.id,
    reason: report.reason,
    created_at: report.created_at,
    penalty_applied: report.penalty_applied,
  }))
  const scoreHistoryEntries = countScoreHistory(wallet)
  const settlementTier = getDefaultCertificationTier()
  const generatedAt = new Date().toISOString()
  const packetPayload = {
    wallet,
    generated_at: generatedAt,
    decision: assessment.decision,
    confidence: assessment.confidence,
    baseline_profile: 'djd-transactional-settlement-v1',
    checks: assessment.checks,
    report_count: risk.data.summary.report_count,
    open_disputes: risk.data.summary.open_disputes,
    recent_reports: recentReports,
  }
  const packetHash = buildPacketHash(packetPayload)
  const artifacts: EvaluatorEvidencePacketView['artifacts'] = [
    buildArtifact({
      key: 'standards_document',
      label: 'ERC-8004 reputation document',
      category: 'identity',
      status: 'included',
      href: assessment.links.standards_document,
      summary: 'Current ERC-8004-compatible reputation document for the evaluated wallet.',
    }),
    buildArtifact({
      key: 'full_score',
      label: 'Full score breakdown',
      category: 'score',
      status: 'included',
      href: assessment.links.full_score,
      summary: `Current score ${assessment.score.current_score}/100 with ${Math.round(assessment.score.score_confidence * 100)}% confidence.`,
    }),
    buildArtifact({
      key: 'certification_status',
      label: 'Certification status',
      category: 'certification',
      status: assessment.certification.active ? 'included' : 'recommended',
      href: assessment.links.certification_status,
      summary: assessment.certification.active
        ? `${assessment.certification.tier} certification is on file for settlement review.`
        : `No active certification is on file; ${settlementTier.label} is the preferred settlement baseline.`,
    }),
    buildArtifact({
      key: 'forensics_summary',
      label: 'Forensics summary',
      category: 'forensics',
      status: 'included',
      href: assessment.links.forensics_summary,
      summary: `${risk.data.summary.report_count} reports, ${risk.data.summary.open_disputes} open disputes, risk level ${assessment.risk.risk_level}.`,
    }),
    buildArtifact({
      key: 'forensics_timeline',
      label: 'Forensics timeline',
      category: 'forensics',
      status: scoreHistoryEntries > 0 ? 'included' : 'recommended',
      href: assessment.links.forensics_timeline,
      summary:
        scoreHistoryEntries > 0
          ? `${scoreHistoryEntries} score history snapshots are available for forensic review.`
          : 'No score history snapshots are currently available in the forensic timeline.',
    }),
    buildArtifact({
      key: 'forensics_reports',
      label: 'Forensics reports',
      category: 'forensics',
      status: recentReports.length > 0 ? 'included' : 'included',
      href: assessment.links.forensics_reports,
      summary:
        recentReports.length > 0
          ? `${recentReports.length} recent incident reports are attached to the evidence packet.`
          : 'No fraud reports are currently attached to this wallet.',
    }),
  ]

  return {
    ok: true,
    data: {
      standard: 'erc-8183-evaluator-evidence-prototype',
      wallet,
      packet_id: `evidence_${packetHash.slice(2, 18)}`,
      packet_hash: packetHash,
      generated_at: generatedAt,
      evaluator: {
        decision: assessment.decision,
        confidence: assessment.confidence,
        rationale: assessment.rationale,
      },
      baseline: {
        profile: 'djd-transactional-settlement-v1',
        settlement_tier: settlementTier.label,
        score_floor: settlementTier.minimumScore,
        certification_floor: settlementTier.label,
        review_triggers: [
          'Operational-only certification or no active certification',
          'Elevated risk level',
          'A recent report or low-confidence score band',
        ],
        reject_triggers: ['Critical risk level', 'Hard fail on dispute pressure or counterparty sentiment'],
      },
      evidence: {
        score: assessment.score,
        certification: assessment.certification,
        risk: assessment.risk,
        market_signals: assessment.market_signals,
        checks: assessment.checks,
        forensics: {
          score_history_entries: scoreHistoryEntries,
          report_count: risk.data.summary.report_count,
          unique_reporters: risk.data.summary.unique_reporters,
          total_penalty_applied: risk.data.summary.total_penalty_applied,
          open_disputes: risk.data.summary.open_disputes,
          resolved_disputes: risk.data.summary.resolved_disputes,
          reason_breakdown: risk.data.summary.reason_breakdown,
          recent_reports: recentReports,
        },
      },
      artifacts,
      links: {
        ...assessment.links,
      },
    },
  }
}

export async function getEvaluatorOracleVerdict(params: {
  rawWallet: string | undefined
  rawCounterpartyWallet?: string | undefined
  rawEscrowId?: string | undefined
  rawNetwork?: string | undefined
}): Promise<EvaluatorServiceResult<EvaluatorOracleView>> {
  const networkOutcome = resolveRequestedEvaluatorNetwork(params.rawNetwork)
  if (!networkOutcome.ok) {
    return networkOutcome
  }

  const evidenceOutcome = await getEvaluatorEvidencePacket(params.rawWallet)
  if (!evidenceOutcome.ok) {
    return evidenceOutcome
  }

  const counterpartyWallet =
    params.rawCounterpartyWallet === undefined || params.rawCounterpartyWallet === ''
      ? null
      : normalizeWallet(params.rawCounterpartyWallet)
  if (params.rawCounterpartyWallet && !counterpartyWallet) {
    return invalidWalletError('counterparty_wallet')
  }

  const evidence = evidenceOutcome.data
  const verdictId = `verdict_${randomUUID()}`
  const settlementTier = getDefaultCertificationTier()
  const scoreFloorPassed = getCheckStatus(evidence.evidence.checks, 'score_strength') === 'pass'
  const certificationFloorPassed = getCheckStatus(evidence.evidence.checks, 'certification') === 'pass'
  const riskGuardrailPassed = getCheckStatus(evidence.evidence.checks, 'risk_guardrail') === 'pass'
  const disputeGuardrailPassed = getCheckStatus(evidence.evidence.checks, 'dispute_pressure') === 'pass'
  const recommendation = buildRecommendation(evidence.evidence.checks, evidence.evaluator.decision)
  const forensicTraceId = `trace_${evidence.packet_hash.slice(2, 18)}`
  const links = buildVerdictLinks(evidence.wallet, verdictId)
  const corePayload: Omit<EvaluatorOracleView, 'attestation'> = {
    standard: 'erc-8183-evaluator-oracle-prototype',
    verdict_id: verdictId,
    wallet: evidence.wallet,
    counterparty_wallet: counterpartyWallet,
    escrow_id: params.rawEscrowId?.trim() ? params.rawEscrowId.trim() : null,
    decision: evidence.evaluator.decision,
    approved: evidence.evaluator.decision === 'approve',
    recommendation,
    confidence: Math.round(evidence.evaluator.confidence * 100),
    agent_score_provider: evidence.evidence.score.current_score,
    score_model_version: evidence.evidence.score.score_model_version,
    certification_valid: certificationFloorPassed,
    certification_tier: evidence.evidence.certification.tier,
    risk_level: evidence.evidence.risk.risk_level,
    risk_score: evidence.evidence.risk.risk_score,
    sla_metrics: {
      baseline_profile: evidence.baseline.profile,
      settlement_tier: settlementTier.label,
      score_floor: evidence.baseline.score_floor,
      score_floor_passed: scoreFloorPassed,
      certification_floor: evidence.baseline.certification_floor,
      certification_floor_passed: certificationFloorPassed,
      risk_guardrail_passed: riskGuardrailPassed,
      dispute_guardrail_passed: disputeGuardrailPassed,
      failed_checks: evidence.evidence.checks.filter((check) => check.status === 'fail').map((check) => check.key),
      review_checks: evidence.evidence.checks.filter((check) => check.status === 'review').map((check) => check.key),
    },
    forensic_trace_id: forensicTraceId,
    packet_hash: evidence.packet_hash,
    generated_at: evidence.generated_at,
    links,
  }
  const attestation = await buildEvaluatorVerdictAttestation(
    buildVerdictAttestationInput({
      verdict_id: corePayload.verdict_id,
      wallet: corePayload.wallet,
      counterparty_wallet: corePayload.counterparty_wallet,
      escrow_id: corePayload.escrow_id,
      decision: corePayload.decision,
      recommendation: corePayload.recommendation,
      approved: corePayload.approved,
      confidence: corePayload.confidence,
      agent_score_provider: corePayload.agent_score_provider,
      score_model_version: corePayload.score_model_version,
      certification_valid: corePayload.certification_valid,
      certification_tier: corePayload.certification_tier,
      risk_level: corePayload.risk_level,
      risk_score: corePayload.risk_score,
      forensic_trace_id: corePayload.forensic_trace_id,
      packet_hash: corePayload.packet_hash,
      generated_at: corePayload.generated_at,
    }),
    {
      chainId: networkOutcome.data.chainId,
    },
  )
  const payload: EvaluatorOracleView = {
    ...corePayload,
    attestation,
  }

  insertEvaluatorVerdict({
    id: verdictId,
    wallet: payload.wallet,
    counterparty_wallet: payload.counterparty_wallet,
    escrow_id: payload.escrow_id,
    baseline_profile: payload.sla_metrics.baseline_profile,
    certification_floor: payload.sla_metrics.certification_floor,
    current_score: payload.agent_score_provider,
    current_tier: evidence.evidence.score.current_tier,
    score_confidence: evidence.evidence.score.score_confidence,
    risk_score: payload.risk_score,
    risk_level: payload.risk_level,
    certification_active: payload.certification_valid ? 1 : 0,
    certification_tier: payload.certification_tier,
    decision: payload.decision,
    recommendation: payload.recommendation,
    approved: payload.approved ? 1 : 0,
    confidence: payload.confidence,
    packet_hash: payload.packet_hash,
    forensic_trace_id: payload.forensic_trace_id,
    attestation_scheme: payload.attestation.scheme,
    attestation_status: payload.attestation.status,
    attestation_digest: payload.attestation.digest,
    attestation_signature: payload.attestation.signature,
    attestation_signer: payload.attestation.signer,
    attestation_reason: payload.attestation.reason,
    attested_at: payload.attestation.issued_at,
    payload_json: JSON.stringify(payload),
    created_at: payload.generated_at,
  })

  return {
    ok: true,
    data: payload,
  }
}

export function getEvaluatorVerdictRecord(
  rawVerdictId: string | undefined,
): EvaluatorServiceResult<EvaluatorStoredVerdictView> {
  const verdictId = rawVerdictId?.trim()
  if (!verdictId) {
    return invalidVerdictIdError()
  }

  const stored = getStoredEvaluatorVerdict(verdictId)
  if (!stored) {
    return verdictNotFoundError(verdictId)
  }

  const payload = parseStoredVerdictPayload(stored.payload_json)
  if (!payload) {
    return verdictNotFoundError(verdictId)
  }
  const attestation = hydrateStoredAttestation(stored, payload)

  return {
    ok: true,
    data: {
      ...payload,
      attestation,
      recorded_at: stored.created_at,
    },
  }
}

export function listEvaluatorVerdictHistory(params: {
  rawWallet: string | undefined
  rawLimit?: string | undefined
}): EvaluatorServiceResult<EvaluatorVerdictHistoryView> {
  const wallet = normalizeWallet(params.rawWallet)
  if (!wallet) {
    return invalidWalletError()
  }

  const parsedLimit = Number.parseInt(params.rawLimit ?? '10', 10)
  const limit = Number.isNaN(parsedLimit) ? 10 : Math.min(Math.max(parsedLimit, 1), 50)
  const rows = listEvaluatorVerdictsByWallet(wallet, limit)

  const items: EvaluatorVerdictHistoryView['items'] = rows.map((row) => {
    const payload = parseStoredVerdictPayload(row.payload_json)
    return {
      verdict_id: row.id,
      recorded_at: row.created_at,
      decision: row.decision as EvaluatorDecision,
      recommendation: row.recommendation as EvaluatorRecommendation,
      approved: row.approved === 1,
      confidence: row.confidence,
      current_score: row.current_score,
      current_tier: row.current_tier,
      risk_level: row.risk_level,
      certification_valid: row.certification_active === 1,
      certification_tier: row.certification_tier,
      escrow_id: row.escrow_id,
      counterparty_wallet: row.counterparty_wallet,
      forensic_trace_id: row.forensic_trace_id,
      packet_hash: payload?.packet_hash ?? row.packet_hash,
      attestation_status: row.attestation_status === 'signed' ? 'signed' : 'unsigned',
      attestation_signer: row.attestation_signer,
    }
  })

  return {
    ok: true,
    data: {
      standard: 'djd-evaluator-verdict-history-v1',
      wallet,
      total: items.length,
      limit,
      summary: {
        approvals: items.filter((item) => item.recommendation === 'release').length,
        manual_review: items.filter((item) => item.recommendation === 'manual_review').length,
        disputes: items.filter((item) => item.recommendation === 'dispute').length,
        rejects: items.filter((item) => item.recommendation === 'reject').length,
      },
      items,
    },
  }
}

export function getEvaluatorContractCallbackView(params: {
  rawVerdictId: string | undefined
  rawTargetContract?: string | undefined
  rawNetwork?: string | undefined
}): EvaluatorServiceResult<EvaluatorContractCallbackView> {
  const storedVerdict = getEvaluatorVerdictRecord(params.rawVerdictId)
  if (!storedVerdict.ok) {
    return storedVerdict
  }

  const networkOutcome = resolveStoredVerdictNetwork(storedVerdict.data, params.rawNetwork)
  if (!networkOutcome.ok) {
    return networkOutcome
  }

  const targetContract =
    params.rawTargetContract === undefined || params.rawTargetContract === ''
      ? null
      : normalizeWallet(params.rawTargetContract)
  if (params.rawTargetContract && !targetContract) {
    return invalidWalletError('target_contract')
  }

  const verdict = storedVerdict.data
  const decisionCode = DJD_DECISION_CODES[verdict.decision]
  const recommendationCode = DJD_RECOMMENDATION_CODES[verdict.recommendation]
  const escrowIdHash = buildEscrowIdHash(verdict.escrow_id)
  const isSigned = verdict.attestation.status === 'signed' && verdict.attestation.signature !== null
  const calldata = isSigned
    ? encodeEvaluatorOracleCallback({
        provider: verdict.wallet as `0x${string}`,
        counterparty: (verdict.counterparty_wallet as `0x${string}` | null) ?? null,
        decisionCode,
        recommendationCode,
        approved: verdict.approved,
        confidence: verdict.confidence,
        agentScoreProvider: verdict.agent_score_provider,
        certificationValid: verdict.certification_valid,
        riskScore: verdict.risk_score,
        packetHash: verdict.packet_hash as `0x${string}`,
        attestationDigest: verdict.attestation.digest as `0x${string}`,
        attestationSignature: verdict.attestation.signature as `0x${string}`,
        escrowId: verdict.escrow_id,
      })
    : null

  return {
    ok: true,
    data: {
      standard: 'djd-evaluator-oracle-callback-v1',
      ready: isSigned,
      reason: isSigned ? null : 'verdict_attestation_unsigned',
      verdict_id: verdict.verdict_id,
      interface: {
        contract: DJD_EVALUATOR_ORACLE_CALLBACK_INTERFACE,
        function: DJD_EVALUATOR_ORACLE_CALLBACK_FUNCTION,
        chain_id: networkOutcome.data.chainId,
      },
      verification: {
        status: verdict.attestation.status,
        signer: verdict.attestation.signer,
        digest: verdict.attestation.digest,
        signature: verdict.attestation.signature,
        scheme: verdict.attestation.scheme,
      },
      verdict: {
        wallet: verdict.wallet,
        counterparty_wallet: verdict.counterparty_wallet,
        escrow_id: verdict.escrow_id,
        escrow_id_hash: escrowIdHash,
        decision: verdict.decision,
        decision_code: decisionCode,
        recommendation: verdict.recommendation,
        recommendation_code: recommendationCode,
        approved: verdict.approved,
        confidence: verdict.confidence,
        agent_score_provider: verdict.agent_score_provider,
        certification_valid: verdict.certification_valid,
        risk_score: verdict.risk_score,
        packet_hash: verdict.packet_hash,
      },
      callback: {
        selector: calldata ? calldata.slice(0, 10) : null,
        calldata,
        args: {
          escrow_id_hash: escrowIdHash,
          provider: verdict.wallet,
          counterparty: verdict.counterparty_wallet ?? ZERO_ADDRESS,
          decision_code: decisionCode,
          recommendation_code: recommendationCode,
          approved: verdict.approved,
          confidence: verdict.confidence,
          agent_score_provider: verdict.agent_score_provider,
          certification_valid: verdict.certification_valid,
          risk_score: verdict.risk_score,
          packet_hash: verdict.packet_hash,
          attestation_digest: verdict.attestation.digest,
          attestation_signature: verdict.attestation.signature,
        },
      },
      transaction: {
        to: targetContract,
        data: calldata,
        value: '0',
      },
    },
  }
}
