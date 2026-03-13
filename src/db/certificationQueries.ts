import { db } from './connection.js'

const stmtGetActiveCertification = db.prepare<[string], CertificationRow>(`
  SELECT * FROM certifications
  WHERE wallet = ? AND is_active = 1 AND expires_at > datetime('now')
  LIMIT 1
`)

const stmtInsertCertification = db.prepare(`
  INSERT INTO certifications (wallet, tier, score_at_certification, expires_at)
  VALUES (?, ?, ?, datetime('now', '+1 year'))
`)

const stmtGetCertificationById = db.prepare<[number], CertificationRow>(`
  SELECT * FROM certifications WHERE id = ?
`)

const stmtListCertifications = db.prepare<[], CertificationRow>(`
  SELECT * FROM certifications ORDER BY granted_at DESC
`)

const stmtListActiveCertificationDirectory = db.prepare<
  [string | null, string | null, number],
  CertificationDirectoryRow
>(`
  SELECT
    c.id,
    c.wallet,
    c.tier,
    c.score_at_certification,
    c.granted_at,
    c.expires_at,
    c.is_active,
    c.tx_hash,
    c.revoked_at,
    c.revocation_reason,
    s.composite_score AS current_score,
    s.tier AS current_tier,
    s.confidence AS current_confidence,
    r.name,
    r.description,
    r.github_url,
    r.website_url,
    COALESCE(r.github_verified, 0) AS github_verified
  FROM certifications c
  LEFT JOIN scores s ON LOWER(s.wallet) = c.wallet
  LEFT JOIN agent_registrations r ON r.wallet = c.wallet
  WHERE c.is_active = 1
    AND c.expires_at > datetime('now')
    AND (? IS NULL OR c.tier = ?)
  ORDER BY COALESCE(s.composite_score, c.score_at_certification) DESC, c.granted_at DESC
  LIMIT ?
`)

const stmtRevokeCertification = db.prepare(`
  UPDATE certifications
  SET is_active = 0, revoked_at = datetime('now'), revocation_reason = ?
  WHERE id = ? AND is_active = 1
`)

const stmtCountCertifications = db.prepare<[], { count: number }>(`
  SELECT COUNT(*) as count FROM certifications
`)

const stmtCountActiveCertifications = db.prepare<[], { count: number }>(`
  SELECT COUNT(*) as count FROM certifications
  WHERE is_active = 1 AND expires_at > datetime('now')
`)

const stmtCountRevokedCertifications = db.prepare<[], { count: number }>(`
  SELECT COUNT(*) as count FROM certifications WHERE revoked_at IS NOT NULL
`)

const stmtCertificationRevenueByMonth = db.prepare<[], CertificationRevenueByMonthRow>(`
  SELECT
    strftime('%Y-%m', granted_at) as month,
    COUNT(*) as count,
    SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) as revoked_count,
    SUM(99) as gross_revenue_usd,
    SUM(CASE WHEN revoked_at IS NULL THEN 99 ELSE 0 END) as net_revenue_usd
  FROM certifications
  GROUP BY strftime('%Y-%m', granted_at)
  ORDER BY month DESC
`)

export interface CertificationRow {
  id: number
  wallet: string
  tier: string
  score_at_certification: number
  granted_at: string
  expires_at: string
  is_active: number
  tx_hash: string | null
  revoked_at: string | null
  revocation_reason: string | null
}

export interface CertificationRevenueByMonthRow {
  month: string
  count: number
  revoked_count: number
  gross_revenue_usd: number
  net_revenue_usd: number
}

export interface CertificationRevenueSummary {
  total_certifications: number
  active_certifications: number
  revoked_certifications: number
  gross_revenue_usd: number
  net_revenue_usd: number
  price_per_cert_usd: number
  by_month: CertificationRevenueByMonthRow[]
}

export interface CertificationDirectoryRow extends CertificationRow {
  current_score: number | null
  current_tier: string | null
  current_confidence: number | null
  name: string | null
  description: string | null
  github_url: string | null
  website_url: string | null
  github_verified: number
}

export function getActiveCertification(wallet: string): CertificationRow | undefined {
  return stmtGetActiveCertification.get(wallet)
}

export function insertCertification(wallet: string, tier: string, scoreAtCertification: number): CertificationRow {
  const result = stmtInsertCertification.run(wallet, tier, scoreAtCertification)
  return stmtGetCertificationById.get(Number(result.lastInsertRowid))!
}

export function listCertifications(): CertificationRow[] {
  return stmtListCertifications.all()
}

export function listActiveCertificationDirectory(limit: number, tier?: string | null): CertificationDirectoryRow[] {
  return stmtListActiveCertificationDirectory.all(tier ?? null, tier ?? null, limit)
}

export function revokeCertification(id: number, reason: string): boolean {
  return stmtRevokeCertification.run(reason, id).changes > 0
}

export function getCertificationRevenueSummary(): CertificationRevenueSummary {
  const total = stmtCountCertifications.get()!.count
  const active = stmtCountActiveCertifications.get()!.count
  const revoked = stmtCountRevokedCertifications.get()!.count
  const byMonth = stmtCertificationRevenueByMonth.all()

  return {
    total_certifications: total,
    active_certifications: active,
    revoked_certifications: revoked,
    gross_revenue_usd: total * 99,
    net_revenue_usd: (total - revoked) * 99,
    price_per_cert_usd: 99,
    by_month: byMonth,
  }
}
