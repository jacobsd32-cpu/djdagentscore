/**
 * Test Factories — reusable helpers for inserting test data.
 *
 * Each factory accepts a partial overrides object and fills in sensible defaults.
 * Returns the full record so tests can reference generated values (IDs, timestamps, etc).
 *
 * Usage:
 *   const db = createTestDb()
 *   const wallet = createTestWallet(db, { total_tx_count: 50 })
 *   createTestTransfer(db, { from_wallet: wallet.wallet, to_wallet: '0xbob' })
 */
import type { Database as DatabaseType } from 'better-sqlite3'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let seq = 0
/** Generate a unique fake wallet address. */
export function fakeWallet(): string {
  return `0x${(++seq).toString(16).padStart(40, '0')}`
}

/** Generate a unique fake tx hash. */
export function fakeTxHash(): string {
  return `0x${(++seq).toString(16).padStart(64, 'a')}`
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

function daysAgo(d: number): string {
  return hoursAgo(d * 24)
}

// ---------------------------------------------------------------------------
// wallet_index
// ---------------------------------------------------------------------------

export interface TestWallet {
  wallet: string
  first_seen: string
  last_seen: string
  total_tx_count: number
  total_volume_in: number
  total_volume_out: number
  unique_partners: number
  is_proactively_indexed: number
  is_scored: number
}

export function createTestWallet(db: DatabaseType, overrides: Partial<TestWallet> = {}): TestWallet {
  const row: TestWallet = {
    wallet: fakeWallet(),
    first_seen: daysAgo(90),
    last_seen: daysAgo(1),
    total_tx_count: 10,
    total_volume_in: 500,
    total_volume_out: 200,
    unique_partners: 5,
    is_proactively_indexed: 1,
    is_scored: 0,
    ...overrides,
  }
  db.prepare(
    `INSERT INTO wallet_index
       (wallet, first_seen, last_seen, total_tx_count, total_volume_in, total_volume_out,
        unique_partners, is_proactively_indexed, is_scored)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.wallet,
    row.first_seen,
    row.last_seen,
    row.total_tx_count,
    row.total_volume_in,
    row.total_volume_out,
    row.unique_partners,
    row.is_proactively_indexed,
    row.is_scored,
  )
  return row
}

// ---------------------------------------------------------------------------
// raw_transactions
// ---------------------------------------------------------------------------

export interface TestTransfer {
  tx_hash: string
  block_number: number
  from_wallet: string
  to_wallet: string
  amount_usdc: number
  timestamp: string
}

export function createTestTransfer(db: DatabaseType, overrides: Partial<TestTransfer> = {}): TestTransfer {
  const row: TestTransfer = {
    tx_hash: fakeTxHash(),
    block_number: 1_000_000 + seq,
    from_wallet: fakeWallet(),
    to_wallet: fakeWallet(),
    amount_usdc: 100,
    timestamp: daysAgo(1),
    ...overrides,
  }
  db.prepare(
    `INSERT INTO raw_transactions (tx_hash, block_number, from_wallet, to_wallet, amount_usdc, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.tx_hash, row.block_number, row.from_wallet, row.to_wallet, row.amount_usdc, row.timestamp)
  return row
}

// ---------------------------------------------------------------------------
// scores
// ---------------------------------------------------------------------------

export interface TestScore {
  wallet: string
  composite_score: number
  reliability_score: number
  viability_score: number
  identity_score: number
  capability_score: number
  tier: string
  confidence: number
  recommendation: string
  sybil_flag: number
  model_version: string
  raw_data: string
  calculated_at: string
  expires_at: string
}

export function createTestScore(db: DatabaseType, overrides: Partial<TestScore> = {}): TestScore {
  const row: TestScore = {
    wallet: fakeWallet(),
    composite_score: 65,
    reliability_score: 60,
    viability_score: 70,
    identity_score: 55,
    capability_score: 50,
    tier: 'Established',
    confidence: 0.7,
    recommendation: 'moderate_caution',
    sybil_flag: 0,
    model_version: '2.1.0',
    raw_data: '{}',
    calculated_at: new Date().toISOString(),
    expires_at: hoursAgo(-1), // 1 hour in the future
    ...overrides,
  }
  db.prepare(
    `INSERT INTO scores
       (wallet, composite_score, reliability_score, viability_score, identity_score, capability_score,
        tier, confidence, recommendation, sybil_flag, model_version, raw_data, calculated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.wallet,
    row.composite_score,
    row.reliability_score,
    row.viability_score,
    row.identity_score,
    row.capability_score,
    row.tier,
    row.confidence,
    row.recommendation,
    row.sybil_flag,
    row.model_version,
    row.raw_data,
    row.calculated_at,
    row.expires_at,
  )
  return row
}

// ---------------------------------------------------------------------------
// query_log (needed for intent/outcome matchers)
// ---------------------------------------------------------------------------

export interface TestQueryLog {
  requester_wallet: string | null
  target_wallet: string
  endpoint: string
  target_score: number | null
  target_tier: string | null
  is_free_tier: number
  timestamp: string
}

/** Returns the inserted row with its auto-generated `id`. */
export function createTestQueryLog(
  db: DatabaseType,
  overrides: Partial<TestQueryLog> = {},
): TestQueryLog & { id: number } {
  const row: TestQueryLog = {
    requester_wallet: fakeWallet(),
    target_wallet: fakeWallet(),
    endpoint: '/score',
    target_score: 65,
    target_tier: 'Established',
    is_free_tier: 0,
    timestamp: hoursAgo(6),
    ...overrides,
  }
  const result = db
    .prepare(
      `INSERT INTO query_log
       (requester_wallet, target_wallet, endpoint, target_score, target_tier, is_free_tier, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.requester_wallet,
      row.target_wallet,
      row.endpoint,
      row.target_score,
      row.target_tier,
      row.is_free_tier,
      row.timestamp,
    )
  return { ...row, id: Number(result.lastInsertRowid) }
}

// ---------------------------------------------------------------------------
// fraud_reports
// ---------------------------------------------------------------------------

export interface TestFraudReport {
  id: string
  target_wallet: string
  reporter_wallet: string
  reason: string
  details: string
  created_at: string
  penalty_applied: number
}

export function createTestFraudReport(db: DatabaseType, overrides: Partial<TestFraudReport> = {}): TestFraudReport {
  const row: TestFraudReport = {
    id: `fraud-${++seq}`,
    target_wallet: fakeWallet(),
    reporter_wallet: fakeWallet(),
    reason: 'Suspected sybil',
    details: 'Circular transfers detected',
    created_at: hoursAgo(2),
    penalty_applied: 0,
    ...overrides,
  }
  db.prepare(
    `INSERT INTO fraud_reports (id, target_wallet, reporter_wallet, reason, details, created_at, penalty_applied)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.target_wallet, row.reporter_wallet, row.reason, row.details, row.created_at, row.penalty_applied)
  return row
}

// ---------------------------------------------------------------------------
// wallet_snapshots
// ---------------------------------------------------------------------------

export interface TestSnapshot {
  wallet: string
  usdc_balance: number
  snapshot_at: string
}

export function createTestSnapshot(db: DatabaseType, overrides: Partial<TestSnapshot> = {}): TestSnapshot {
  const row: TestSnapshot = {
    wallet: fakeWallet(),
    usdc_balance: 1000,
    snapshot_at: daysAgo(1),
    ...overrides,
  }
  db.prepare('INSERT INTO wallet_snapshots (wallet, usdc_balance, snapshot_at) VALUES (?, ?, ?)').run(
    row.wallet,
    row.usdc_balance,
    row.snapshot_at,
  )
  return row
}

// ---------------------------------------------------------------------------
// wallet_metrics
// ---------------------------------------------------------------------------

export interface TestMetrics {
  wallet: string
  tx_count_24h: number
  tx_count_7d: number
  tx_count_30d: number
  volume_in_30d: number
  volume_out_30d: number
  income_burn_ratio: number
  balance_trend_7d: string
  unique_partners_30d: number
  last_updated: string
}

export function createTestMetrics(db: DatabaseType, overrides: Partial<TestMetrics> = {}): TestMetrics {
  const row: TestMetrics = {
    wallet: fakeWallet(),
    tx_count_24h: 5,
    tx_count_7d: 20,
    tx_count_30d: 60,
    volume_in_30d: 500,
    volume_out_30d: 200,
    income_burn_ratio: 2.5,
    balance_trend_7d: 'stable',
    unique_partners_30d: 8,
    last_updated: new Date().toISOString(),
    ...overrides,
  }
  db.prepare(
    `INSERT INTO wallet_metrics
       (wallet, tx_count_24h, tx_count_7d, tx_count_30d,
        volume_in_30d, volume_out_30d, income_burn_ratio,
        balance_trend_7d, unique_partners_30d, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.wallet,
    row.tx_count_24h,
    row.tx_count_7d,
    row.tx_count_30d,
    row.volume_in_30d,
    row.volume_out_30d,
    row.income_burn_ratio,
    row.balance_trend_7d,
    row.unique_partners_30d,
    row.last_updated,
  )
  return row
}
