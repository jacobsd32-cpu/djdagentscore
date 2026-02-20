/**
 * Sybil Detection Module
 *
 * Runs BEFORE dimension scoring. Queries relationship_graph and wallet_index
 * from the local DB — no RPC calls. Safe to call when tables are empty
 * (returns a clean result with no flags).
 */
import type { Database } from 'better-sqlite3'

export interface SybilResult {
  sybilFlag: boolean
  indicators: string[]
  caps: {
    reliability?: number
    identity?: number
  }
}

interface PartnerRow {
  partner: string
  total_volume: number
}

interface RelationshipRow {
  wallet_a: string
  wallet_b: string
  total_volume_a_to_b: number
  total_volume_b_to_a: number
}

interface WalletIndexRow {
  first_seen: string
  total_tx_count: number
}

export function detectSybil(wallet: string, db: Database): SybilResult {
  const w = wallet.toLowerCase()
  const indicators: string[] = []
  const caps: { reliability?: number; identity?: number } = {}

  function capReliability(val: number) {
    caps.reliability = caps.reliability === undefined ? val : Math.min(caps.reliability, val)
  }
  function capIdentity(val: number) {
    caps.identity = caps.identity === undefined ? val : Math.min(caps.identity, val)
  }

  // ── Fetch all partnerships ────────────────────────────────────────────────
  const partners = db
    .prepare<[string, string, string], PartnerRow>(
      `SELECT
         CASE WHEN wallet_a = ? THEN wallet_b ELSE wallet_a END AS partner,
         total_volume_a_to_b + total_volume_b_to_a AS total_volume
       FROM relationship_graph
       WHERE wallet_a = ? OR wallet_b = ?
       ORDER BY total_volume DESC`,
    )
    .all(w, w, w)

  const uniquePartnerCount = partners.length
  const totalVolume = partners.reduce((s, p) => s + p.total_volume, 0)

  // ── CHECK 1: Closed-loop trading ──────────────────────────────────────────
  // Top 3 partners account for >90% of volume.
  if (totalVolume > 0 && uniquePartnerCount >= 3) {
    const top3Vol = partners.slice(0, 3).reduce((s, p) => s + p.total_volume, 0)
    if (top3Vol / totalVolume > 0.9) {
      indicators.push('closed_loop_trading')
      capReliability(40)
    }
  }

  // ── CHECK 2: Symmetric transactions ──────────────────────────────────────
  // >50% of partnerships have nearly equal bidirectional volume (within 10%).
  if (uniquePartnerCount > 0) {
    const relationships = db
      .prepare<[string, string], RelationshipRow>(
        `SELECT wallet_a, wallet_b, total_volume_a_to_b, total_volume_b_to_a
         FROM relationship_graph WHERE wallet_a = ? OR wallet_b = ?`,
      )
      .all(w, w)

    const symmetricCount = relationships.filter((r) => {
      const va = r.total_volume_a_to_b
      const vb = r.total_volume_b_to_a
      if (va === 0 || vb === 0) return false
      return Math.abs(va - vb) / Math.max(va, vb) < 0.1
    }).length

    if (symmetricCount / relationships.length > 0.5) {
      indicators.push('symmetric_transactions')
      capReliability(30)
    }
  }

  // ── CHECK 3: Coordinated creation ─────────────────────────────────────────
  // This wallet and its top partner were both first seen within the same 24 hr window.
  const walletRow = db
    .prepare<[string], WalletIndexRow>(
      'SELECT first_seen, total_tx_count FROM wallet_index WHERE wallet = ?',
    )
    .get(w)

  if (walletRow?.first_seen && uniquePartnerCount > 0) {
    const topPartner = partners[0].partner
    const partnerRow = db
      .prepare<[string], { first_seen: string }>(
        'SELECT first_seen FROM wallet_index WHERE wallet = ?',
      )
      .get(topPartner)

    if (partnerRow?.first_seen) {
      const diff = Math.abs(
        new Date(walletRow.first_seen).getTime() - new Date(partnerRow.first_seen).getTime(),
      )
      if (diff < 24 * 60 * 60 * 1000) {
        indicators.push('coordinated_creation')
        capIdentity(50)
      }
    }
  }

  // ── CHECK 4: Single-partner dependency ───────────────────────────────────
  if (uniquePartnerCount === 1) {
    indicators.push('single_partner')
    capReliability(35)
  }

  // ── CHECK 5: Volume without diversity ────────────────────────────────────
  const txCount = walletRow?.total_tx_count ?? 0
  if (txCount > 50 && uniquePartnerCount < 5) {
    indicators.push('volume_without_diversity')
    capReliability(45)
  }

  return {
    sybilFlag: indicators.length > 0,
    indicators,
    caps,
  }
}
