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
import type { CertificationRevenueSummary, CertificationRow } from '../db.js'

export interface CertificationApplyError {
  ok: false
  code: 'cert_requirements_not_met' | 'cert_score_too_low' | 'cert_not_registered' | 'cert_already_active'
  message: string
  status: 400 | 409
  details?: Record<string, unknown>
}

export interface CertificationApplySuccess {
  ok: true
  cert: CertificationRow
}

export type CertificationApplyResult = CertificationApplyError | CertificationApplySuccess

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
    cert: insertCertification(wallet, scoreRow.tier, scoreRow.composite_score),
  }
})

export function getCertificationStatus(wallet: string): CertificationRow | null {
  return getActiveCertification(wallet) ?? null
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

export function listCertificationRecords(): CertificationRow[] {
  return listCertifications()
}

export function revokeCertificationRecord(id: number, reason: string): boolean {
  return revokeCertification(id, reason)
}

export function getCertificationRevenue(): CertificationRevenueSummary {
  return getCertificationRevenueSummary()
}
