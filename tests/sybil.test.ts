/**
 * Sybil Detection Tests
 *
 * Tests all 7 sybil heuristics by constructing minimal in-memory SQLite databases
 * with the exact data patterns each check looks for. Because detectSybil() accepts
 * a Database parameter (DI), we don't need to mock anything — just real SQLite.
 */

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { detectSybil } from '../src/scoring/sybil.js'

// Minimal schema — only the 3 tables sybil.ts queries
function createSybilDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE relationship_graph (
      wallet_a TEXT,
      wallet_b TEXT,
      tx_count INTEGER DEFAULT 0,
      total_volume_a_to_b REAL DEFAULT 0,
      total_volume_b_to_a REAL DEFAULT 0,
      first_interaction TEXT,
      last_interaction TEXT,
      PRIMARY KEY (wallet_a, wallet_b)
    );
    CREATE TABLE wallet_index (
      wallet TEXT PRIMARY KEY,
      first_seen TEXT,
      last_seen TEXT,
      total_tx_count INTEGER DEFAULT 0,
      total_volume_in REAL DEFAULT 0,
      total_volume_out REAL DEFAULT 0,
      unique_partners INTEGER DEFAULT 0
    );
    CREATE TABLE raw_transactions (
      tx_hash TEXT UNIQUE,
      block_number INTEGER,
      from_wallet TEXT,
      to_wallet TEXT,
      amount_usdc REAL,
      timestamp TEXT,
      facilitator TEXT
    );
  `)
  return db
}

const WALLET = '0xaaa'

describe('detectSybil', () => {
  it('returns clean result for an unknown wallet', () => {
    const db = createSybilDb()
    const result = detectSybil(WALLET, db)

    expect(result.sybilFlag).toBe(false)
    expect(result.indicators).toEqual([])
    expect(result.caps).toEqual({})
  })

  it('returns clean result for a healthy diverse wallet', () => {
    const db = createSybilDb()
    // 10 diverse partners, no single one dominates
    for (let i = 0; i < 10; i++) {
      db.prepare(
        `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a)
         VALUES (?, ?, ?, ?)`,
      ).run(WALLET, `0xpartner${i}`, 100, 10) // unidirectional — not symmetric
    }
    db.prepare(`INSERT INTO wallet_index (wallet, first_seen, total_tx_count) VALUES (?, ?, ?)`).run(
      WALLET,
      '2025-01-01T00:00:00Z',
      30,
    )

    const result = detectSybil(WALLET, db)
    expect(result.sybilFlag).toBe(false)
    expect(result.indicators).toEqual([])
  })

  // ── CHECK 1: Closed-loop trading ────────────────────────────────────────
  it('detects closed_loop_trading when top 3 partners hold >90% volume', () => {
    const db = createSybilDb()
    // 3 heavy partners + 2 tiny ones to meet >= 3 partner count
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xp1', 500, 0)
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xp2', 300, 0)
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xp3', 200, 0)
    // Tiny diversification — not enough to break the 90% threshold
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xp4', 5, 0)
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xp5', 5, 0)

    const result = detectSybil(WALLET, db)
    expect(result.indicators).toContain('closed_loop_trading')
    expect(result.caps.reliability).toBeLessThanOrEqual(40)
  })

  // ── CHECK 2: Symmetric transactions ─────────────────────────────────────
  it('detects symmetric_transactions when >50% of partnerships are bidirectional', () => {
    const db = createSybilDb()
    // 3 symmetric partnerships (within 10% difference)
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xs1', 100, 98)
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xs2', 200, 195)
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xs3', 50, 48)
    // 1 non-symmetric
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xs4', 300, 10)

    const result = detectSybil(WALLET, db)
    // 3 out of 4 are symmetric = 75% > 50%
    expect(result.indicators).toContain('symmetric_transactions')
    expect(result.caps.reliability).toBeLessThanOrEqual(30)
  })

  // ── CHECK 3: Coordinated creation ───────────────────────────────────────
  it('detects coordinated_creation when wallet and top partner were created within 24h', () => {
    const db = createSybilDb()
    const baseTime = new Date('2025-06-01T12:00:00Z')
    const partnerTime = new Date(baseTime.getTime() + 6 * 60 * 60 * 1000) // 6 hours later

    db.prepare(`INSERT INTO wallet_index (wallet, first_seen, total_tx_count) VALUES (?, ?, ?)`).run(
      WALLET,
      baseTime.toISOString(),
      10,
    )
    db.prepare(`INSERT INTO wallet_index (wallet, first_seen, total_tx_count) VALUES (?, ?, ?)`).run(
      '0xpartner',
      partnerTime.toISOString(),
      10,
    )
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xpartner', 500, 100)

    const result = detectSybil(WALLET, db)
    expect(result.indicators).toContain('coordinated_creation')
    expect(result.caps.identity).toBeLessThanOrEqual(50)
  })

  // ── CHECK 4: Single-partner dependency ──────────────────────────────────
  it('detects single_partner when wallet has exactly 1 partner', () => {
    const db = createSybilDb()
    db.prepare(`INSERT INTO wallet_index (wallet, first_seen, total_tx_count) VALUES (?, ?, ?)`).run(
      WALLET,
      '2025-01-01T00:00:00Z',
      10,
    )
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xonly', 1000, 50)

    const result = detectSybil(WALLET, db)
    expect(result.indicators).toContain('single_partner')
    expect(result.caps.reliability).toBeLessThanOrEqual(35)
  })

  // ── CHECK 5: Volume without diversity ───────────────────────────────────
  it('detects volume_without_diversity when >50 tx but <5 partners', () => {
    const db = createSybilDb()
    db.prepare(`INSERT INTO wallet_index (wallet, first_seen, total_tx_count) VALUES (?, ?, ?)`).run(
      WALLET,
      '2025-01-01T00:00:00Z',
      60, // >50 tx
    )
    // Only 3 partners (< 5)
    for (let i = 0; i < 3; i++) {
      db.prepare(
        `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
      ).run(WALLET, `0xp${i}`, 100, 10)
    }

    const result = detectSybil(WALLET, db)
    expect(result.indicators).toContain('volume_without_diversity')
    expect(result.caps.reliability).toBeLessThanOrEqual(45)
  })

  // ── CHECK 6: Funded-by-top-partner ──────────────────────────────────────
  it('detects funded_by_top_partner when earliest funder is also top partner', () => {
    const db = createSybilDb()
    db.prepare(`INSERT INTO wallet_index (wallet, first_seen, total_tx_count) VALUES (?, ?, ?)`).run(
      WALLET,
      '2025-01-01T00:00:00Z',
      20,
    )
    // Top partner by volume
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xfunder', 1000, 200)
    // Another smaller partner
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xother', 50, 10)

    // Earliest transaction: 0xfunder → WALLET
    db.prepare(
      `INSERT INTO raw_transactions (tx_hash, from_wallet, to_wallet, amount_usdc, timestamp) VALUES (?, ?, ?, ?, ?)`,
    ).run('0xtx1', '0xfunder', WALLET, 500, '2025-01-01T00:00:01Z')
    db.prepare(
      `INSERT INTO raw_transactions (tx_hash, from_wallet, to_wallet, amount_usdc, timestamp) VALUES (?, ?, ?, ?, ?)`,
    ).run('0xtx2', '0xother', WALLET, 10, '2025-02-01T00:00:00Z')

    const result = detectSybil(WALLET, db)
    expect(result.indicators).toContain('funded_by_top_partner')
    expect(result.caps.identity).toBeLessThanOrEqual(40)
    expect(result.caps.reliability).toBeLessThanOrEqual(35)
  })

  // ── CHECK 7: Tight cluster ─────────────────────────────────────────────
  it('detects tight_cluster when top partners are heavily interconnected', () => {
    const db = createSybilDb()
    const partners = ['0xc1', '0xc2', '0xc3', '0xc4']

    // WALLET ↔ each partner
    for (const p of partners) {
      db.prepare(
        `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
      ).run(WALLET, p, 100, 50)
    }

    // Partners also transact with each other (6 possible pairs from 4 partners)
    // We need >50% interconnection. With 4 partners: C(4,2) = 6 pairs.
    // Link 4 of 6 pairs = 67% > 50%
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run('0xc1', '0xc2', 50, 50)
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run('0xc1', '0xc3', 30, 30)
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run('0xc2', '0xc3', 40, 40)
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run('0xc3', '0xc4', 20, 20)

    const result = detectSybil(WALLET, db)
    expect(result.indicators).toContain('tight_cluster')
    expect(result.caps.reliability).toBeLessThanOrEqual(30)
    expect(result.caps.identity).toBeLessThanOrEqual(40)
  })

  // ── Compound flags ─────────────────────────────────────────────────────
  it('accumulates multiple indicators and takes the minimum cap', () => {
    const db = createSybilDb()
    // Single partner → single_partner (rel cap 35)
    // Also funded by that partner → funded_by_top_partner (idn cap 40, rel cap 35)
    db.prepare(`INSERT INTO wallet_index (wallet, first_seen, total_tx_count) VALUES (?, ?, ?)`).run(
      WALLET,
      '2025-01-01T00:00:00Z',
      5,
    )
    db.prepare(
      `INSERT INTO relationship_graph (wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a) VALUES (?, ?, ?, ?)`,
    ).run(WALLET, '0xmaster', 1000, 200)

    db.prepare(
      `INSERT INTO raw_transactions (tx_hash, from_wallet, to_wallet, amount_usdc, timestamp) VALUES (?, ?, ?, ?, ?)`,
    ).run('0xtx1', '0xmaster', WALLET, 500, '2025-01-01T00:00:01Z')

    const result = detectSybil(WALLET, db)
    expect(result.sybilFlag).toBe(true)
    expect(result.indicators).toContain('single_partner')
    expect(result.indicators).toContain('funded_by_top_partner')
    expect(result.indicators.length).toBeGreaterThanOrEqual(2)
    // Both caps set reliability — should take the minimum (35 from both)
    expect(result.caps.reliability).toBe(35)
    expect(result.caps.identity).toBe(40)
  })
})
