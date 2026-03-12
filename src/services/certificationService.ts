import type { CertificationRevenueSummary, CertificationRow } from '../db.js'
import {
  db,
  getActiveCertification,
  getCertificationRevenueSummary,
  getRegistration,
  getScore,
  insertCertification,
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

function buildCertificationStatusView(cert: CertificationRow): CertificationStatusView {
  return {
    wallet: cert.wallet,
    tier: cert.tier,
    score_at_certification: cert.score_at_certification,
    granted_at: cert.granted_at,
    expires_at: cert.expires_at,
    is_valid: true,
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

export function getCertificationStatus(wallet: string): CertificationRow | null {
  return getActiveCertification(wallet) ?? null
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
