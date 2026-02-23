/**
 * Gaming Detection Tests
 *
 * Tests all 5 anti-gaming velocity checks by constructing minimal in-memory
 * SQLite databases. Because detectGaming() accepts a Database parameter (DI),
 * and getAvgBalance24h() also accepts db, we can test with real SQLite.
 *
 * Time-sensitive checks use data timestamped relative to "now" to avoid mocking Date.
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { detectGaming, getAvgBalance24h } from '../src/scoring/gaming.js'

// Minimal schema — only the 4 tables gaming.ts queries
function createGamingDb(): Database.Database {
  const db = new Database(':memory:')
  db.prepare(`CREATE TABLE wallet_metrics (
      wallet TEXT PRIMARY KEY,
      tx_count_24h INTEGER DEFAULT 0,
      tx_count_7d INTEGER DEFAULT 0,
      updated_at TEXT
  )`).run()
  db.prepare(`CREATE TABLE wallet_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT,
      usdc_balance REAL,
      snapshot_at TEXT
  )`).run()
  db.prepare(`CREATE TABLE raw_transactions (
      tx_hash TEXT UNIQUE,
      block_number INTEGER,
      from_wallet TEXT,
      to_wallet TEXT,
      amount REAL,
      timestamp TEXT,
      facilitator TEXT
  )`).run()
  db.prepare(`CREATE TABLE query_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_wallet TEXT,
      endpoint TEXT,
      timestamp TEXT
  )`).run()
  return db
}

const WALLET = '0xgamer'
const now = new Date()

// Helper: ISO timestamp N minutes ago
function minutesAgo(n: number): string {
  return new Date(now.getTime() - n * 60 * 1000).toISOString()
}
function hoursAgo(n: number): string {
  return new Date(now.getTime() - n * 60 * 60 * 1000).toISOString()
}

describe('getAvgBalance24h', () => {
  it('returns null when no snapshots exist', () => {
    const db = createGamingDb()
    expect(getAvgBalance24h(WALLET, db)).toBeNull()
  })

  it('returns average of recent snapshots', () => {
    const db = createGamingDb()
    // 3 snapshots in last 24h: 100, 200, 300 -> avg = 200
    db.prepare(`INSERT INTO wallet_snapshots (wallet, usdc_balance, snapshot_at) VALUES (?, ?, ?)`).run(
      WALLET, 100, minutesAgo(60),
    )
    db.prepare(`INSERT INTO wallet_snapshots (wallet, usdc_balance, snapshot_at) VALUES (?, ?, ?)`).run(
      WALLET, 200, minutesAgo(120),
    )
    db.prepare(`INSERT INTO wallet_snapshots (wallet, usdc_balance, snapshot_at) VALUES (?, ?, ?)`).run(
      WALLET, 300, minutesAgo(180),
    )

    const avg = getAvgBalance24h(WALLET, db)
    expect(avg).toBe(200)
  })
})

describe('detectGaming', () => {
  it('returns clean result for an empty database', () => {
    const db = createGamingDb()
    const result = detectGaming(WALLET, 100, db)

    expect(result.gamingDetected).toBe(false)
    expect(result.indicators).toEqual([])
    expect(result.penalties.composite).toBe(0)
    expect(result.penalties.reliability).toBe(0)
    expect(result.penalties.viability).toBe(0)
    expect(result.overrides.useAvgBalance).toBe(false)
  })

  // -- CHECK 1: Velocity spike --
  it('detects velocity_spike when 24h tx count is >10x daily average', () => {
    const db = createGamingDb()
    // 7d count = 7 -> daily avg = 1, 24h count = 15 -> 15x the average
    db.prepare(`INSERT INTO wallet_metrics (wallet, tx_count_24h, tx_count_7d) VALUES (?, ?, ?)`).run(
      WALLET, 15, 7,
    )

    const result = detectGaming(WALLET, 100, db)
    expect(result.indicators).toContain('velocity_spike')
    expect(result.penalties.composite).toBeGreaterThanOrEqual(10)
  })

  it('does NOT flag velocity_spike when increase is within normal range', () => {
    const db = createGamingDb()
    // 7d count = 70 -> daily avg = 10, 24h count = 50 -> 5x (below 10x threshold)
    db.prepare(`INSERT INTO wallet_metrics (wallet, tx_count_24h, tx_count_7d) VALUES (?, ?, ?)`).run(
      WALLET, 50, 70,
    )

    const result = detectGaming(WALLET, 100, db)
    expect(result.indicators).not.toContain('velocity_spike')
  })

  // -- CHECK 2: Deposit-and-score --
  it('detects deposit_and_score when balance is 5x avg AND recently queried', () => {
    const db = createGamingDb()
    // Average balance over 24h = 100 (from snapshots)
    db.prepare(`INSERT INTO wallet_snapshots (wallet, usdc_balance, snapshot_at) VALUES (?, ?, ?)`).run(
      WALLET, 100, minutesAgo(120),
    )
    // Recent query within last hour
    db.prepare(`INSERT INTO query_log (target_wallet, endpoint, timestamp) VALUES (?, ?, ?)`).run(
      WALLET, '/v1/score/basic', minutesAgo(30),
    )

    // Current balance = 600 -> 6x avg (>5x threshold)
    const result = detectGaming(WALLET, 600, db)
    expect(result.indicators).toContain('deposit_and_score')
    expect(result.penalties.viability).toBeGreaterThanOrEqual(5)
  })

  // -- CHECK 3: Burst-and-stop --
  it('detects burst_and_stop when 0 tx in last hour but >20 in prior 24h', () => {
    const db = createGamingDb()
    // No transactions in the last hour
    // But >20 transactions in the 1-24 hour window
    for (let i = 0; i < 25; i++) {
      db.prepare(
        `INSERT INTO raw_transactions (tx_hash, from_wallet, to_wallet, amount, timestamp) VALUES (?, ?, ?, ?, ?)`,
      ).run(`0xtx${i}`, WALLET, '0xrecipient', 10, hoursAgo(2 + Math.random() * 20))
    }

    const result = detectGaming(WALLET, 100, db)
    expect(result.indicators).toContain('burst_and_stop')
    expect(result.penalties.reliability).toBeGreaterThanOrEqual(8)
  })

  // -- CHECK 4: Balance window-dressing --
  it('detects balance_window_dressing when balance is 5x average', () => {
    const db = createGamingDb()
    // Average = 100
    db.prepare(`INSERT INTO wallet_snapshots (wallet, usdc_balance, snapshot_at) VALUES (?, ?, ?)`).run(
      WALLET, 100, minutesAgo(120),
    )
    // No recent query -> so deposit_and_score won't fire, but window_dressing will

    // Current balance 600 -> 6x avg
    const result = detectGaming(WALLET, 600, db)
    expect(result.indicators).toContain('balance_window_dressing')
    expect(result.overrides.useAvgBalance).toBe(true)
    expect(result.penalties.viability).toBeGreaterThanOrEqual(10)
  })

  // -- CHECK 5: Wash trading --
  it('detects wash_trading when round-trip volume is above 40% of total', () => {
    const db = createGamingDb()
    // A->B 100 and B->A 100 within 7 days -> wash_volume=100, total_volume=200 -> 50% > 40%
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO raw_transactions (tx_hash, from_wallet, to_wallet, amount, timestamp) VALUES (?, ?, ?, ?, ?)`,
      ).run(`0xout${i}`, WALLET, '0xpeer', 20, hoursAgo(24 + i))
    }
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO raw_transactions (tx_hash, from_wallet, to_wallet, amount, timestamp) VALUES (?, ?, ?, ?, ?)`,
      ).run(`0xin${i}`, '0xpeer', WALLET, 20, hoursAgo(24 + i))
    }

    const result = detectGaming(WALLET, 100, db)
    expect(result.indicators).toContain('wash_trading')
    expect(result.penalties.reliability).toBeGreaterThanOrEqual(8)
    expect(result.penalties.composite).toBeGreaterThanOrEqual(5)
  })

  it('does NOT flag wash_trading when round-trip volume is below 40%', () => {
    const db = createGamingDb()
    // Out: 100 total to peer, In: only 20 back -> 20/120 = 17% < 40%
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO raw_transactions (tx_hash, from_wallet, to_wallet, amount, timestamp) VALUES (?, ?, ?, ?, ?)`,
      ).run(`0xout${i}`, WALLET, '0xpeer', 20, hoursAgo(24 + i))
    }
    db.prepare(
      `INSERT INTO raw_transactions (tx_hash, from_wallet, to_wallet, amount, timestamp) VALUES (?, ?, ?, ?, ?)`,
    ).run('0xin1', '0xpeer', WALLET, 20, hoursAgo(24))

    const result = detectGaming(WALLET, 100, db)
    expect(result.indicators).not.toContain('wash_trading')
  })
})
