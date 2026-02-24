import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

// Use vi.hoisted so the db is available when vi.mock factory runs (vi.mock is hoisted)
const { testDb } = vi.hoisted(() => {
  const _Database = require('better-sqlite3')
  const testDb = new _Database(':memory:')
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS score_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet        TEXT NOT NULL,
      score         INTEGER NOT NULL,
      calculated_at TEXT NOT NULL,
      confidence    REAL DEFAULT 0.0,
      model_version TEXT DEFAULT '1.0.0'
    );
    CREATE INDEX IF NOT EXISTS idx_history_wallet ON score_history(wallet, calculated_at DESC);
  `)
  return { testDb }
})

vi.mock('../../src/db.js', () => ({
  db: testDb,
}))

import { Hono } from 'hono'
import historyRoute from '../../src/routes/history.js'

const VALID_WALLET = '0x1111111111111111111111111111111111111111'
const VALID_WALLET_LOWER = VALID_WALLET.toLowerCase()

function makeApp() {
  const app = new Hono()
  app.route('/v1/score/history', historyRoute)
  return app
}

function seedHistory(
  wallet: string,
  entries: Array<{ score: number; calculated_at: string; confidence?: number; model_version?: string }>,
) {
  const stmt = testDb.prepare(
    'INSERT INTO score_history (wallet, score, calculated_at, confidence, model_version) VALUES (?, ?, ?, ?, ?)',
  )
  for (const e of entries) {
    stmt.run(wallet, e.score, e.calculated_at, e.confidence ?? 0.85, e.model_version ?? '2.0.0')
  }
}

function clearHistory() {
  testDb.exec('DELETE FROM score_history')
}

describe('GET /v1/score/history', () => {
  beforeEach(() => {
    clearHistory()
  })

  // 1. Valid wallet with history -> returns paginated results + trend
  it('returns paginated results with trend for a valid wallet with history', async () => {
    seedHistory(VALID_WALLET_LOWER, [
      { score: 60, calculated_at: '2024-01-01T00:00:00Z' },
      { score: 65, calculated_at: '2024-02-01T00:00:00Z' },
      { score: 72, calculated_at: '2024-03-01T00:00:00Z' },
      { score: 80, calculated_at: '2024-04-01T00:00:00Z' },
    ])

    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET_LOWER)
    expect(body.history).toHaveLength(4)
    expect(body.count).toBe(4)
    expect(body.returned).toBe(4)
    // Newest first
    expect(body.history[0].score).toBe(80)
    expect(body.history[3].score).toBe(60)
    // Each entry has expected fields
    expect(body.history[0]).toHaveProperty('confidence')
    expect(body.history[0]).toHaveProperty('model_version')
    expect(body.history[0]).toHaveProperty('calculated_at')
    // Trend should be present
    expect(body.trend).toBeDefined()
    expect(body.trend.direction).toBe('improving')
    expect(body.period).toBeDefined()
    expect(body.period.from).toBe('2024-01-01T00:00:00Z')
    expect(body.period.to).toBe('2024-04-01T00:00:00Z')
  })

  // 2. Valid wallet with no history -> 404 with history_not_found
  it('returns 404 with history_not_found for wallet with no history', async () => {
    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.error.code).toBe('history_not_found')
    expect(body.error.message).toBe('No score history found for this wallet')
  })

  // 3. Invalid wallet -> 400 with invalid_wallet
  it('returns 400 with invalid_wallet for an invalid address', async () => {
    const app = makeApp()
    const res = await app.request('/v1/score/history?wallet=not-a-wallet')
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('invalid_wallet')
    expect(body.error.message).toBe('Valid Ethereum wallet address required')
  })

  it('returns 400 when wallet param is missing', async () => {
    const app = makeApp()
    const res = await app.request('/v1/score/history')
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('invalid_wallet')
  })

  // 4. Date range filtering works
  it('filters results by after and before date params', async () => {
    seedHistory(VALID_WALLET_LOWER, [
      { score: 50, calculated_at: '2024-01-15T00:00:00Z' },
      { score: 55, calculated_at: '2024-03-15T00:00:00Z' },
      { score: 60, calculated_at: '2024-06-15T00:00:00Z' },
      { score: 70, calculated_at: '2024-09-15T00:00:00Z' },
      { score: 75, calculated_at: '2024-12-15T00:00:00Z' },
    ])

    const app = makeApp()
    const res = await app.request(
      `/v1/score/history?wallet=${VALID_WALLET}&after=2024-03-01&before=2024-10-01`,
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    // Should include March 15, June 15, and Sept 15 entries (3 total)
    expect(body.returned).toBe(3)
    expect(body.history[0].score).toBe(70)  // newest first: Sept
    expect(body.history[1].score).toBe(60)  // June
    expect(body.history[2].score).toBe(55)  // March
  })

  // 5. Limit capping at 100
  it('caps limit at 100 even when requesting more', async () => {
    // Seed 105 records
    const entries = Array.from({ length: 105 }, (_, i) => ({
      score: 50 + (i % 30),
      calculated_at: `2024-01-${String(1 + Math.floor(i / 5)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
    }))
    seedHistory(VALID_WALLET_LOWER, entries)

    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}&limit=200`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.returned).toBeLessThanOrEqual(100)
    expect(body.count).toBe(105) // total count should reflect all records
  })

  // 6. Default limit is 50
  it('defaults to limit of 50 when no limit param is provided', async () => {
    // Seed 60 records
    const entries = Array.from({ length: 60 }, (_, i) => ({
      score: 50 + (i % 20),
      calculated_at: `2024-01-${String(1 + Math.floor(i / 3)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
    }))
    seedHistory(VALID_WALLET_LOWER, entries)

    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.returned).toBe(50)
    expect(body.count).toBe(60) // total count is 60
  })

  // 7. Trend: improving
  it('returns trend direction "improving" when latest score exceeds earliest by more than 5', async () => {
    seedHistory(VALID_WALLET_LOWER, [
      { score: 40, calculated_at: '2024-01-01T00:00:00Z' },
      { score: 55, calculated_at: '2024-02-01T00:00:00Z' },
      { score: 70, calculated_at: '2024-03-01T00:00:00Z' },
    ])

    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.trend).toBeDefined()
    expect(body.trend.direction).toBe('improving')
    expect(body.trend.change_pct).toBeGreaterThan(0)
    expect(body.trend.min_score).toBe(40)
    expect(body.trend.max_score).toBe(70)
  })

  // 8. Trend: declining
  it('returns trend direction "declining" when latest score is below earliest by more than 5', async () => {
    seedHistory(VALID_WALLET_LOWER, [
      { score: 80, calculated_at: '2024-01-01T00:00:00Z' },
      { score: 65, calculated_at: '2024-02-01T00:00:00Z' },
      { score: 50, calculated_at: '2024-03-01T00:00:00Z' },
    ])

    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.trend).toBeDefined()
    expect(body.trend.direction).toBe('declining')
    expect(body.trend.change_pct).toBeLessThan(0)
    expect(body.trend.min_score).toBe(50)
    expect(body.trend.max_score).toBe(80)
  })

  // 9. Trend: stable
  it('returns trend direction "stable" when score change is within 5 points', async () => {
    seedHistory(VALID_WALLET_LOWER, [
      { score: 70, calculated_at: '2024-01-01T00:00:00Z' },
      { score: 72, calculated_at: '2024-02-01T00:00:00Z' },
      { score: 73, calculated_at: '2024-03-01T00:00:00Z' },
    ])

    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.trend).toBeDefined()
    expect(body.trend.direction).toBe('stable')
  })

  // 10. Single record -> no trend (trend is null / not present)
  it('does not include trend when there is only a single history entry', async () => {
    seedHistory(VALID_WALLET_LOWER, [
      { score: 65, calculated_at: '2024-06-01T00:00:00Z' },
    ])

    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.history).toHaveLength(1)
    expect(body.trend).toBeUndefined()
  })

  // 11. Invalid date format -> 400 with invalid_date_range
  it('returns 400 with invalid_date_range for invalid "after" date', async () => {
    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}&after=not-a-date`)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('invalid_date_range')
    expect(body.error.message).toContain('"after"')
  })

  it('returns 400 with invalid_date_range for invalid "before" date', async () => {
    const app = makeApp()
    const res = await app.request(`/v1/score/history?wallet=${VALID_WALLET}&before=xyz`)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('invalid_date_range')
    expect(body.error.message).toContain('"before"')
  })
})
