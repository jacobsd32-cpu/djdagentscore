import { beforeEach, describe, expect, it, vi } from 'vitest'

const { testDb } = vi.hoisted(() => {
  const _Database = require('better-sqlite3')
  const testDb = new _Database(':memory:')
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS query_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_wallet TEXT,
      target_wallet TEXT,
      endpoint TEXT,
      tier_requested TEXT,
      price_paid REAL DEFAULT 0,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS intent_signals (
      requester_wallet TEXT NOT NULL,
      target_wallet TEXT NOT NULL,
      query_timestamp TEXT NOT NULL,
      followed_by_tx INTEGER DEFAULT 0,
      tx_hash TEXT,
      tx_timestamp TEXT,
      time_to_tx_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS score_decay (
      wallet TEXT NOT NULL,
      composite_score INTEGER NOT NULL,
      recorded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS relationship_graph (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_a TEXT NOT NULL,
      wallet_b TEXT NOT NULL,
      tx_count_a_to_b INTEGER DEFAULT 0,
      tx_count_b_to_a INTEGER DEFAULT 0,
      total_volume_a_to_b REAL DEFAULT 0,
      total_volume_b_to_a REAL DEFAULT 0,
      first_interaction TEXT NOT NULL,
      last_interaction TEXT NOT NULL,
      UNIQUE(wallet_a, wallet_b)
    );
    CREATE TABLE IF NOT EXISTS scores (
      wallet TEXT PRIMARY KEY,
      composite_score INTEGER NOT NULL,
      tier TEXT NOT NULL,
      sybil_flag INTEGER NOT NULL DEFAULT 0
    );
  `)

  return { testDb }
})

vi.mock('../../src/db.js', () => ({
  getScore: (wallet: string) => testDb.prepare('SELECT * FROM scores WHERE wallet = ?').get(wallet),
  getIndexedTransactionBetweenWallets: () => undefined,
  getMutualRatingByTxAndPair: () => undefined,
  getRatingBreakdownForWallet: () => [],
  getRatingsSummaryForWallet: () => ({
    rating_count: 0,
    unique_raters: 0,
    average_rating: null,
    most_recent_rating_at: null,
  }),
  getIntentSummaryByTarget: (wallet: string) =>
    (
      testDb
        .prepare(
          `
            SELECT
              COUNT(*) as intent_count,
              COALESCE(SUM(followed_by_tx), 0) as conversions,
              ROUND(
                CASE
                  WHEN COUNT(*) = 0 THEN 0
                  ELSE (COALESCE(SUM(followed_by_tx), 0) * 100.0) / COUNT(*)
                END,
                1
              ) as conversion_rate,
              ROUND(AVG(CASE WHEN followed_by_tx = 1 THEN time_to_tx_ms END), 0) as avg_time_to_tx_ms,
              MAX(query_timestamp) as most_recent_query_at,
              MAX(CASE WHEN followed_by_tx = 1 THEN tx_timestamp END) as most_recent_conversion_at
            FROM intent_signals
            WHERE target_wallet = ?
          `,
        )
        .get(wallet)
    ) ?? {
      intent_count: 0,
      conversions: 0,
      conversion_rate: 0,
      avg_time_to_tx_ms: null,
      most_recent_query_at: null,
      most_recent_conversion_at: null,
    },
  getIntentTierBreakdownByTarget: (wallet: string) =>
    testDb
      .prepare(
        `
          SELECT
            COALESCE(ql.tier_requested, 'unknown') as tier_requested,
            COUNT(*) as count,
            COALESCE(SUM(i.followed_by_tx), 0) as conversions
          FROM intent_signals i
          LEFT JOIN query_log ql
            ON ql.id = (
              SELECT ql2.id
              FROM query_log ql2
              WHERE ql2.requester_wallet = i.requester_wallet
                AND ql2.target_wallet = i.target_wallet
                AND ql2.timestamp = i.query_timestamp
              ORDER BY ql2.id DESC
              LIMIT 1
            )
          WHERE i.target_wallet = ?
          GROUP BY COALESCE(ql.tier_requested, 'unknown')
          ORDER BY count DESC, tier_requested ASC
        `,
      )
      .all(wallet),
  insertMutualRating: () => undefined,
  listIntentSignalsByTarget: (wallet: string, options: { limit: number }) =>
    testDb
      .prepare(
        `
          SELECT
            i.requester_wallet,
            i.query_timestamp,
            i.followed_by_tx,
            i.tx_hash,
            i.tx_timestamp,
            i.time_to_tx_ms,
            ql.endpoint,
            ql.tier_requested,
            ql.price_paid
          FROM intent_signals i
          LEFT JOIN query_log ql
            ON ql.id = (
              SELECT ql2.id
              FROM query_log ql2
              WHERE ql2.requester_wallet = i.requester_wallet
                AND ql2.target_wallet = i.target_wallet
                AND ql2.timestamp = i.query_timestamp
              ORDER BY ql2.id DESC
              LIMIT 1
            )
          WHERE i.target_wallet = ?
          ORDER BY i.query_timestamp DESC
          LIMIT ?
        `,
      )
      .all(wallet, options.limit),
  listMutualRatingsByWallet: () => [],
  listScoreDecay: (wallet: string, options: { after?: string; before?: string; limit: number }) => {
    let sql = 'SELECT wallet, composite_score, recorded_at FROM score_decay WHERE wallet = ?'
    const args: Array<string | number> = [wallet]

    if (options.after) {
      sql += ' AND recorded_at >= ?'
      args.push(options.after)
    }
    if (options.before) {
      sql += ' AND recorded_at <= ?'
      args.push(options.before)
    }

    sql += ' ORDER BY recorded_at DESC LIMIT ?'
    args.push(options.limit)

    return testDb.prepare(sql).all(...args)
  },
  countScoreDecay: (wallet: string, options: { after?: string; before?: string } = {}) => {
    let sql = 'SELECT COUNT(*) as count FROM score_decay WHERE wallet = ?'
    const args: string[] = [wallet]

    if (options.after) {
      sql += ' AND recorded_at >= ?'
      args.push(options.after)
    }
    if (options.before) {
      sql += ' AND recorded_at <= ?'
      args.push(options.before)
    }

    return (testDb.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
  },
  getRelationshipGraphSummary: (wallet: string) =>
    (testDb
      .prepare(
        `
            SELECT
              COUNT(*) as counterparty_count,
              COALESCE(SUM(CASE WHEN wallet_a = ? THEN tx_count_a_to_b ELSE tx_count_b_to_a END), 0) as outbound_tx_count,
              COALESCE(SUM(CASE WHEN wallet_a = ? THEN tx_count_b_to_a ELSE tx_count_a_to_b END), 0) as inbound_tx_count,
              COALESCE(SUM(tx_count_a_to_b + tx_count_b_to_a), 0) as total_tx_count,
              COALESCE(SUM(CASE WHEN wallet_a = ? THEN total_volume_a_to_b ELSE total_volume_b_to_a END), 0) as volume_outbound,
              COALESCE(SUM(CASE WHEN wallet_a = ? THEN total_volume_b_to_a ELSE total_volume_a_to_b END), 0) as volume_inbound,
              COALESCE(SUM(total_volume_a_to_b + total_volume_b_to_a), 0) as total_volume,
              MIN(first_interaction) as first_interaction,
              MAX(last_interaction) as last_interaction
            FROM relationship_graph
            WHERE wallet_a = ? OR wallet_b = ?
          `,
      )
      .get(wallet, wallet, wallet, wallet, wallet, wallet) as {
      counterparty_count: number
      outbound_tx_count: number
      inbound_tx_count: number
      total_tx_count: number
      volume_outbound: number
      volume_inbound: number
      total_volume: number
      first_interaction: string | null
      last_interaction: string | null
    }) ?? {
      counterparty_count: 0,
      outbound_tx_count: 0,
      inbound_tx_count: 0,
      total_tx_count: 0,
      volume_outbound: 0,
      volume_inbound: 0,
      total_volume: 0,
      first_interaction: null,
      last_interaction: null,
    },
  listRelationshipCounterparties: (wallet: string, options: { limit: number }) =>
    testDb
      .prepare(
        `
          SELECT
            CASE WHEN wallet_a = ? THEN wallet_b ELSE wallet_a END as counterparty_wallet,
            CASE WHEN wallet_a = ? THEN tx_count_a_to_b ELSE tx_count_b_to_a END as tx_count_outbound,
            CASE WHEN wallet_a = ? THEN tx_count_b_to_a ELSE tx_count_a_to_b END as tx_count_inbound,
            (tx_count_a_to_b + tx_count_b_to_a) as total_tx_count,
            CASE WHEN wallet_a = ? THEN total_volume_a_to_b ELSE total_volume_b_to_a END as volume_outbound,
            CASE WHEN wallet_a = ? THEN total_volume_b_to_a ELSE total_volume_a_to_b END as volume_inbound,
            (total_volume_a_to_b + total_volume_b_to_a) as total_volume,
            first_interaction,
            last_interaction
          FROM relationship_graph
          WHERE wallet_a = ? OR wallet_b = ?
          ORDER BY total_volume DESC, total_tx_count DESC, last_interaction DESC
          LIMIT ?
        `,
      )
      .all(wallet, wallet, wallet, wallet, wallet, wallet, wallet, options.limit),
}))

import { Hono } from 'hono'
import dataRoute from '../../src/routes/data.js'

const VALID_WALLET = '0x1111111111111111111111111111111111111111'
const VALID_WALLET_LOWER = VALID_WALLET.toLowerCase()

function makeApp() {
  const app = new Hono()
  app.route('/v1/data', dataRoute)
  return app
}

describe('GET /v1/data/*', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM query_log').run()
    testDb.prepare('DELETE FROM intent_signals').run()
    testDb.prepare('DELETE FROM score_decay').run()
    testDb.prepare('DELETE FROM relationship_graph').run()
    testDb.prepare('DELETE FROM scores').run()
  })

  it('returns score decay data with trend and trajectory', async () => {
    testDb
      .prepare('INSERT INTO scores (wallet, composite_score, tier, sybil_flag) VALUES (?, ?, ?, ?)')
      .run(VALID_WALLET_LOWER, 74, 'Established', 0)

    const stmt = testDb.prepare('INSERT INTO score_decay (wallet, composite_score, recorded_at) VALUES (?, ?, ?)')
    stmt.run(VALID_WALLET_LOWER, 52, '2026-01-01T00:00:00Z')
    stmt.run(VALID_WALLET_LOWER, 63, '2026-02-01T00:00:00Z')
    stmt.run(VALID_WALLET_LOWER, 74, '2026-03-01T00:00:00Z')

    const app = makeApp()
    const res = await app.request(`/v1/data/decay?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET_LOWER)
    expect(body.current_score).toBe(74)
    expect(body.current_tier).toBe('Established')
    expect(body.count).toBe(3)
    expect(body.returned).toBe(3)
    expect(body.decay[0]).toEqual({
      score: 74,
      recorded_at: '2026-03-01T00:00:00Z',
    })
    expect(body.trend.direction).toBe('improving')
    expect(body.period).toEqual({
      from: '2026-01-01T00:00:00Z',
      to: '2026-03-01T00:00:00Z',
    })
    expect(body.trajectory).toHaveProperty('direction')
  })

  it('returns 404 for wallets without decay data', async () => {
    const app = makeApp()
    const res = await app.request(`/v1/data/decay?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.error.code).toBe('wallet_not_found')
  })

  it('returns relationship graph data with directional totals', async () => {
    testDb
      .prepare('INSERT INTO scores (wallet, composite_score, tier, sybil_flag) VALUES (?, ?, ?, ?)')
      .run(VALID_WALLET_LOWER, 81, 'Trusted', 1)

    const stmt = testDb.prepare(`
      INSERT INTO relationship_graph (
        wallet_a,
        wallet_b,
        tx_count_a_to_b,
        tx_count_b_to_a,
        total_volume_a_to_b,
        total_volume_b_to_a,
        first_interaction,
        last_interaction
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      VALID_WALLET_LOWER,
      '0x2222222222222222222222222222222222222222',
      5,
      2,
      900,
      150,
      '2026-01-10T00:00:00Z',
      '2026-03-10T00:00:00Z',
    )
    stmt.run(
      '0x0000000000000000000000000000000000000000',
      VALID_WALLET_LOWER,
      1,
      3,
      80,
      420,
      '2026-01-05T00:00:00Z',
      '2026-03-08T00:00:00Z',
    )

    const app = makeApp()
    const res = await app.request(`/v1/data/graph?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET_LOWER)
    expect(body.current_score).toBe(81)
    expect(body.current_tier).toBe('Trusted')
    expect(body.sybil_flagged).toBe(true)
    expect(body.count).toBe(2)
    expect(body.returned).toBe(2)
    expect(body.summary).toEqual({
      counterparty_count: 2,
      outbound_tx_count: 8,
      inbound_tx_count: 3,
      total_tx_count: 11,
      volume_outbound: 1320,
      volume_inbound: 230,
      total_volume: 1550,
      first_interaction: '2026-01-05T00:00:00Z',
      last_interaction: '2026-03-10T00:00:00Z',
    })
    expect(body.counterparties[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        wallet: '0x2222222222222222222222222222222222222222',
        tx_count_outbound: 5,
        tx_count_inbound: 2,
        total_volume: 1050,
      }),
    )
  })

  it('returns 400 for invalid wallet input on graph reads', async () => {
    const app = makeApp()
    const res = await app.request('/v1/data/graph?wallet=not-a-wallet')
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('invalid_wallet')
  })

  it('returns intent conversion data for a wallet', async () => {
    testDb
      .prepare('INSERT INTO scores (wallet, composite_score, tier, sybil_flag) VALUES (?, ?, ?, ?)')
      .run(VALID_WALLET_LOWER, 77, 'Established', 0)

    testDb
      .prepare(
        `
          INSERT INTO query_log (requester_wallet, target_wallet, endpoint, tier_requested, price_paid, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        '0x2222222222222222222222222222222222222222',
        VALID_WALLET_LOWER,
        '/v1/score/full',
        'full',
        0.1,
        '2026-03-10T00:00:00Z',
      )
    testDb
      .prepare(
        `
          INSERT INTO query_log (requester_wallet, target_wallet, endpoint, tier_requested, price_paid, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        '0x3333333333333333333333333333333333333333',
        VALID_WALLET_LOWER,
        '/v1/forensics/summary',
        'forensics',
        0.1,
        '2026-03-09T00:00:00Z',
      )

    testDb
      .prepare(
        `
          INSERT INTO intent_signals (
            requester_wallet,
            target_wallet,
            query_timestamp,
            followed_by_tx,
            tx_hash,
            tx_timestamp,
            time_to_tx_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        '0x2222222222222222222222222222222222222222',
        VALID_WALLET_LOWER,
        '2026-03-10T00:00:00Z',
        1,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '2026-03-10T02:00:00Z',
        7_200_000,
      )
    testDb
      .prepare(
        `
          INSERT INTO intent_signals (
            requester_wallet,
            target_wallet,
            query_timestamp,
            followed_by_tx,
            tx_hash,
            tx_timestamp,
            time_to_tx_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        '0x3333333333333333333333333333333333333333',
        VALID_WALLET_LOWER,
        '2026-03-09T00:00:00Z',
        0,
        null,
        null,
        null,
      )

    const app = makeApp()
    const res = await app.request(`/v1/data/intent?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET_LOWER)
    expect(body.current_score).toBe(77)
    expect(body.current_tier).toBe('Established')
    expect(body.summary).toEqual({
      intent_count: 2,
      conversions: 1,
      conversion_rate: 50,
      avg_time_to_tx_ms: 7200000,
      avg_time_to_tx_hours: 2,
      most_recent_query_at: '2026-03-10T00:00:00Z',
      most_recent_conversion_at: '2026-03-10T02:00:00Z',
    })
    expect(body.by_tier).toEqual([
      { tier_requested: 'forensics', count: 1, conversions: 0, conversion_rate: 0 },
      { tier_requested: 'full', count: 1, conversions: 1, conversion_rate: 100 },
    ])
    expect(body.intents[0]).toEqual({
      counterparty_wallet: '0x2222222222222222222222222222222222222222',
      query_timestamp: '2026-03-10T00:00:00Z',
      followed_by_tx: true,
      tx_hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      tx_timestamp: '2026-03-10T02:00:00Z',
      time_to_tx_ms: 7200000,
      endpoint: '/v1/score/full',
      tier_requested: 'full',
      price_paid: 0.1,
    })
  })

  it('returns 404 for wallets without intent data', async () => {
    const app = makeApp()
    const res = await app.request(`/v1/data/intent?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.error.code).toBe('wallet_not_found')
  })
})
