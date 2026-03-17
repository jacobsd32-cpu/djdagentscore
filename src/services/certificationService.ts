import { buildPublicUrl } from '../config/public.js'
import type {
  CertificationDirectoryRow,
  CertificationRevenueSummary,
  CertificationReviewRequestRow,
  CertificationRow,
} from '../db.js'
import {
  db,
  getActiveCertification,
  getCertificationRevenueSummary,
  getCertificationReviewRequestById,
  getLatestCertificationReviewRequest,
  getPendingCertificationReviewRequest,
  getRegistration,
  getScore,
  insertCertification,
  insertCertificationReviewRequest,
  listActiveCertificationDirectory,
  listCertificationReviewRequests,
  listCertifications,
  revokeCertification,
  updateCertificationReviewRequestDecision,
} from '../db.js'
import { makeBadge } from '../utils/badgeGenerator.js'
import { normalizeWallet } from '../utils/walletUtils.js'
import {
  getCertificationApplyPath,
  getCertificationTier,
  getCertificationTierByStoredValue,
  getDefaultCertificationTier,
  listCertificationTiers,
  type CertificationTierDefinition,
  type CertificationTierKey,
} from './certificationTiers.js'

export interface CertificationApplyError {
  ok: false
  code:
    | 'invalid_wallet'
    | 'invalid_request'
    | 'cert_requirements_not_met'
    | 'cert_score_too_low'
    | 'cert_not_registered'
    | 'cert_invalid_tier'
    | 'cert_already_active'
    | 'cert_not_found'
    | 'cert_review_not_found'
    | 'cert_review_not_approved'
  message: string
  status: 400 | 404 | 409
  details?: Record<string, unknown>
}

interface CertificationSuccess<T> {
  ok: true
  data: T
  status?: 200 | 201
}

export type CertificationResult<T> = CertificationApplyError | CertificationSuccess<T>

export interface CertificationTierView {
  key: CertificationTierKey
  label: CertificationTierDefinition['label']
  level: CertificationTierDefinition['level']
  minimum_score: number
  price_usdc: number
  summary: string
  controls: string[]
  apply_endpoint: string
}

export interface CertificationStatusView {
  wallet: string
  tier: string
  score_at_certification: number
  price_paid_usdc: number
  granted_at: string
  expires_at: string
  is_valid: true
  links: {
    certification_badge: string
    score_badge: string
    standards_document: string
    evaluator_preview: string
    agent_profile: string
    certify_readiness: string
  }
}

export interface CertificationApplyView extends CertificationStatusView {
  id: number
  is_active: true
  message: string
}

export interface CertificationAdminRecordView {
  id: number
  wallet: string
  tier: string
  score_at_certification: number
  granted_at: string
  expires_at: string
  is_active: boolean
  revoked_at: string | null
  revocation_reason: string | null
}

export type CertificationApplyResult = CertificationResult<CertificationApplyView>

export interface CertificationDirectoryEntryView {
  wallet: string
  certification: {
    id: number
    tier: string
    score_at_certification: number
    granted_at: string
    expires_at: string
  }
  current_score: {
    score: number | null
    tier: string | null
    confidence: number | null
  }
  profile: {
    name: string | null
    description: string | null
    github_url: string | null
    website_url: string | null
    github_verified: boolean
  }
  links: CertificationStatusView['links']
}

export interface CertificationDirectoryView {
  as_of: string
  filters: {
    limit: number
    tier: string | null
    search: string | null
    sort: CertificationDirectorySort
  }
  total: number
  returned: number
  certifications: CertificationDirectoryEntryView[]
}

export interface CertificationReadinessView {
  wallet: string
  can_apply: boolean
  requested_tier: CertificationTierView
  eligible_tiers: Array<
    CertificationTierView & {
      eligible: boolean
      score_gap: number
    }
  >
  status:
    | 'eligible'
    | 'already_certified'
    | 'not_registered'
    | 'score_missing'
    | 'score_expired'
    | 'score_too_low'
    | 'review_pending'
    | 'review_approved'
    | 'review_needs_info'
    | 'review_rejected'
  requirements: {
    registration: {
      met: boolean
    }
    score: {
      met: boolean
      minimum_score: number
      current_score: number | null
      current_tier: string | null
      confidence: number | null
      expires_at: string | null
      is_fresh: boolean
    }
    certification: {
      active: boolean
      tier: string | null
      granted_at: string | null
      expires_at: string | null
    }
    review: {
      exists: boolean
      status: CertificationReviewStatus | null
      requested_at: string | null
      reviewed_at: string | null
      reviewed_by: string | null
      review_note: string | null
    }
  }
  blockers: Array<{
    code: string
    message: string
  }>
  next_steps: Array<{
    code: string
    label: string
    href: string
  }>
  payment: {
    protocol: 'x402'
    amount_usdc: number
    endpoint: string
  }
  links: CertificationStatusView['links'] & {
    certification_status: string
    certify_overview: string
    certified_directory: string
    apply_endpoint: string
    review_status: string
  }
}

export const CERTIFICATION_REVIEW_STATUSES = ['pending', 'approved', 'needs_info', 'rejected'] as const
export type CertificationReviewStatus = (typeof CERTIFICATION_REVIEW_STATUSES)[number]

interface CertificationReviewLinks {
  agent_profile: string
  readiness: string
  review_status: string
  apply_endpoint: string
  certified_directory: string
}

export interface CertificationReviewRequestView {
  id: number
  wallet: string
  requested_by_wallet: string
  status: CertificationReviewStatus
  requested_at: string
  updated_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  requested_score: number
  requested_tier: string
  requested_confidence: number | null
  score_expires_at: string | null
  request_note: string | null
  review_note: string | null
  current_score: {
    score: number | null
    tier: string | null
    confidence: number | null
  }
  profile: {
    name: string | null
    description: string | null
    github_url: string | null
    website_url: string | null
    github_verified: boolean
  }
  links: CertificationReviewLinks
  message: string
}

export interface CertificationReviewQueueView {
  filters: {
    status: CertificationReviewStatus | null
    search: string | null
    limit: number
  }
  returned: number
  requests: CertificationReviewRequestView[]
}

export interface CertificationIssuedFromReviewView {
  review: CertificationReviewRequestView
  certification: CertificationApplyView
  message: string
}

function buildCertificationTierView(tier: CertificationTierDefinition): CertificationTierView {
  return {
    key: tier.key,
    label: tier.label,
    level: tier.level,
    minimum_score: tier.minimumScore,
    price_usdc: tier.priceUsd,
    summary: tier.summary,
    controls: [...tier.controls],
    apply_endpoint: buildPublicUrl(getCertificationApplyPath(tier.key)),
  }
}

function resolveCertificationTier(
  rawTier: string | null | undefined,
): CertificationResult<CertificationTierDefinition> {
  if (rawTier == null || rawTier.trim().length === 0) {
    return {
      ok: true,
      data: getDefaultCertificationTier(),
    }
  }

  const tier = getCertificationTier(rawTier)
  if (tier) {
    return {
      ok: true,
      data: tier,
    }
  }

  return {
    ok: false,
    code: 'cert_invalid_tier',
    message: 'Certification tier must be operational, transactional, or autonomous',
    status: 400,
  }
}

const applyForCertificationTxn = db.transaction((wallet: string, tier: CertificationTierDefinition): CertificationApplyResult => {
  const scoreRow = getScore(wallet)
  if (!scoreRow || scoreRow.expires_at <= new Date().toISOString()) {
    return {
      ok: false,
      code: 'cert_requirements_not_met',
      message: 'Score has expired — request a fresh score first',
      status: 400,
    }
  }

  if (scoreRow.composite_score < tier.minimumScore) {
    return {
      ok: false,
      code: 'cert_score_too_low',
      message: `${tier.label} certification requires a score of at least ${tier.minimumScore}`,
      status: 400,
      details: {
        current_score: scoreRow.composite_score,
        requested_tier: tier.label,
        minimum_score: tier.minimumScore,
      },
    }
  }

  const registration = getRegistration(wallet)
  if (!registration) {
    return {
      ok: false,
      code: 'cert_not_registered',
      message: 'Agent must be registered before applying for certification',
      status: 400,
    }
  }

  const existingCert = getActiveCertification(wallet)
  if (existingCert) {
    return {
      ok: false,
      code: 'cert_already_active',
      message: 'Wallet already has an active certification',
      status: 409,
    }
  }

  return {
    ok: true,
    status: 201,
    data: buildCertificationApplyView(
      insertCertification(wallet, tier.label, scoreRow.composite_score, tier.priceUsd),
    ),
  }
})

export const CERTIFICATION_DIRECTORY_SORTS = ['score', 'confidence', 'recent', 'name'] as const
export type CertificationDirectorySort = (typeof CERTIFICATION_DIRECTORY_SORTS)[number]

function invalidWalletError(message: string): CertificationApplyError {
  return {
    ok: false,
    code: 'invalid_wallet',
    message,
    status: 400,
  }
}

function normalizeReviewStatus(rawStatus: string | null | undefined): CertificationReviewStatus | null {
  const normalized = rawStatus?.trim().toLowerCase()
  if (!normalized) return null
  if (CERTIFICATION_REVIEW_STATUSES.includes(normalized as CertificationReviewStatus)) {
    return normalized as CertificationReviewStatus
  }
  return null
}

function normalizeReviewDecision(rawStatus: string | null | undefined): CertificationReviewStatus | null {
  const normalized = normalizeReviewStatus(rawStatus)
  if (normalized && normalized !== 'pending') {
    return normalized
  }
  return null
}

function normalizeReviewNote(rawNote: string | null | undefined): string | null {
  const note = rawNote?.trim()
  if (!note) return null
  return note.slice(0, 500)
}

function normalizeSearchTerm(rawSearch: string | null | undefined): string | null {
  const normalized = rawSearch?.trim().toLowerCase()
  if (!normalized) return null
  return normalized.slice(0, 120)
}

function buildCertificationLinks(wallet: string): CertificationStatusView['links'] {
  return {
    certification_badge: buildPublicUrl(`/v1/certification/badge/${wallet}`),
    score_badge: buildPublicUrl(`/v1/badge/${wallet}.svg`),
    standards_document: buildPublicUrl(`/v1/score/erc8004?wallet=${wallet}`),
    evaluator_preview: buildPublicUrl(`/v1/score/evaluator?wallet=${wallet}`),
    agent_profile: buildPublicUrl(`/agent/${wallet}`),
    certify_readiness: buildPublicUrl(`/certify?wallet=${wallet}`),
  }
}

function buildCertificationReadinessLinks(
  wallet: string,
  tier: CertificationTierDefinition,
): CertificationReadinessView['links'] {
  return {
    ...buildCertificationLinks(wallet),
    certification_status: buildPublicUrl(`/v1/certification/${wallet}`),
    certify_overview: buildPublicUrl(`/certify?wallet=${wallet}`),
    certified_directory: buildPublicUrl('/directory'),
    apply_endpoint: buildPublicUrl(getCertificationApplyPath(tier.key)),
    review_status: buildPublicUrl(`/v1/certification/review?wallet=${wallet}&tier=${tier.key}`),
  }
}

function buildCertificationReviewLinks(wallet: string, requestedTier?: string | null): CertificationReviewLinks {
  const tier = getCertificationTierByStoredValue(requestedTier) ?? getDefaultCertificationTier()
  return {
    agent_profile: buildPublicUrl(`/agent/${wallet}`),
    readiness: buildPublicUrl(`/v1/certification/readiness?wallet=${wallet}&tier=${tier.key}`),
    review_status: buildPublicUrl(`/v1/certification/review?wallet=${wallet}&tier=${tier.key}`),
    apply_endpoint: buildPublicUrl(getCertificationApplyPath(tier.key)),
    certified_directory: buildPublicUrl('/directory'),
  }
}

function buildCertificationStatusView(cert: CertificationRow): CertificationStatusView {
  return {
    wallet: cert.wallet,
    tier: cert.tier,
    score_at_certification: cert.score_at_certification,
    price_paid_usdc: cert.price_paid_usdc,
    granted_at: cert.granted_at,
    expires_at: cert.expires_at,
    is_valid: true,
    links: buildCertificationLinks(cert.wallet),
  }
}

function buildCertificationApplyView(cert: CertificationRow): CertificationApplyView {
  return {
    id: cert.id,
    ...buildCertificationStatusView(cert),
    is_active: true,
    message: 'Certification granted for 1 year',
  }
}

function buildCertificationAdminRecordView(cert: CertificationRow): CertificationAdminRecordView {
  return {
    id: cert.id,
    wallet: cert.wallet,
    tier: cert.tier,
    score_at_certification: cert.score_at_certification,
    granted_at: cert.granted_at,
    expires_at: cert.expires_at,
    is_active: cert.is_active === 1,
    revoked_at: cert.revoked_at,
    revocation_reason: cert.revocation_reason,
  }
}

function buildCertificationDirectoryEntryView(row: CertificationDirectoryRow): CertificationDirectoryEntryView {
  return {
    wallet: row.wallet,
    certification: {
      id: row.id,
      tier: row.tier,
      score_at_certification: row.score_at_certification,
      granted_at: row.granted_at,
      expires_at: row.expires_at,
    },
    current_score: {
      score: row.current_score,
      tier: row.current_tier,
      confidence: row.current_confidence,
    },
    profile: {
      name: row.name,
      description: row.description,
      github_url: row.github_url,
      website_url: row.website_url,
      github_verified: row.github_verified === 1,
    },
    links: buildCertificationLinks(row.wallet),
  }
}

function buildCertificationReviewMessage(status: CertificationReviewStatus): string {
  if (status === 'approved') {
    return 'Review request approved. This wallet is cleared for the next certification step.'
  }
  if (status === 'needs_info') {
    return 'Review request needs more information before approval.'
  }
  if (status === 'rejected') {
    return 'Review request rejected. Resolve the reviewer feedback before submitting again.'
  }
  return 'Review request submitted and waiting for reviewer action.'
}

function buildCertificationReviewView(row: CertificationReviewRequestRow): CertificationReviewRequestView {
  return {
    id: row.id,
    wallet: row.wallet,
    requested_by_wallet: row.requested_by_wallet,
    status: row.status as CertificationReviewStatus,
    requested_at: row.requested_at,
    updated_at: row.updated_at,
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewed_by,
    requested_score: row.requested_score,
    requested_tier: row.requested_tier,
    requested_confidence: row.requested_confidence,
    score_expires_at: row.score_expires_at,
    request_note: row.request_note,
    review_note: row.review_note,
    current_score: {
      score: row.current_score,
      tier: row.current_tier,
      confidence: row.current_confidence,
    },
    profile: {
      name: row.name,
      description: row.description,
      github_url: row.github_url,
      website_url: row.website_url,
      github_verified: row.github_verified === 1,
    },
    links: buildCertificationReviewLinks(row.wallet, row.requested_tier),
    message: buildCertificationReviewMessage(row.status as CertificationReviewStatus),
  }
}

function normalizeDirectorySort(rawSort: string | null | undefined): CertificationDirectorySort {
  const normalized = rawSort?.trim().toLowerCase()
  if (normalized && CERTIFICATION_DIRECTORY_SORTS.includes(normalized as CertificationDirectorySort)) {
    return normalized as CertificationDirectorySort
  }
  return 'score'
}

function matchesDirectorySearch(entry: CertificationDirectoryEntryView, search: string | null): boolean {
  if (!search) return true

  const haystack = [
    entry.wallet,
    entry.profile.name,
    entry.profile.description,
    entry.profile.github_url,
    entry.profile.website_url,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase()

  return haystack.includes(search)
}

function sortDirectoryEntries(
  entries: CertificationDirectoryEntryView[],
  sort: CertificationDirectorySort,
): CertificationDirectoryEntryView[] {
  const scoreValue = (entry: CertificationDirectoryEntryView) =>
    entry.current_score.score ?? entry.certification.score_at_certification
  const confidenceValue = (entry: CertificationDirectoryEntryView) => entry.current_score.confidence ?? -1
  const grantedAtValue = (entry: CertificationDirectoryEntryView) => Date.parse(entry.certification.granted_at)
  const nameValue = (entry: CertificationDirectoryEntryView) =>
    (entry.profile.name?.trim().toLowerCase() || entry.wallet).toLowerCase()

  return [...entries].sort((left, right) => {
    if (sort === 'confidence') {
      return (
        confidenceValue(right) - confidenceValue(left) ||
        scoreValue(right) - scoreValue(left) ||
        grantedAtValue(right) - grantedAtValue(left)
      )
    }

    if (sort === 'recent') {
      return grantedAtValue(right) - grantedAtValue(left) || scoreValue(right) - scoreValue(left)
    }

    if (sort === 'name') {
      return nameValue(left).localeCompare(nameValue(right)) || scoreValue(right) - scoreValue(left)
    }

    return (
      scoreValue(right) - scoreValue(left) ||
      confidenceValue(right) - confidenceValue(left) ||
      grantedAtValue(right) - grantedAtValue(left)
    )
  })
}

export function getCertificationStatus(wallet: string): CertificationRow | null {
  return getActiveCertification(wallet) ?? null
}

export function getCertificationReadinessView(
  rawWallet: string | null | undefined,
  rawTier?: string | null | undefined,
): CertificationResult<CertificationReadinessView> {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  const resolvedTier = resolveCertificationTier(rawTier)
  if (!resolvedTier.ok) {
    return resolvedTier
  }

  const requestedTier = resolvedTier.data

  const registration = getRegistration(wallet)
  const score = getScore(wallet)
  const certification = getActiveCertification(wallet)
  const review = getLatestCertificationReviewRequest(wallet)
  const nowIso = new Date().toISOString()
  const links = buildCertificationReadinessLinks(wallet, requestedTier)
  const scoreIsFresh = !!score && score.expires_at > nowIso
  const scoreMeetsThreshold = !!score && score.composite_score >= requestedTier.minimumScore
  const requestedTierView = buildCertificationTierView(requestedTier)
  const eligibleTiers = listCertificationTiers().map((tier) => {
    const eligible = !!score && scoreIsFresh && score.composite_score >= tier.minimumScore
    return {
      ...buildCertificationTierView(tier),
      eligible,
      score_gap: score ? Math.max(0, tier.minimumScore - score.composite_score) : tier.minimumScore,
    }
  })

  let status: CertificationReadinessView['status'] = 'eligible'
  let canApply = false
  const blockers: CertificationReadinessView['blockers'] = []
  let nextSteps: CertificationReadinessView['next_steps'] = []

  if (certification) {
    status = 'already_certified'
    blockers.push({
      code: 'already_certified',
      message: 'This wallet already has an active DJD certification.',
    })
    nextSteps = [
      { code: 'view_status', label: 'View certification status', href: links.certification_status },
      { code: 'open_profile', label: 'Open agent profile', href: links.agent_profile },
      { code: 'browse_directory', label: 'Browse certified directory', href: buildPublicUrl('/directory') },
    ]
  } else if (!registration) {
    status = 'not_registered'
    blockers.push({
      code: 'cert_not_registered',
      message: 'Register the agent before applying for certification.',
    })
    nextSteps = [
      { code: 'register_agent', label: 'Register this wallet', href: buildPublicUrl('/#register-path') },
      { code: 'open_profile', label: 'Open agent profile', href: links.agent_profile },
      { code: 'learn_certify', label: 'Read the Certify overview', href: links.certify_overview },
    ]
  } else if (!score) {
    status = 'score_missing'
    blockers.push({
      code: 'cert_requirements_not_met',
      message: 'This wallet needs a DJD score before it can apply.',
    })
    nextSteps = [
      { code: 'run_lookup', label: 'Run a wallet lookup', href: buildPublicUrl(`/?wallet=${wallet}#lookup`) },
      { code: 'open_profile', label: 'Open agent profile', href: links.agent_profile },
      { code: 'learn_certify', label: 'Read the Certify overview', href: links.certify_overview },
    ]
  } else if (!scoreIsFresh) {
    status = 'score_expired'
    blockers.push({
      code: 'cert_requirements_not_met',
      message: 'This wallet needs a fresh score snapshot before it can apply.',
    })
    nextSteps = [
      { code: 'run_lookup', label: 'Run a fresh lookup', href: buildPublicUrl(`/?wallet=${wallet}#lookup`) },
      { code: 'review_profile', label: 'Review agent profile', href: links.agent_profile },
      { code: 'review_standards', label: 'Review ERC-8004 document', href: links.standards_document },
    ]
  } else if (!scoreMeetsThreshold) {
    status = 'score_too_low'
    blockers.push({
      code: 'cert_score_too_low',
      message: `${requestedTier.label} certification requires a score of at least ${requestedTier.minimumScore}. This wallet is currently ${score.composite_score}.`,
    })
    nextSteps = [
      { code: 'review_profile', label: 'Review agent profile', href: links.agent_profile },
      { code: 'review_evaluator', label: 'Open evaluator preview', href: links.evaluator_preview },
      { code: 'browse_directory', label: 'See certified peers', href: buildPublicUrl('/directory') },
    ]
  } else if (review?.status === 'pending') {
    status = 'review_pending'
    blockers.push({
      code: 'cert_review_pending',
      message: 'A certification review request is already pending for this wallet.',
    })
    nextSteps = [
      { code: 'review_status', label: 'Check review status', href: links.review_status },
      { code: 'open_profile', label: 'Open agent profile', href: links.agent_profile },
      { code: 'review_standards', label: 'Review ERC-8004 document', href: links.standards_document },
    ]
  } else if (review?.status === 'needs_info') {
    status = 'review_needs_info'
    blockers.push({
      code: 'cert_review_needs_info',
      message: 'A reviewer asked for more information before certification can proceed.',
    })
    nextSteps = [
      { code: 'review_status', label: 'Read reviewer status', href: links.review_status },
      { code: 'open_profile', label: 'Open agent profile', href: links.agent_profile },
      { code: 'submit_review', label: 'Return to Certify', href: links.certify_overview },
    ]
  } else if (review?.status === 'rejected') {
    status = 'review_rejected'
    blockers.push({
      code: 'cert_review_rejected',
      message: 'The latest certification review request was rejected. Resolve the reviewer feedback first.',
    })
    nextSteps = [
      { code: 'review_status', label: 'Read reviewer status', href: links.review_status },
      { code: 'review_evaluator', label: 'Open evaluator preview', href: links.evaluator_preview },
      { code: 'return_certify', label: 'Return to Certify', href: links.certify_overview },
    ]
  } else if (review?.status === 'approved') {
    canApply = true
    status = 'review_approved'
    nextSteps = [
      { code: 'review_status', label: 'Review approved status', href: links.review_status },
      { code: 'apply', label: 'Submit certification purchase', href: links.apply_endpoint },
      { code: 'open_profile', label: 'Open agent profile', href: links.agent_profile },
    ]
  } else {
    canApply = true
    status = 'eligible'
    nextSteps = [
      { code: 'submit_review', label: 'Request a review packet', href: links.certify_overview },
      { code: 'apply', label: 'Submit certification purchase', href: links.apply_endpoint },
      { code: 'review_standards', label: 'Review ERC-8004 document', href: links.standards_document },
      { code: 'open_profile', label: 'Open agent profile', href: links.agent_profile },
    ]
  }

  return {
    ok: true,
    data: {
      wallet,
      can_apply: canApply,
      requested_tier: requestedTierView,
      eligible_tiers: eligibleTiers,
      status,
      requirements: {
        registration: {
          met: !!registration,
        },
        score: {
          met: !!score && scoreIsFresh && scoreMeetsThreshold,
          minimum_score: requestedTier.minimumScore,
          current_score: score?.composite_score ?? null,
          current_tier: score?.tier ?? null,
          confidence: score?.confidence ?? null,
          expires_at: score?.expires_at ?? null,
          is_fresh: scoreIsFresh,
        },
        certification: {
          active: !!certification,
          tier: certification?.tier ?? null,
          granted_at: certification?.granted_at ?? null,
          expires_at: certification?.expires_at ?? null,
        },
        review: {
          exists: !!review,
          status: (review?.status as CertificationReviewStatus | undefined) ?? null,
          requested_at: review?.requested_at ?? null,
          reviewed_at: review?.reviewed_at ?? null,
          reviewed_by: review?.reviewed_by ?? null,
          review_note: review?.review_note ?? null,
        },
      },
      blockers,
      next_steps: nextSteps,
      payment: {
        protocol: 'x402',
        amount_usdc: requestedTier.priceUsd,
        endpoint: links.apply_endpoint,
      },
      links,
    },
  }
}

export function getCertificationReviewStatusView(
  rawWallet: string | null | undefined,
): CertificationResult<CertificationReviewRequestView> {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  const reviewRequest = getLatestCertificationReviewRequest(wallet)
  if (!reviewRequest) {
    return {
      ok: false,
      code: 'cert_review_not_found',
      message: 'No certification review request found for this wallet',
      status: 404,
    }
  }

  return {
    ok: true,
    data: buildCertificationReviewView(reviewRequest),
  }
}

export function submitCertificationReviewRequest(params: {
  wallet: string | null | undefined
  note?: string | null | undefined
  tier?: string | null | undefined
}): CertificationResult<CertificationReviewRequestView> {
  const wallet = normalizeWallet(params.wallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  const resolvedTier = resolveCertificationTier(params.tier)
  if (!resolvedTier.ok) {
    return resolvedTier
  }

  const requestedTier = resolvedTier.data

  const latestReview = getLatestCertificationReviewRequest(wallet)
  if (latestReview?.status === 'approved') {
    return {
      ok: true,
      status: 200,
      data: {
        ...buildCertificationReviewView(latestReview),
        message: 'Review request already approved for this wallet.',
      },
    }
  }

  const existingPending = getPendingCertificationReviewRequest(wallet)
  if (existingPending) {
    return {
      ok: true,
      status: 200,
      data: {
        ...buildCertificationReviewView(existingPending),
        message: 'Review request already pending for this wallet.',
      },
    }
  }

  const score = getScore(wallet)
  if (!score || score.expires_at <= new Date().toISOString()) {
    return {
      ok: false,
      code: 'cert_requirements_not_met',
      message: 'Score has expired — request a fresh score before submitting for review',
      status: 400,
    }
  }

  if (score.composite_score < requestedTier.minimumScore) {
    return {
      ok: false,
      code: 'cert_score_too_low',
      message: `${requestedTier.label} certification requires a score of at least ${requestedTier.minimumScore} before a review request can be submitted`,
      status: 400,
      details: {
        current_score: score.composite_score,
        requested_tier: requestedTier.label,
        minimum_score: requestedTier.minimumScore,
      },
    }
  }

  if (!getRegistration(wallet)) {
    return {
      ok: false,
      code: 'cert_not_registered',
      message: 'Agent must be registered before submitting a review request',
      status: 400,
    }
  }

  if (getActiveCertification(wallet)) {
    return {
      ok: false,
      code: 'cert_already_active',
      message: 'Wallet already has an active certification',
      status: 409,
    }
  }

  const reviewRequest = insertCertificationReviewRequest(
    wallet,
    wallet,
    requestedTier.label,
    score.composite_score,
    score.confidence ?? null,
    score.expires_at ?? null,
    normalizeReviewNote(params.note),
  )

  return {
    ok: true,
    status: 201,
    data: buildCertificationReviewView(reviewRequest),
  }
}

export function listCertificationReviewRequestViews(params: {
  status?: string | null | undefined
  search?: string | null | undefined
  limit?: string | null | undefined
}): CertificationResult<CertificationReviewQueueView> {
  const parsedLimit = Number.parseInt(params.limit ?? '50', 10)
  const limit = Number.isNaN(parsedLimit) ? 50 : Math.min(Math.max(parsedLimit, 1), 200)
  const status = normalizeReviewStatus(params.status)
  const search = normalizeSearchTerm(params.search)
  const requests = listCertificationReviewRequests(status, search, limit).map(buildCertificationReviewView)

  return {
    ok: true,
    data: {
      filters: {
        status,
        search,
        limit,
      },
      returned: requests.length,
      requests,
    },
  }
}

export function reviewCertificationRequestDecision(params: {
  id: number
  decision: string | null | undefined
  note?: string | null | undefined
  reviewedBy?: string | null | undefined
}): CertificationResult<CertificationReviewRequestView> {
  if (!Number.isInteger(params.id) || params.id <= 0) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Invalid certification review request ID',
      status: 400,
    }
  }

  const decision = normalizeReviewDecision(params.decision)
  if (!decision) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Decision must be approved, needs_info, or rejected',
      status: 400,
    }
  }

  if (
    !updateCertificationReviewRequestDecision(
      params.id,
      decision,
      params.reviewedBy?.trim() || 'admin',
      normalizeReviewNote(params.note),
    )
  ) {
    return {
      ok: false,
      code: 'cert_review_not_found',
      message: 'Certification review request not found',
      status: 404,
    }
  }

  const updated = getCertificationReviewRequestById(params.id)
  if (!updated) {
    return {
      ok: false,
      code: 'cert_review_not_found',
      message: 'Certification review request not found',
      status: 404,
    }
  }

  return {
    ok: true,
    data: buildCertificationReviewView(updated),
  }
}

export function issueCertificationFromReviewRequest(params: {
  id: number
}): CertificationResult<CertificationIssuedFromReviewView> {
  if (!Number.isInteger(params.id) || params.id <= 0) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Invalid certification review request ID',
      status: 400,
    }
  }

  const review = getCertificationReviewRequestById(params.id)
  if (!review) {
    return {
      ok: false,
      code: 'cert_review_not_found',
      message: 'Certification review request not found',
      status: 404,
    }
  }

  if (review.status !== 'approved') {
    return {
      ok: false,
      code: 'cert_review_not_approved',
      message: 'Certification review must be approved before issuance',
      status: 400,
    }
  }

  const issuance = applyForCertification(review.wallet, review.requested_tier)
  if (!issuance.ok) {
    return issuance
  }

  return {
    ok: true,
    status: 201,
    data: {
      review: buildCertificationReviewView(review),
      certification: issuance.data,
      message: 'Certification issued from approved review request',
    },
  }
}

export function getCertificationDirectoryView(params: {
  limit: string | null | undefined
  tier: string | null | undefined
  search?: string | null | undefined
  sort?: string | null | undefined
}): CertificationResult<CertificationDirectoryView> {
  const parsedLimit = Number.parseInt(params.limit ?? '25', 10)
  const limit = Number.isNaN(parsedLimit) ? 25 : Math.min(Math.max(parsedLimit, 1), 100)
  const rawTier = params.tier?.trim()
  const tier = rawTier && rawTier.length > 0 ? rawTier : null
  const rawSearch = params.search?.trim().toLowerCase()
  const search = rawSearch && rawSearch.length > 0 ? rawSearch : null
  const sort = normalizeDirectorySort(params.sort)
  const matchingCertifications = sortDirectoryEntries(
    listActiveCertificationDirectory(tier)
      .map(buildCertificationDirectoryEntryView)
      .filter((entry) => {
        return matchesDirectorySearch(entry, search)
      }),
    sort,
  )
  const certifications = matchingCertifications.slice(0, limit)

  return {
    ok: true,
    data: {
      as_of: new Date().toISOString(),
      filters: {
        limit,
        tier,
        search,
        sort,
      },
      total: matchingCertifications.length,
      returned: certifications.length,
      certifications,
    },
  }
}

export function getCertificationStatusView(
  rawWallet: string | null | undefined,
): CertificationResult<CertificationStatusView> {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  const cert = getActiveCertification(wallet)
  if (!cert) {
    return {
      ok: false,
      code: 'cert_not_found',
      message: 'No active certification found for this wallet',
      status: 404,
    }
  }

  return {
    ok: true,
    data: buildCertificationStatusView(cert),
  }
}

export function getCertificationBadgeView(rawWallet: string | null | undefined): CertificationResult<{ svg: string }> {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError('Invalid wallet address')
  }

  const cert = getActiveCertification(wallet)
  const value = cert ? `✓ Score ${cert.score_at_certification}` : 'not certified'
  const color = cert ? '#16a34a' : '#6b7280'

  return {
    ok: true,
    data: {
      svg: makeBadge('djd certified', value, color),
    },
  }
}

export function getCertificationTierCatalogView(): CertificationResult<{
  tiers: CertificationTierView[]
  default_tier: CertificationTierKey
}> {
  return {
    ok: true,
    data: {
      tiers: listCertificationTiers().map(buildCertificationTierView),
      default_tier: getDefaultCertificationTier().key,
    },
  }
}

export function applyForCertification(wallet: string, rawTier?: string | null | undefined): CertificationApplyResult {
  const resolvedTier = resolveCertificationTier(rawTier)
  if (!resolvedTier.ok) {
    return resolvedTier
  }

  try {
    return applyForCertificationTxn(wallet, resolvedTier.data)
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      return {
        ok: false,
        code: 'cert_already_active',
        message: 'Wallet already has an active certification',
        status: 409,
      }
    }
    throw err
  }
}

export function applyForCertificationByPayer(
  rawWallet: string | null | undefined,
  rawTier?: string | null | undefined,
): CertificationApplyResult {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  return applyForCertification(wallet, rawTier)
}

export function listCertificationRecords(): CertificationAdminRecordView[] {
  return listCertifications().map(buildCertificationAdminRecordView)
}

export function revokeCertificationRecord(
  id: number,
  reason: string,
): CertificationResult<{ success: true; message: string; id: number; reason: string }> {
  if (!Number.isInteger(id) || id <= 0) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Invalid certification ID',
      status: 400,
    }
  }

  if (!revokeCertification(id, reason)) {
    return {
      ok: false,
      code: 'cert_not_found',
      message: 'Certification not found or already revoked',
      status: 404,
    }
  }

  return {
    ok: true,
    data: {
      success: true,
      message: 'Certification revoked',
      id,
      reason,
    },
  }
}

export function getCertificationRevenue(): CertificationRevenueSummary {
  return getCertificationRevenueSummary()
}
