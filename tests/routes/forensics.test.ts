import { beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_WALLET = '0x1111111111111111111111111111111111111111'
const VALID_WALLET_LOWER = VALID_WALLET.toLowerCase()

const { testDb } = vi.hoisted(() => {
  const _Database = require('better-sqlite3')
  const testDb = new _Database(':memory:')
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      wallet TEXT PRIMARY KEY,
      composite_score INTEGER NOT NULL,
      reliability_score INTEGER NOT NULL DEFAULT 0,
      viability_score INTEGER NOT NULL DEFAULT 0,
      identity_score INTEGER NOT NULL DEFAULT 0,
      capability_score INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL,
      raw_data TEXT NOT NULL DEFAULT '{}',
      calculated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      confidence REAL DEFAULT 0.0,
      recommendation TEXT DEFAULT 'insufficient_history',
      model_version TEXT DEFAULT '1.0.0',
      sybil_flag INTEGER DEFAULT 0,
      sybil_indicators TEXT DEFAULT '[]',
      gaming_indicators TEXT DEFAULT '[]',
      behavior_score INTEGER
    );
    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      score INTEGER NOT NULL,
      calculated_at TEXT NOT NULL,
      confidence REAL DEFAULT 0.0,
      model_version TEXT DEFAULT '1.0.0'
    );
    CREATE TABLE IF NOT EXISTS fraud_reports (
      id TEXT PRIMARY KEY,
      target_wallet TEXT NOT NULL,
      reporter_wallet TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      penalty_applied INTEGER NOT NULL DEFAULT 0,
      disputed INTEGER NOT NULL DEFAULT 0,
      dispute_resolved INTEGER NOT NULL DEFAULT 0,
      invalidated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS fraud_disputes (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL UNIQUE,
      target_wallet TEXT NOT NULL,
      disputing_wallet TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      resolution TEXT,
      resolution_notes TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT
    );
  `)
  return { testDb }
})

function buildFraudWhereClause(
  wallet: string,
  options: { after?: string; before?: string } = {},
): { sql: string; args: string[] } {
  let sql = ' FROM fraud_reports WHERE target_wallet = ? AND invalidated_at IS NULL'
  const args = [wallet]

  if (options.after) {
    sql += ' AND created_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND created_at <= ?'
    args.push(options.before)
  }

  return { sql, args }
}

function buildDisputeWhereClause(wallet: string, options: { status?: string } = {}): { sql: string; args: string[] } {
  let sql = ' FROM fraud_disputes WHERE target_wallet = ?'
  const args = [wallet]

  if (options.status) {
    sql += ' AND status = ?'
    args.push(options.status)
  }

  return { sql, args }
}

vi.mock('../../src/db.js', () => ({
  getScore: (wallet: string) => testDb.prepare('SELECT * FROM scores WHERE wallet = ? LIMIT 1').get(wallet),
  createFraudDispute: (dispute: {
    id: string
    report_id: string
    target_wallet: string
    disputing_wallet: string
    reason: string
    details: string
  }) => {
    testDb
      .prepare(
        `INSERT INTO fraud_disputes (
          id, report_id, target_wallet, disputing_wallet, reason, details,
          status, resolution, resolution_notes, created_at, resolved_at, resolved_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?, NULL, NULL)`,
      )
      .run(
        dispute.id,
        dispute.report_id,
        dispute.target_wallet,
        dispute.disputing_wallet,
        dispute.reason,
        dispute.details,
        '2026-03-13T00:00:00Z',
      )
    testDb.prepare('UPDATE fraud_reports SET disputed = 1 WHERE id = ?').run(dispute.report_id)
  },
  getFraudDisputeByReportId: (reportId: string) =>
    testDb.prepare('SELECT * FROM fraud_disputes WHERE report_id = ? LIMIT 1').get(reportId),
  getFraudReportById: (reportId: string) =>
    testDb.prepare('SELECT * FROM fraud_reports WHERE id = ? LIMIT 1').get(reportId),
  countScoreHistory: (wallet: string, options: { after?: string; before?: string } = {}) => {
    let sql = 'SELECT COUNT(*) as count FROM score_history WHERE wallet = ?'
    const args: string[] = [wallet]

    if (options.after) {
      sql += ' AND calculated_at >= ?'
      args.push(options.after)
    }
    if (options.before) {
      sql += ' AND calculated_at <= ?'
      args.push(options.before)
    }

    return (testDb.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
  },
  listScoreHistory: (wallet: string, options: { after?: string; before?: string; limit: number }) => {
    let sql = 'SELECT * FROM score_history WHERE wallet = ?'
    const args: Array<string | number> = [wallet]

    if (options.after) {
      sql += ' AND calculated_at >= ?'
      args.push(options.after)
    }
    if (options.before) {
      sql += ' AND calculated_at <= ?'
      args.push(options.before)
    }

    sql += ' ORDER BY calculated_at DESC LIMIT ?'
    args.push(options.limit)

    return testDb.prepare(sql).all(...args)
  },
  countFraudReportsByTarget: (wallet: string, options: { after?: string; before?: string } = {}) => {
    const { sql, args } = buildFraudWhereClause(wallet, options)
    return (testDb.prepare(`SELECT COUNT(*) as count${sql}`).get(...args) as { count: number } | undefined)?.count ?? 0
  },
  countFraudDisputesByTarget: (wallet: string, options: { status?: string } = {}) => {
    const { sql, args } = buildDisputeWhereClause(wallet, options)
    return (testDb.prepare(`SELECT COUNT(*) as count${sql}`).get(...args) as { count: number } | undefined)?.count ?? 0
  },
  sumFraudPenaltyByTarget: (wallet: string, options: { after?: string; before?: string } = {}) => {
    const { sql, args } = buildFraudWhereClause(wallet, options)
    return (
      (
        testDb.prepare(`SELECT COALESCE(SUM(penalty_applied), 0) as total${sql}`).get(...args) as
          | { total: number }
          | undefined
      )?.total ?? 0
    )
  },
  countDistinctReportersByTarget: (wallet: string, options: { after?: string; before?: string } = {}) => {
    const { sql, args } = buildFraudWhereClause(wallet, options)
    return (
      (
        testDb.prepare(`SELECT COUNT(DISTINCT reporter_wallet) as count${sql}`).get(...args) as
          | { count: number }
          | undefined
      )?.count ?? 0
    )
  },
  getFraudReasonBreakdown: (wallet: string) =>
    testDb
      .prepare(
        `SELECT reason, COUNT(*) as count
         FROM fraud_reports
         WHERE target_wallet = ? AND invalidated_at IS NULL
         GROUP BY reason
         ORDER BY count DESC, reason ASC`,
      )
      .all(wallet),
  listFraudReportsByTarget: (wallet: string, options: { after?: string; before?: string; limit: number }) => {
    const { sql, args } = buildFraudWhereClause(wallet, options)
    return testDb.prepare(`SELECT *${sql} ORDER BY created_at DESC LIMIT ?`).all(...args, options.limit)
  },
  listForensicsWatchlist: (options: { after?: string; before?: string; limit: number }) => {
    let sql = `
      SELECT
        fr.target_wallet as wallet,
        s.composite_score as current_score,
        s.tier as current_tier,
        COUNT(*) as report_count,
        COUNT(DISTINCT fr.reporter_wallet) as unique_reporters,
        COALESCE(SUM(fr.penalty_applied), 0) as total_penalty_applied,
        MAX(fr.created_at) as most_recent_report_at
      FROM fraud_reports fr
      LEFT JOIN scores s ON s.wallet = fr.target_wallet
      WHERE fr.invalidated_at IS NULL
    `
    const args: Array<string | number> = []

    if (options.after) {
      sql += ' AND fr.created_at >= ?'
      args.push(options.after)
    }
    if (options.before) {
      sql += ' AND fr.created_at <= ?'
      args.push(options.before)
    }

    sql += `
      GROUP BY fr.target_wallet, s.composite_score, s.tier
      ORDER BY report_count DESC, unique_reporters DESC, total_penalty_applied DESC, most_recent_report_at DESC, wallet ASC
      LIMIT ?
    `
    args.push(options.limit)

    return testDb.prepare(sql).all(...args)
  },
  countForensicsWatchlistTargets: (options: { after?: string; before?: string } = {}) => {
    let sql = `
      SELECT COUNT(*) as count
      FROM (
        SELECT fr.target_wallet
        FROM fraud_reports fr
        WHERE fr.invalidated_at IS NULL
    `
    const args: string[] = []

    if (options.after) {
      sql += ' AND fr.created_at >= ?'
      args.push(options.after)
    }
    if (options.before) {
      sql += ' AND fr.created_at <= ?'
      args.push(options.before)
    }

    sql += ' GROUP BY fr.target_wallet ) watchlist'

    return (testDb.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
  },
  listForensicsFeed: (options: { after?: string; before?: string; reason?: string; limit: number }) => {
    let aggregateClause = 'agg_src.invalidated_at IS NULL'
    let rowClause = 'fr.invalidated_at IS NULL'
    const aggregateArgs: string[] = []
    const rowArgs: string[] = []

    if (options.after) {
      aggregateClause += ' AND agg_src.created_at >= ?'
      rowClause += ' AND fr.created_at >= ?'
      aggregateArgs.push(options.after)
      rowArgs.push(options.after)
    }
    if (options.before) {
      aggregateClause += ' AND agg_src.created_at <= ?'
      rowClause += ' AND fr.created_at <= ?'
      aggregateArgs.push(options.before)
      rowArgs.push(options.before)
    }
    if (options.reason) {
      aggregateClause += ' AND agg_src.reason = ?'
      rowClause += ' AND fr.reason = ?'
      rowArgs.push(options.reason)
      aggregateArgs.push(options.reason)
    }

    const sql = `
      SELECT
        fr.id as report_id,
        fr.target_wallet as wallet,
        fr.reason,
        fr.details,
        fr.created_at,
        fr.penalty_applied,
        s.composite_score as current_score,
        s.tier as current_tier,
        agg.report_count,
        agg.unique_reporters,
        agg.total_penalty_applied
      FROM fraud_reports fr
      JOIN (
        SELECT
          agg_src.target_wallet,
          COUNT(*) as report_count,
          COUNT(DISTINCT agg_src.reporter_wallet) as unique_reporters,
          COALESCE(SUM(agg_src.penalty_applied), 0) as total_penalty_applied
        FROM fraud_reports agg_src
        WHERE ${aggregateClause}
        GROUP BY agg_src.target_wallet
      ) agg ON agg.target_wallet = fr.target_wallet
      LEFT JOIN scores s ON s.wallet = fr.target_wallet
      WHERE ${rowClause}
      ORDER BY fr.created_at DESC, fr.target_wallet ASC, fr.id ASC
      LIMIT ?
    `

    return testDb.prepare(sql).all(...aggregateArgs, ...rowArgs, options.limit)
  },
  countForensicsFeed: (options: { after?: string; before?: string; reason?: string } = {}) => {
    let sql = 'SELECT COUNT(*) as count FROM fraud_reports fr WHERE fr.invalidated_at IS NULL'
    const args: string[] = []

    if (options.after) {
      sql += ' AND fr.created_at >= ?'
      args.push(options.after)
    }
    if (options.before) {
      sql += ' AND fr.created_at <= ?'
      args.push(options.before)
    }
    if (options.reason) {
      sql += ' AND fr.reason = ?'
      args.push(options.reason)
    }

    return (testDb.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
  },
}))

import { Hono } from 'hono'
import forensicsRoute from '../../src/routes/forensics.js'

function makeApp() {
  const app = new Hono()
  app.route('/v1/forensics', forensicsRoute)
  return app
}

function clearTables() {
  testDb.exec('DELETE FROM scores')
  testDb.exec('DELETE FROM score_history')
  testDb.exec('DELETE FROM fraud_disputes')
  testDb.exec('DELETE FROM fraud_reports')
}

function seedCurrentScore(wallet: string, compositeScore = 68, tier = 'Established') {
  testDb
    .prepare(`
      INSERT INTO scores (
        wallet, composite_score, reliability_score, viability_score, identity_score, capability_score,
        tier, raw_data, calculated_at, expires_at, confidence
      ) VALUES (?, ?, 70, 68, 66, 65, ?, '{}', '2026-03-10T00:00:00Z', '2026-03-13T00:00:00Z', 0.84)
    `)
    .run(wallet, compositeScore, tier)
}

function seedScoreHistory(
  wallet: string,
  entries: Array<{ score: number; calculated_at: string; confidence?: number; model_version?: string }>,
) {
  const stmt = testDb.prepare(
    'INSERT INTO score_history (wallet, score, calculated_at, confidence, model_version) VALUES (?, ?, ?, ?, ?)',
  )
  for (const entry of entries) {
    stmt.run(wallet, entry.score, entry.calculated_at, entry.confidence ?? 0.8, entry.model_version ?? '2.5.0')
  }
}

function seedFraudReports(
  wallet: string,
  reports: Array<{
    id: string
    reporter_wallet: string
    reason: string
    created_at: string
    penalty_applied?: number
    details?: string
  }>,
) {
  const stmt = testDb.prepare(
    `INSERT INTO fraud_reports (id, target_wallet, reporter_wallet, reason, details, created_at, penalty_applied)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  for (const report of reports) {
    stmt.run(
      report.id,
      wallet,
      report.reporter_wallet,
      report.reason,
      report.details ?? 'Observed suspicious behavior',
      report.created_at,
      report.penalty_applied ?? 5,
    )
  }
}

function seedFraudDisputes(
  disputes: Array<{
    id: string
    report_id: string
    target_wallet: string
    disputing_wallet?: string
    reason?: string
    details?: string
    status?: 'open' | 'resolved'
    resolution?: 'upheld' | 'rejected' | null
    resolution_notes?: string | null
    created_at?: string
    resolved_at?: string | null
    resolved_by?: string | null
  }>,
) {
  const stmt = testDb.prepare(
    `INSERT INTO fraud_disputes (
      id, report_id, target_wallet, disputing_wallet, reason, details,
      status, resolution, resolution_notes, created_at, resolved_at, resolved_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  for (const dispute of disputes) {
    stmt.run(
      dispute.id,
      dispute.report_id,
      dispute.target_wallet,
      dispute.disputing_wallet ?? dispute.target_wallet,
      dispute.reason ?? 'fulfilled_service',
      dispute.details ?? 'Service logs shared with the buyer.',
      dispute.status ?? 'open',
      dispute.resolution ?? null,
      dispute.resolution_notes ?? null,
      dispute.created_at ?? '2026-03-12T12:00:00Z',
      dispute.resolved_at ?? null,
      dispute.resolved_by ?? null,
    )
  }
}

describe('DJD Forensics routes', () => {
  beforeEach(() => {
    clearTables()
  })

  it('returns an aggregated forensics summary for a wallet', async () => {
    seedCurrentScore(VALID_WALLET_LOWER)
    seedScoreHistory(VALID_WALLET_LOWER, [
      { score: 72, calculated_at: '2026-03-08T00:00:00Z' },
      { score: 68, calculated_at: '2026-03-09T00:00:00Z' },
    ])
    seedFraudReports(VALID_WALLET_LOWER, [
      {
        id: 'rpt-3',
        reporter_wallet: '0x2222222222222222222222222222222222222222',
        reason: 'payment_fraud',
        created_at: '2026-03-11T00:00:00Z',
      },
      {
        id: 'rpt-2',
        reporter_wallet: '0x3333333333333333333333333333333333333333',
        reason: 'payment_fraud',
        created_at: '2026-03-10T12:00:00Z',
      },
      {
        id: 'rpt-1',
        reporter_wallet: '0x2222222222222222222222222222222222222222',
        reason: 'malicious_behavior',
        created_at: '2026-03-10T00:00:00Z',
      },
    ])
    seedFraudDisputes([
      {
        id: 'disp-1',
        report_id: 'rpt-2',
        target_wallet: VALID_WALLET_LOWER,
      },
    ])

    const res = await makeApp().request(`/v1/forensics/summary?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET_LOWER)
    expect(body.risk_level).toBe('elevated')
    expect(body.current_score).toBe(68)
    expect(body.current_tier).toBe('Established')
    expect(body.report_count).toBe(3)
    expect(body.total_penalty_applied).toBe(15)
    expect(body.unique_reporters).toBe(2)
    expect(body.most_recent_report_at).toBe('2026-03-11T00:00:00Z')
    expect(body.dispute_status).toBe('open')
    expect(body.open_disputes).toBe(1)
    expect(body.resolved_disputes).toBe(0)
    expect(body.score_history_entries).toBe(2)
    expect(body.reasons).toEqual([
      { reason: 'payment_fraud', count: 2 },
      { reason: 'malicious_behavior', count: 1 },
    ])
    expect(body.recent_reports).toHaveLength(3)
    expect(body.recent_reports[0]).toMatchObject({
      report_id: 'rpt-3',
      reason: 'payment_fraud',
      penalty_applied: 5,
    })
  })

  it('returns a clean summary for a valid wallet with no forensics data', async () => {
    const res = await makeApp().request(`/v1/forensics/summary?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.risk_level).toBe('clear')
    expect(body.current_score).toBeNull()
    expect(body.report_count).toBe(0)
    expect(body.total_penalty_applied).toBe(0)
    expect(body.dispute_status).toBe('none')
    expect(body.open_disputes).toBe(0)
    expect(body.resolved_disputes).toBe(0)
    expect(body.recent_reports).toEqual([])
    expect(body.reasons).toEqual([])
    expect(body.score_history_entries).toBe(0)
  })

  it('accepts a dispute from the reported wallet', async () => {
    seedFraudReports(VALID_WALLET_LOWER, [
      {
        id: 'rpt-dispute-1',
        reporter_wallet: '0x2222222222222222222222222222222222222222',
        reason: 'payment_fraud',
        created_at: '2026-03-12T00:00:00Z',
      },
    ])

    const res = await makeApp().request('/v1/forensics/dispute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-payer-address': VALID_WALLET,
      },
      body: JSON.stringify({
        report_id: 'rpt-dispute-1',
        reason: 'fulfilled_service',
        details: 'Logs and output were delivered immediately after payment.',
      }),
    })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.status).toBe('open')
    expect(body.reportId).toBe('rpt-dispute-1')
    expect(body.targetWallet).toBe(VALID_WALLET_LOWER)
    expect(body.disputeId).toEqual(expect.any(String))

    const disputes = testDb.prepare('SELECT * FROM fraud_disputes').all() as Array<Record<string, unknown>>
    expect(disputes).toHaveLength(1)
    expect(disputes[0]?.report_id).toBe('rpt-dispute-1')
    expect(testDb.prepare('SELECT disputed FROM fraud_reports WHERE id = ?').get('rpt-dispute-1')).toEqual({
      disputed: 1,
    })
  })

  it('rejects a duplicate open dispute for the same report', async () => {
    seedFraudReports(VALID_WALLET_LOWER, [
      {
        id: 'rpt-dispute-2',
        reporter_wallet: '0x2222222222222222222222222222222222222222',
        reason: 'payment_fraud',
        created_at: '2026-03-12T00:00:00Z',
      },
    ])
    seedFraudDisputes([
      {
        id: 'disp-existing',
        report_id: 'rpt-dispute-2',
        target_wallet: VALID_WALLET_LOWER,
        status: 'open',
      },
    ])

    const res = await makeApp().request('/v1/forensics/dispute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-payer-address': VALID_WALLET,
      },
      body: JSON.stringify({
        report_id: 'rpt-dispute-2',
        reason: 'fulfilled_service',
        details: 'Already under review.',
      }),
    })
    expect(res.status).toBe(409)

    const body = await res.json()
    expect(body.error.code).toBe('dispute_already_open')
  })

  it('returns a filtered forensics incident feed with full report details', async () => {
    seedFraudReports(VALID_WALLET_LOWER, [
      {
        id: 'rpt-3',
        reporter_wallet: '0x2222222222222222222222222222222222222222',
        reason: 'payment_fraud',
        details: 'Collected payment and never delivered the requested service.',
        created_at: '2026-03-11T00:00:00Z',
      },
      {
        id: 'rpt-2',
        reporter_wallet: '0x3333333333333333333333333333333333333333',
        reason: 'impersonation',
        details: 'Claimed to represent another agent in the same thread.',
        created_at: '2026-03-09T00:00:00Z',
      },
      {
        id: 'rpt-1',
        reporter_wallet: '0x4444444444444444444444444444444444444444',
        reason: 'malicious_behavior',
        details: 'Returned hostile prompt injections instead of results.',
        created_at: '2026-03-07T00:00:00Z',
      },
    ])

    const res = await makeApp().request(`/v1/forensics/reports?wallet=${VALID_WALLET}&after=2026-03-08&limit=1`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET_LOWER)
    expect(body.risk_level).toBe('elevated')
    expect(body.count).toBe(2)
    expect(body.returned).toBe(1)
    expect(body.unique_reporters).toBe(2)
    expect(body.total_penalty_applied).toBe(10)
    expect(body.period).toEqual({
      from: '2026-03-08',
      to: '2026-03-11T00:00:00Z',
    })
    expect(body.reports).toEqual([
      {
        report_id: 'rpt-3',
        reason: 'payment_fraud',
        details: 'Collected payment and never delivered the requested service.',
        created_at: '2026-03-11T00:00:00Z',
        penalty_applied: 5,
      },
    ])
  })

  it('returns a ranked forensics watchlist across reported wallets', async () => {
    seedCurrentScore(VALID_WALLET_LOWER, 54, 'Emerging')
    seedCurrentScore('0x2222222222222222222222222222222222222222', 33, 'Emerging')
    seedCurrentScore('0x3333333333333333333333333333333333333333', 79, 'Trusted')
    seedFraudReports(VALID_WALLET_LOWER, [
      {
        id: 'rpt-a1',
        reporter_wallet: '0xaaaa222222222222222222222222222222222222',
        reason: 'payment_fraud',
        created_at: '2026-03-10T00:00:00Z',
      },
      {
        id: 'rpt-a2',
        reporter_wallet: '0xbbbb222222222222222222222222222222222222',
        reason: 'payment_fraud',
        created_at: '2026-03-11T00:00:00Z',
      },
      {
        id: 'rpt-a3',
        reporter_wallet: '0xcccc222222222222222222222222222222222222',
        reason: 'impersonation',
        created_at: '2026-03-12T00:00:00Z',
      },
    ])
    seedFraudReports('0x2222222222222222222222222222222222222222', [
      {
        id: 'rpt-b1',
        reporter_wallet: '0xdddd222222222222222222222222222222222222',
        reason: 'malicious_behavior',
        created_at: '2026-03-12T06:00:00Z',
      },
      {
        id: 'rpt-b2',
        reporter_wallet: '0xdddd222222222222222222222222222222222222',
        reason: 'payment_fraud',
        created_at: '2026-03-13T00:00:00Z',
      },
    ])
    seedFraudReports('0x3333333333333333333333333333333333333333', [
      {
        id: 'rpt-c1',
        reporter_wallet: '0xeeee222222222222222222222222222222222222',
        reason: 'other',
        created_at: '2026-03-07T00:00:00Z',
      },
    ])

    const res = await makeApp().request('/v1/forensics/watchlist?after=2026-03-09&limit=2')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.count).toBe(2)
    expect(body.returned).toBe(2)
    expect(body.period).toEqual({
      from: '2026-03-09',
      to: null,
    })
    expect(body.wallets).toEqual([
      {
        rank: 1,
        wallet: VALID_WALLET_LOWER,
        risk_level: 'elevated',
        current_score: 54,
        current_tier: 'Emerging',
        report_count: 3,
        unique_reporters: 3,
        total_penalty_applied: 15,
        most_recent_report_at: '2026-03-12T00:00:00Z',
      },
      {
        rank: 2,
        wallet: '0x2222222222222222222222222222222222222222',
        risk_level: 'elevated',
        current_score: 33,
        current_tier: 'Emerging',
        report_count: 2,
        unique_reporters: 1,
        total_penalty_applied: 10,
        most_recent_report_at: '2026-03-13T00:00:00Z',
      },
    ])
  })

  it('returns a filtered corpus-wide incident feed with wallet context', async () => {
    seedCurrentScore(VALID_WALLET_LOWER, 54, 'Emerging')
    seedCurrentScore('0x2222222222222222222222222222222222222222', 33, 'Emerging')
    seedFraudReports(VALID_WALLET_LOWER, [
      {
        id: 'rpt-f1',
        reporter_wallet: '0xaaaa222222222222222222222222222222222222',
        reason: 'payment_fraud',
        details: 'First delivery failed after payment settled.',
        created_at: '2026-03-10T00:00:00Z',
      },
      {
        id: 'rpt-f2',
        reporter_wallet: '0xbbbb222222222222222222222222222222222222',
        reason: 'impersonation',
        details: 'Claimed a false operator identity.',
        created_at: '2026-03-11T00:00:00Z',
      },
    ])
    seedFraudReports('0x2222222222222222222222222222222222222222', [
      {
        id: 'rpt-f3',
        reporter_wallet: '0xcccc222222222222222222222222222222222222',
        reason: 'payment_fraud',
        details: 'Took payment and returned an empty response.',
        created_at: '2026-03-12T00:00:00Z',
      },
      {
        id: 'rpt-f4',
        reporter_wallet: '0xdddd222222222222222222222222222222222222',
        reason: 'payment_fraud',
        details: 'Repeated nondelivery on a second request.',
        created_at: '2026-03-13T00:00:00Z',
      },
    ])

    const res = await makeApp().request('/v1/forensics/feed?reason=payment_fraud&after=2026-03-10&limit=2')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.count).toBe(3)
    expect(body.returned).toBe(2)
    expect(body.reason_filter).toBe('payment_fraud')
    expect(body.period).toEqual({
      from: '2026-03-10',
      to: null,
    })
    expect(body.incidents).toEqual([
      {
        report_id: 'rpt-f4',
        wallet: '0x2222222222222222222222222222222222222222',
        reason: 'payment_fraud',
        details: 'Repeated nondelivery on a second request.',
        created_at: '2026-03-13T00:00:00Z',
        penalty_applied: 5,
        current_score: 33,
        current_tier: 'Emerging',
        risk_level: 'elevated',
        report_count: 2,
        unique_reporters: 2,
        total_penalty_applied: 10,
      },
      {
        report_id: 'rpt-f3',
        wallet: '0x2222222222222222222222222222222222222222',
        reason: 'payment_fraud',
        details: 'Took payment and returned an empty response.',
        created_at: '2026-03-12T00:00:00Z',
        penalty_applied: 5,
        current_score: 33,
        current_tier: 'Emerging',
        risk_level: 'elevated',
        report_count: 2,
        unique_reporters: 2,
        total_penalty_applied: 10,
      },
    ])
  })

  it('returns a merged forensics timeline with incidents and score snapshots', async () => {
    seedScoreHistory(VALID_WALLET_LOWER, [
      { score: 70, calculated_at: '2026-03-07T00:00:00Z' },
      { score: 64, calculated_at: '2026-03-09T00:00:00Z' },
      { score: 59, calculated_at: '2026-03-10T00:00:00Z' },
    ])
    seedFraudReports(VALID_WALLET_LOWER, [
      {
        id: 'rpt-2',
        reporter_wallet: '0x4444444444444444444444444444444444444444',
        reason: 'payment_fraud',
        created_at: '2026-03-11T00:00:00Z',
      },
      {
        id: 'rpt-1',
        reporter_wallet: '0x5555555555555555555555555555555555555555',
        reason: 'impersonation',
        created_at: '2026-03-08T12:00:00Z',
      },
    ])

    const res = await makeApp().request(`/v1/forensics/timeline?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET_LOWER)
    expect(body.risk_level).toBe('elevated')
    expect(body.count).toBe(5)
    expect(body.returned).toBe(5)
    expect(body.breakdown).toEqual({ score_snapshots: 3, fraud_reports: 2 })
    expect(body.report_summary).toEqual({ report_count: 2, total_penalty_applied: 10 })
    expect(body.period).toEqual({
      from: '2026-03-07T00:00:00Z',
      to: '2026-03-11T00:00:00Z',
    })
    expect(body.events.map((event: { type: string }) => event.type)).toEqual([
      'fraud_report',
      'score_snapshot',
      'score_snapshot',
      'fraud_report',
      'score_snapshot',
    ])
    expect(body.events[0]).toMatchObject({
      type: 'fraud_report',
      report_id: 'rpt-2',
      reason: 'payment_fraud',
    })
    expect(body.events[1]).toMatchObject({
      type: 'score_snapshot',
      score: 59,
    })
    expect(body.trend.direction).toBe('declining')
    expect(body.trajectory).toBeDefined()
  })

  it('returns 404 when the wallet has no timeline data', async () => {
    const res = await makeApp().request(`/v1/forensics/timeline?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.error.code).toBe('forensics_not_found')
    expect(body.error.message).toBe('No forensics data found for this wallet')
  })
})
