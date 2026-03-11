import { log } from '../logger.js'
import type { AgentRegistrationRow, LeaderboardRow, ScoreHistoryRow, ScoreRow, Tier } from '../types.js'
import { db } from './connection.js'

const stmtUpsertScore = db.prepare(`
  INSERT INTO scores
    (wallet, composite_score, reliability_score, viability_score, identity_score, capability_score,
     tier, raw_data, calculated_at, expires_at,
     confidence, recommendation, model_version, sybil_flag, sybil_indicators, gaming_indicators, behavior_score)
  VALUES
    (@wallet, @composite_score, @reliability_score, @viability_score, @identity_score, @capability_score,
     @tier, @raw_data, @calculated_at, @expires_at,
     @confidence, @recommendation, @model_version, @sybil_flag, @sybil_indicators, @gaming_indicators, @behavior_score)
  ON CONFLICT(wallet) DO UPDATE SET
    composite_score   = excluded.composite_score,
    reliability_score = excluded.reliability_score,
    viability_score   = excluded.viability_score,
    identity_score    = excluded.identity_score,
    capability_score  = excluded.capability_score,
    tier              = excluded.tier,
    raw_data          = excluded.raw_data,
    calculated_at     = excluded.calculated_at,
    expires_at        = excluded.expires_at,
    confidence        = excluded.confidence,
    recommendation    = excluded.recommendation,
    model_version     = excluded.model_version,
    sybil_flag        = excluded.sybil_flag,
    sybil_indicators  = excluded.sybil_indicators,
    gaming_indicators = excluded.gaming_indicators,
    behavior_score    = excluded.behavior_score
`)

const stmtGetScore = db.prepare<[string], ScoreRow>(`
  SELECT * FROM scores WHERE wallet = ?
`)

const stmtInsertHistory = db.prepare(`
  INSERT INTO score_history (wallet, score, calculated_at, confidence, model_version)
  VALUES (?, ?, ?, ?, ?)
`)

const stmtGetHistory = db.prepare<[string], ScoreHistoryRow>(`
  SELECT * FROM score_history WHERE wallet = ? ORDER BY calculated_at DESC LIMIT 10
`)

const stmtInsertDecay = db.prepare(`INSERT INTO score_decay (wallet, composite_score) VALUES (?, ?)`)
const stmtUpdateWalletIndex = db.prepare(`UPDATE wallet_index SET is_scored = 1, last_seen = ? WHERE wallet = ?`)
const stmtPruneHistory = db.prepare(
  `DELETE FROM score_history WHERE wallet = ? AND id NOT IN
   (SELECT id FROM score_history WHERE wallet = ? ORDER BY calculated_at DESC LIMIT 50)`,
)

const stmtPruneDecay = db.prepare(
  `DELETE FROM score_decay WHERE wallet = ? AND rowid NOT IN (
    SELECT rowid FROM score_decay WHERE wallet = ? ORDER BY recorded_at DESC LIMIT 50
  )`,
)

const stmtPruneSnapshots = db.prepare(
  `DELETE FROM wallet_snapshots WHERE wallet = ? AND rowid NOT IN (
    SELECT rowid FROM wallet_snapshots WHERE wallet = ? ORDER BY snapshot_at DESC LIMIT 50
  )`,
)

const stmtGetExpired = db.prepare<[], { wallet: string }>(`
  SELECT wallet FROM scores WHERE expires_at < datetime('now')
`)

const stmtGetUnscoredWallets = db.prepare<[number], { wallet: string }>(`
  SELECT w.wallet
  FROM wallet_index w
  LEFT JOIN scores s ON s.wallet = w.wallet
  WHERE s.wallet IS NULL
    AND w.total_tx_count >= 3
  ORDER BY w.last_seen DESC
  LIMIT ?
`)

const stmtCountScores = db.prepare<[], { count: number }>(`
  SELECT COUNT(*) as count FROM scores
`)

const stmtLeaderboard = db.prepare<[], LeaderboardRow>(`
  SELECT s.*,
         CASE WHEN r.wallet IS NOT NULL THEN 1 ELSE 0 END AS is_registered,
         COALESCE(r.github_verified, 0)                   AS github_verified_badge
  FROM scores s
  LEFT JOIN agent_registrations r ON LOWER(s.wallet) = r.wallet
  WHERE s.composite_score > 0
  ORDER BY s.composite_score DESC
  LIMIT 50
`)

const stmtCountRegistered = db.prepare<[], { count: number }>(`
  SELECT COUNT(*) as count FROM agent_registrations
`)

const stmtUpsertRegistration = db.prepare(`
  INSERT INTO agent_registrations (wallet, name, description, github_url, website_url, registered_at, updated_at)
  VALUES (@wallet, @name, @description, @github_url, @website_url, datetime('now'), datetime('now'))
  ON CONFLICT(wallet) DO UPDATE SET
    name          = excluded.name,
    description   = excluded.description,
    github_url    = excluded.github_url,
    website_url   = excluded.website_url,
    updated_at    = datetime('now')
`)

const stmtGetRegistration = db.prepare<[string], AgentRegistrationRow>(`
  SELECT * FROM agent_registrations WHERE wallet = ?
`)

const stmtAllRegistrationsWithGithub = db.prepare<[], AgentRegistrationRow>(`
  SELECT * FROM agent_registrations WHERE github_url IS NOT NULL
`)

const stmtUpdateGithub = db.prepare(`
  UPDATE agent_registrations
  SET github_verified    = @github_verified,
      github_stars       = @github_stars,
      github_pushed_at   = @github_pushed_at,
      github_verified_at = datetime('now')
  WHERE wallet = @wallet
`)

const stmtInsertReport = db.prepare(`
  INSERT INTO fraud_reports (id, target_wallet, reporter_wallet, reason, details, created_at, penalty_applied)
  VALUES (@id, @target_wallet, @reporter_wallet, @reason, @details, @created_at, @penalty_applied)
`)

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

const stmtCountReports = db.prepare<[string], { count: number }>(`
  SELECT COUNT(*) as count FROM fraud_reports WHERE target_wallet = ?
`)

const stmtCountReporterReportsForTarget = db.prepare<[string, string], { count: number }>(`
  SELECT COUNT(*) as count FROM fraud_reports
  WHERE reporter_wallet = ? AND target_wallet = ?
`)

const stmtApplyPenalty = db.prepare(`
  UPDATE scores
  SET composite_score = MAX(0, composite_score - ?),
      tier = ?,
      calculated_at = datetime('now')
  WHERE wallet = ?
`)

const TTL_MS = 60 * 60 * 1000

let tierThresholds = { Elite: 90, Trusted: 75, Established: 50, Emerging: 25 }
let thresholdsCachedAt = 0

function refreshThresholds(): void {
  if (Date.now() - thresholdsCachedAt < 60_000) return
  try {
    const raw = db.prepare('SELECT value FROM indexer_state WHERE key = ?').get('tier_threshold_adjustments') as
      | { value: string }
      | undefined
    if (raw?.value) {
      const parsed = JSON.parse(raw.value) as { thresholds: typeof tierThresholds }
      if (parsed.thresholds) tierThresholds = parsed.thresholds
    }
  } catch (err) {
    log.warn('db', 'Failed to parse tier_threshold_adjustments — using defaults', err)
  }
  thresholdsCachedAt = Date.now()
}

/** Prune old wallet snapshots, keeping the 50 most recent. Call from the snapshot job, not from score upsert. */
export function pruneWalletSnapshots(wallet: string): void {
  stmtPruneSnapshots.run(wallet, wallet)
}

export function scoreToTier(score: number): Tier {
  refreshThresholds()
  if (score >= tierThresholds.Elite) return 'Elite'
  if (score >= tierThresholds.Trusted) return 'Trusted'
  if (score >= tierThresholds.Established) return 'Established'
  if (score >= tierThresholds.Emerging) return 'Emerging'
  return 'Unverified'
}

export interface ScoreMetadata {
  confidence?: number
  recommendation?: string
  modelVersion?: string
  sybilFlag?: boolean
  sybilIndicators?: string[]
  gamingIndicators?: string[]
}

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

const upsertScoreTxn = db.transaction(
  (
    wallet: string,
    compositeScore: number,
    reliabilityScore: number,
    viabilityScore: number,
    identityScore: number,
    capabilityScore: number,
    behaviorScore: number | null,
    tier: string,
    rawData: object,
    now: Date,
    expiresAt: Date,
    meta: ScoreMetadata,
  ) => {
    stmtUpsertScore.run({
      wallet,
      composite_score: compositeScore,
      reliability_score: reliabilityScore,
      viability_score: viabilityScore,
      identity_score: identityScore,
      capability_score: capabilityScore,
      behavior_score: behaviorScore,
      tier,
      raw_data: JSON.stringify(rawData),
      calculated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      confidence: meta.confidence ?? 0.0,
      recommendation: meta.recommendation ?? 'insufficient_history',
      model_version: meta.modelVersion ?? '1.0.0',
      sybil_flag: meta.sybilFlag ? 1 : 0,
      sybil_indicators: JSON.stringify(meta.sybilIndicators ?? []),
      gaming_indicators: JSON.stringify(meta.gamingIndicators ?? []),
    })

    stmtInsertHistory.run(
      wallet,
      compositeScore,
      now.toISOString(),
      meta.confidence ?? 0.0,
      meta.modelVersion ?? '1.0.0',
    )

    stmtInsertDecay.run(wallet, compositeScore)
    stmtUpdateWalletIndex.run(now.toISOString(), wallet)
    stmtPruneHistory.run(wallet, wallet)
    stmtPruneDecay.run(wallet, wallet)
  },
)

export function upsertScore(
  wallet: string,
  compositeScore: number,
  reliabilityScore: number,
  viabilityScore: number,
  identityScore: number,
  capabilityScore: number,
  behaviorScore: number | null,
  rawData: object,
  meta: ScoreMetadata = {},
): void {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TTL_MS)
  const tier = scoreToTier(compositeScore)

  upsertScoreTxn(
    wallet.toLowerCase(),
    compositeScore,
    reliabilityScore,
    viabilityScore,
    identityScore,
    capabilityScore,
    behaviorScore,
    tier,
    rawData,
    now,
    expiresAt,
    meta,
  )
}

export function getScore(wallet: string): ScoreRow | undefined {
  return stmtGetScore.get(wallet)
}

export function getScoreHistory(wallet: string): ScoreHistoryRow[] {
  return stmtGetHistory.all(wallet)
}

export function getExpiredWallets(): string[] {
  return stmtGetExpired.all().map((row) => row.wallet)
}

export function getUnscoredWallets(limit: number): string[] {
  return stmtGetUnscoredWallets.all(limit).map((row) => row.wallet)
}

export function countCachedScores(): number {
  return stmtCountScores.get()!.count
}

export function getLeaderboard(): LeaderboardRow[] {
  return stmtLeaderboard.all()
}

export function countRegisteredAgents(): number {
  return stmtCountRegistered.get()!.count
}

export function upsertRegistration(reg: {
  wallet: string
  name: string | null
  description: string | null
  github_url: string | null
  website_url: string | null
}): void {
  stmtUpsertRegistration.run(reg)
}

export function getRegistration(wallet: string): AgentRegistrationRow | undefined {
  return stmtGetRegistration.get(wallet)
}

export function getAllRegistrationsWithGithub(): AgentRegistrationRow[] {
  return stmtAllRegistrationsWithGithub.all()
}

export function updateGithubVerification(
  wallet: string,
  verified: boolean,
  stars: number | null,
  pushedAt: string | null,
): void {
  stmtUpdateGithub.run({
    wallet,
    github_verified: verified ? 1 : 0,
    github_stars: stars,
    github_pushed_at: pushedAt,
  })
}

export function insertReport(report: {
  id: string
  target_wallet: string
  reporter_wallet: string
  reason: string
  details: string
  penalty_applied: number
}): void {
  stmtInsertReport.run({
    ...report,
    created_at: new Date().toISOString(),
  })
}

export function countReportsByTarget(wallet: string): number {
  return stmtCountReports.get(wallet)!.count
}

export function countReporterReportsForTarget(reporter: string, target: string): number {
  return stmtCountReporterReportsForTarget.get(reporter, target)!.count
}

export function applyReportPenalty(wallet: string, penalty: number): void {
  const row = stmtGetScore.get(wallet)
  if (!row) return
  const newScore = Math.max(0, row.composite_score - penalty)
  const newTier = scoreToTier(newScore)
  stmtApplyPenalty.run(penalty, newTier, wallet)
}

export function getActiveCertification(wallet: string): CertificationRow | undefined {
  return stmtGetActiveCertification.get(wallet)
}

export function insertCertification(
  wallet: string,
  tier: string,
  scoreAtCertification: number,
): CertificationRow {
  const result = stmtInsertCertification.run(wallet, tier, scoreAtCertification)
  return stmtGetCertificationById.get(Number(result.lastInsertRowid))!
}

export function listCertifications(): CertificationRow[] {
  return stmtListCertifications.all()
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
