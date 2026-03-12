import { beforeEach, describe, expect, it, vi } from 'vitest'

const RATED_WALLET = '0x1111111111111111111111111111111111111111'
const RATER_WALLET = '0x2222222222222222222222222222222222222222'
const OTHER_RATER = '0x3333333333333333333333333333333333333333'
const TX_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const { testDb } = vi.hoisted(() => {
  const _Database = require('better-sqlite3')
  const testDb = new _Database(':memory:')
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS raw_transactions (
      tx_hash TEXT UNIQUE NOT NULL,
      block_number INTEGER,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      amount_usdc REAL,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mutual_ratings (
      id TEXT PRIMARY KEY,
      rater_wallet TEXT NOT NULL,
      rated_wallet TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(rater_wallet, rated_wallet, tx_hash)
    );
    CREATE TABLE IF NOT EXISTS scores (
      wallet TEXT PRIMARY KEY,
      composite_score INTEGER NOT NULL,
      tier TEXT NOT NULL
    );
  `)

  return { testDb }
})

vi.mock('../../src/db.js', () => ({
  getScore: (wallet: string) => testDb.prepare('SELECT * FROM scores WHERE wallet = ?').get(wallet),
  getIndexedTransactionBetweenWallets: (txHash: string, walletA: string, walletB: string) =>
    testDb
      .prepare(
        `
          SELECT tx_hash, from_wallet, to_wallet, timestamp
          FROM raw_transactions
          WHERE tx_hash = ?
            AND (
              (from_wallet = ? AND to_wallet = ?)
              OR
              (from_wallet = ? AND to_wallet = ?)
            )
          LIMIT 1
        `,
      )
      .get(txHash, walletA, walletB, walletB, walletA),
  getMutualRatingByTxAndPair: (raterWallet: string, ratedWallet: string, txHash: string) =>
    testDb
      .prepare(
        `
          SELECT id, rater_wallet, rated_wallet, tx_hash, rating, comment, created_at
          FROM mutual_ratings
          WHERE rater_wallet = ? AND rated_wallet = ? AND tx_hash = ?
          LIMIT 1
        `,
      )
      .get(raterWallet, ratedWallet, txHash),
  getRatingBreakdownForWallet: (wallet: string) =>
    testDb
      .prepare(
        `
          SELECT rating, COUNT(*) as count
          FROM mutual_ratings
          WHERE rated_wallet = ?
          GROUP BY rating
          ORDER BY rating DESC
        `,
      )
      .all(wallet),
  getRatingsSummaryForWallet: (wallet: string) =>
    (
      testDb
        .prepare(
          `
            SELECT
              COUNT(*) as rating_count,
              COUNT(DISTINCT rater_wallet) as unique_raters,
              ROUND(AVG(rating), 2) as average_rating,
              MAX(created_at) as most_recent_rating_at
            FROM mutual_ratings
            WHERE rated_wallet = ?
          `,
        )
        .get(wallet)
    ) ?? {
      rating_count: 0,
      unique_raters: 0,
      average_rating: null,
      most_recent_rating_at: null,
    },
  getIntentSummaryByTarget: () => ({
    intent_count: 0,
    conversions: 0,
    conversion_rate: 0,
    avg_time_to_tx_ms: null,
    most_recent_query_at: null,
    most_recent_conversion_at: null,
  }),
  getIntentTierBreakdownByTarget: () => [],
  insertMutualRating: (input: {
    id: string
    rater_wallet: string
    rated_wallet: string
    tx_hash: string
    rating: number
    comment: string | null
    created_at: string
  }) => {
    testDb
      .prepare(
        `
          INSERT INTO mutual_ratings (
            id,
            rater_wallet,
            rated_wallet,
            tx_hash,
            rating,
            comment,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.id,
        input.rater_wallet,
        input.rated_wallet,
        input.tx_hash,
        input.rating,
        input.comment,
        input.created_at,
      )
  },
  listMutualRatingsByWallet: (wallet: string, options: { limit: number }) =>
    testDb
      .prepare(
        `
          SELECT id, rater_wallet, rated_wallet, tx_hash, rating, comment, created_at
          FROM mutual_ratings
          WHERE rated_wallet = ?
          ORDER BY created_at DESC
          LIMIT ?
        `,
      )
      .all(wallet, options.limit),
  listIntentSignalsByTarget: () => [],
  countMutualRatingsForWallet: (wallet: string) =>
    (
      testDb.prepare('SELECT COUNT(*) as count FROM mutual_ratings WHERE rated_wallet = ?').get(wallet) as {
        count: number
      }
    ).count,
  countScoreDecay: () => 0,
  getRelationshipGraphSummary: () => ({
    counterparty_count: 0,
    outbound_tx_count: 0,
    inbound_tx_count: 0,
    total_tx_count: 0,
    volume_outbound: 0,
    volume_inbound: 0,
    total_volume: 0,
    first_interaction: null,
    last_interaction: null,
  }),
  listRelationshipCounterparties: () => [],
  listScoreDecay: () => [],
}))

vi.mock('uuid', () => ({
  v4: () => 'rating-uuid-1234',
}))

import { Hono } from 'hono'
import dataRoute from '../../src/routes/data.js'
import ratingsRoute from '../../src/routes/ratings.js'

function makeApp() {
  const app = new Hono()
  app.route('/v1/rate', ratingsRoute)
  app.route('/v1/data', dataRoute)
  return app
}

function seedTransaction(txHash: string, fromWallet: string, toWallet: string, timestamp = '2026-03-12T00:00:00Z') {
  testDb
    .prepare(
      `
        INSERT INTO raw_transactions (tx_hash, block_number, from_wallet, to_wallet, amount_usdc, timestamp)
        VALUES (?, 1, ?, ?, 25, ?)
      `,
    )
    .run(txHash, fromWallet, toWallet, timestamp)
}

function seedRating(row: {
  id: string
  rater_wallet: string
  rated_wallet: string
  tx_hash: string
  rating: number
  comment: string | null
  created_at: string
}) {
  testDb
    .prepare(
      `
        INSERT INTO mutual_ratings (id, rater_wallet, rated_wallet, tx_hash, rating, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(row.id, row.rater_wallet, row.rated_wallet, row.tx_hash, row.rating, row.comment, row.created_at)
}

describe('ratings routes', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM mutual_ratings').run()
    testDb.prepare('DELETE FROM raw_transactions').run()
    testDb.prepare('DELETE FROM scores').run()
  })

  describe('POST /v1/rate', () => {
    it('accepts a transaction-backed rating from the payer wallet', async () => {
      seedTransaction(TX_HASH, RATER_WALLET, RATED_WALLET)

      const app = makeApp()
      const res = await app.request('/v1/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-payer-address': RATER_WALLET,
        },
        body: JSON.stringify({
          rated_wallet: RATED_WALLET,
          tx_hash: TX_HASH,
          rating: 5,
          comment: 'Paid quickly and delivered.',
        }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body).toEqual({
        ratingId: 'rating-uuid-1234',
        status: 'accepted',
        ratedWallet: RATED_WALLET,
        txHash: TX_HASH,
        rating: 5,
        averageRating: 5,
        ratingCount: 1,
      })

      expect(
        testDb.prepare('SELECT COUNT(*) as count FROM mutual_ratings WHERE rated_wallet = ?').get(RATED_WALLET),
      ).toEqual({ count: 1 })
    })

    it('rejects ratings when the tx hash is not between the payer and rated wallet', async () => {
      seedTransaction(TX_HASH, OTHER_RATER, RATED_WALLET)

      const app = makeApp()
      const res = await app.request('/v1/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-payer-address': RATER_WALLET,
        },
        body: JSON.stringify({
          rated_wallet: RATED_WALLET,
          tx_hash: TX_HASH,
          rating: 4,
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_rating')
    })

    it('rejects duplicate ratings for the same wallet pair and transaction', async () => {
      seedTransaction(TX_HASH, RATER_WALLET, RATED_WALLET)
      seedRating({
        id: 'existing-rating',
        rater_wallet: RATER_WALLET,
        rated_wallet: RATED_WALLET,
        tx_hash: TX_HASH,
        rating: 4,
        comment: 'Already rated',
        created_at: '2026-03-12T00:00:00Z',
      })

      const app = makeApp()
      const res = await app.request('/v1/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-payer-address': RATER_WALLET,
        },
        body: JSON.stringify({
          rated_wallet: RATED_WALLET,
          tx_hash: TX_HASH,
          rating: 5,
        }),
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('duplicate_rating')
    })

    it('rejects self-ratings', async () => {
      seedTransaction(TX_HASH, RATER_WALLET, RATER_WALLET)

      const app = makeApp()
      const res = await app.request('/v1/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-payer-address': RATER_WALLET,
        },
        body: JSON.stringify({
          rated_wallet: RATER_WALLET,
          tx_hash: TX_HASH,
          rating: 5,
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('self_rating')
    })
  })

  describe('GET /v1/data/ratings', () => {
    it('returns aggregate rating data for a wallet', async () => {
      testDb.prepare('INSERT INTO scores (wallet, composite_score, tier) VALUES (?, ?, ?)').run(RATED_WALLET, 88, 'Trusted')

      seedRating({
        id: 'rating-1',
        rater_wallet: RATER_WALLET,
        rated_wallet: RATED_WALLET,
        tx_hash: TX_HASH,
        rating: 5,
        comment: 'Excellent counterparty',
        created_at: '2026-03-12T00:00:00Z',
      })
      seedRating({
        id: 'rating-2',
        rater_wallet: OTHER_RATER,
        rated_wallet: RATED_WALLET,
        tx_hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        rating: 3,
        comment: 'Eventually resolved',
        created_at: '2026-03-11T00:00:00Z',
      })
      seedRating({
        id: 'rating-3',
        rater_wallet: OTHER_RATER,
        rated_wallet: RATED_WALLET,
        tx_hash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        rating: 5,
        comment: null,
        created_at: '2026-03-10T00:00:00Z',
      })

      const app = makeApp()
      const res = await app.request(`/v1/data/ratings?wallet=${RATED_WALLET}`)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.wallet).toBe(RATED_WALLET)
      expect(body.current_score).toBe(88)
      expect(body.current_tier).toBe('Trusted')
      expect(body.average_rating).toBe(4.33)
      expect(body.rating_count).toBe(3)
      expect(body.unique_raters).toBe(2)
      expect(body.most_recent_rating_at).toBe('2026-03-12T00:00:00Z')
      expect(body.breakdown).toEqual([
        { rating: 5, count: 2 },
        { rating: 3, count: 1 },
      ])
      expect(body.returned).toBe(3)
      expect(body.ratings[0]).toEqual({
        rating_id: 'rating-1',
        rater_wallet: RATER_WALLET,
        tx_hash: TX_HASH,
        rating: 5,
        comment: 'Excellent counterparty',
        created_at: '2026-03-12T00:00:00Z',
      })
    })

    it('returns 404 when a wallet has no ratings data', async () => {
      const app = makeApp()
      const res = await app.request(`/v1/data/ratings?wallet=${RATED_WALLET}`)

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('wallet_not_found')
    })

    it('returns 400 for an invalid wallet', async () => {
      const app = makeApp()
      const res = await app.request('/v1/data/ratings?wallet=not-a-wallet')

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_wallet')
    })
  })
})
