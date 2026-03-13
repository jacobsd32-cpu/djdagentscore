import { buildPublicUrl } from '../config/public.js'
import type { CertificationDirectoryRow, CertificationRevenueSummary, CertificationRow } from '../db.js'
import {
  db,
  getActiveCertification,
  getCertificationRevenueSummary,
  getRegistration,
  getScore,
  insertCertification,
  listActiveCertificationDirectory,
  listCertifications,
  revokeCertification,
} from '../db.js'
import { makeBadge } from '../utils/badgeGenerator.js'
import { normalizeWallet } from '../utils/walletUtils.js'

export interface CertificationApplyError {
  ok: false
  code:
    | 'invalid_wallet'
    | 'invalid_request'
    | 'cert_requirements_not_met'
    | 'cert_score_too_low'
    | 'cert_not_registered'
    | 'cert_already_active'
    | 'cert_not_found'
  message: string
  status: 400 | 404 | 409
  details?: Record<string, unknown>
}

interface CertificationSuccess<T> {
  ok: true
  data: T
  status?: 201
}

export type CertificationResult<T> = CertificationApplyError | CertificationSuccess<T>

export interface CertificationStatusView {
  wallet: string
  tier: string
  score_at_certification: number
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
  }
  returned: number
  certifications: CertificationDirectoryEntryView[]
}

export interface CertificationReadinessView {
  wallet: string
  can_apply: boolean
  status: 'eligible' | 'already_certified' | 'not_registered' | 'score_missing' | 'score_expired' | 'score_too_low'
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
  }
}

const applyForCertificationTxn = db.transaction((wallet: string): CertificationApplyResult => {
  const scoreRow = getScore(wallet)
  if (!scoreRow || scoreRow.expires_at <= new Date().toISOString()) {
    return {
      ok: false,
      code: 'cert_requirements_not_met',
      message: 'Score has expired — request a fresh score first',
      status: 400,
    }
  }

  if (scoreRow.composite_score < 75) {
    return {
      ok: false,
      code: 'cert_score_too_low',
      message: 'Composite score must be >= 75 for certification',
      status: 400,
      details: { current_score: scoreRow.composite_score },
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
    data: buildCertificationApplyView(insertCertification(wallet, scoreRow.tier, scoreRow.composite_score)),
  }
})

function invalidWalletError(message: string): CertificationApplyError {
  return {
    ok: false,
    code: 'invalid_wallet',
    message,
    status: 400,
  }
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

function buildCertificationReadinessLinks(wallet: string): CertificationReadinessView['links'] {
  return {
    ...buildCertificationLinks(wallet),
    certification_status: buildPublicUrl(`/v1/certification/${wallet}`),
    certify_overview: buildPublicUrl(`/certify?wallet=${wallet}`),
    certified_directory: buildPublicUrl('/v1/certification/directory'),
    apply_endpoint: buildPublicUrl('/v1/certification/apply'),
  }
}

function buildCertificationStatusView(cert: CertificationRow): CertificationStatusView {
  return {
    wallet: cert.wallet,
    tier: cert.tier,
    score_at_certification: cert.score_at_certification,
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

export function getCertificationStatus(wallet: string): CertificationRow | null {
  return getActiveCertification(wallet) ?? null
}

export function getCertificationReadinessView(
  rawWallet: string | null | undefined,
): CertificationResult<CertificationReadinessView> {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  const registration = getRegistration(wallet)
  const score = getScore(wallet)
  const certification = getActiveCertification(wallet)
  const nowIso = new Date().toISOString()
  const links = buildCertificationReadinessLinks(wallet)
  const scoreIsFresh = !!score && score.expires_at > nowIso
  const scoreMeetsThreshold = !!score && score.composite_score >= 75

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
      { code: 'browse_directory', label: 'Browse certified directory', href: links.certified_directory },
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
      message: `Certification requires a score of at least 75. This wallet is currently ${score.composite_score}.`,
    })
    nextSteps = [
      { code: 'review_profile', label: 'Review agent profile', href: links.agent_profile },
      { code: 'review_evaluator', label: 'Open evaluator preview', href: links.evaluator_preview },
      { code: 'browse_directory', label: 'See certified peers', href: links.certified_directory },
    ]
  } else {
    canApply = true
    status = 'eligible'
    nextSteps = [
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
      status,
      requirements: {
        registration: {
          met: !!registration,
        },
        score: {
          met: !!score && scoreIsFresh && scoreMeetsThreshold,
          minimum_score: 75,
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
      },
      blockers,
      next_steps: nextSteps,
      payment: {
        protocol: 'x402',
        amount_usdc: 99,
        endpoint: links.apply_endpoint,
      },
      links,
    },
  }
}

export function getCertificationDirectoryView(params: {
  limit: string | null | undefined
  tier: string | null | undefined
}): CertificationResult<CertificationDirectoryView> {
  const parsedLimit = Number.parseInt(params.limit ?? '25', 10)
  const limit = Number.isNaN(parsedLimit) ? 25 : Math.min(Math.max(parsedLimit, 1), 100)
  const rawTier = params.tier?.trim()
  const tier = rawTier && rawTier.length > 0 ? rawTier : null
  const certifications = listActiveCertificationDirectory(limit, tier).map(buildCertificationDirectoryEntryView)

  return {
    ok: true,
    data: {
      as_of: new Date().toISOString(),
      filters: {
        limit,
        tier,
      },
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

export function applyForCertification(wallet: string): CertificationApplyResult {
  try {
    return applyForCertificationTxn(wallet)
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

export function applyForCertificationByPayer(rawWallet: string | null | undefined): CertificationApplyResult {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  return applyForCertification(wallet)
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
