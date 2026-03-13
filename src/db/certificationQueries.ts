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

const stmtListActiveCertificationDirectory = db.prepare<[string | null, string | null], CertificationDirectoryRow>(`
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
`)

const stmtRevokeCertification = db.prepare(`
  UPDATE certifications
  SET is_active = 0, revoked_at = datetime('now'), revocation_reason = ?
  WHERE id = ? AND is_active = 1
`)

const CERTIFICATION_REVIEW_SELECT = `
  SELECT
    r.id,
    r.wallet,
    r.requested_by_wallet,
    r.requested_tier,
    r.requested_score,
    r.requested_confidence,
    r.score_expires_at,
    r.request_note,
    r.status,
    r.requested_at,
    r.updated_at,
    r.reviewed_at,
    r.reviewed_by,
    r.review_note,
    reg.name,
    reg.description,
    reg.github_url,
    reg.website_url,
    COALESCE(reg.github_verified, 0) AS github_verified,
    s.composite_score AS current_score,
    s.tier AS current_tier,
    s.confidence AS current_confidence
  FROM certification_review_requests r
  LEFT JOIN agent_registrations reg ON reg.wallet = r.wallet
  LEFT JOIN scores s ON LOWER(s.wallet) = r.wallet
`

const stmtInsertCertificationReviewRequest = db.prepare(`
  INSERT INTO certification_review_requests (
    wallet,
    requested_by_wallet,
    requested_tier,
    requested_score,
    requested_confidence,
    score_expires_at,
    request_note
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const stmtGetCertificationReviewRequestById = db.prepare<[number], CertificationReviewRequestRow>(`
  ${CERTIFICATION_REVIEW_SELECT}
  WHERE r.id = ?
  LIMIT 1
`)

const stmtGetLatestCertificationReviewRequest = db.prepare<[string], CertificationReviewRequestRow>(`
  ${CERTIFICATION_REVIEW_SELECT}
  WHERE r.wallet = ?
  ORDER BY r.requested_at DESC, r.id DESC
  LIMIT 1
`)

const stmtGetPendingCertificationReviewRequest = db.prepare<[string], CertificationReviewRequestRow>(`
  ${CERTIFICATION_REVIEW_SELECT}
  WHERE r.wallet = ?
    AND r.status = 'pending'
  ORDER BY r.requested_at DESC, r.id DESC
  LIMIT 1
`)

const stmtListCertificationReviewRequests = db.prepare<
  [string | null, string | null, number],
  CertificationReviewRequestRow
>(
  `
    ${CERTIFICATION_REVIEW_SELECT}
    WHERE (? IS NULL OR r.status = ?)
    ORDER BY r.requested_at DESC, r.id DESC
    LIMIT ?
  `,
)

const stmtUpdateCertificationReviewRequestDecision = db.prepare(`
  UPDATE certification_review_requests
  SET status = ?,
      updated_at = datetime('now'),
      reviewed_at = datetime('now'),
      reviewed_by = ?,
      review_note = ?
  WHERE id = ?
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

export interface CertificationReviewRequestRow {
  id: number
  wallet: string
  requested_by_wallet: string
  requested_tier: string
  requested_score: number
  requested_confidence: number | null
  score_expires_at: string | null
  request_note: string | null
  status: string
  requested_at: string
  updated_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  review_note: string | null
  name: string | null
  description: string | null
  github_url: string | null
  website_url: string | null
  github_verified: number
  current_score: number | null
  current_tier: string | null
  current_confidence: number | null
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

export function listActiveCertificationDirectory(tier?: string | null): CertificationDirectoryRow[] {
  return stmtListActiveCertificationDirectory.all(tier ?? null, tier ?? null)
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

export function insertCertificationReviewRequest(
  wallet: string,
  requestedByWallet: string,
  requestedTier: string,
  requestedScore: number,
  requestedConfidence: number | null,
  scoreExpiresAt: string | null,
  requestNote: string | null,
): CertificationReviewRequestRow {
  const result = stmtInsertCertificationReviewRequest.run(
    wallet,
    requestedByWallet,
    requestedTier,
    requestedScore,
    requestedConfidence,
    scoreExpiresAt,
    requestNote,
  )
  return stmtGetCertificationReviewRequestById.get(Number(result.lastInsertRowid))!
}

export function getCertificationReviewRequestById(id: number): CertificationReviewRequestRow | undefined {
  return stmtGetCertificationReviewRequestById.get(id)
}

export function getLatestCertificationReviewRequest(wallet: string): CertificationReviewRequestRow | undefined {
  return stmtGetLatestCertificationReviewRequest.get(wallet)
}

export function getPendingCertificationReviewRequest(wallet: string): CertificationReviewRequestRow | undefined {
  return stmtGetPendingCertificationReviewRequest.get(wallet)
}

export function listCertificationReviewRequests(status: string | null, limit: number): CertificationReviewRequestRow[] {
  return stmtListCertificationReviewRequests.all(status, status, limit)
}

export function updateCertificationReviewRequestDecision(
  id: number,
  status: string,
  reviewedBy: string,
  reviewNote: string | null,
): boolean {
  return stmtUpdateCertificationReviewRequestDecision.run(status, reviewedBy, reviewNote, id).changes > 0
}
