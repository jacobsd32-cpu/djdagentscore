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
    .prepare<[string], WalletIndexRow>('SELECT first_seen, total_tx_count FROM wallet_index WHERE wallet = ?')
    .get(w)

  if (walletRow?.first_seen && uniquePartnerCount > 0) {
    const topPartner = partners[0].partner
    const partnerRow = db
      .prepare<[string], { first_seen: string }>('SELECT first_seen FROM wallet_index WHERE wallet = ?')
      .get(topPartner)

    if (partnerRow?.first_seen) {
      const diff = Math.abs(new Date(walletRow.first_seen).getTime() - new Date(partnerRow.first_seen).getTime())
      if (diff <= 24 * 60 * 60 * 1000) {
        indicators.push('coordinated_creation')
        capIdentity(50)
      }
    }
  }

  // ── CHECK 4: Single-partner dependency ───────────────────────────────────
  const txCount = walletRow?.total_tx_count ?? 0
  if (uniquePartnerCount === 1 && txCount >= 5) {
    indicators.push('single_partner')
    capReliability(35)
  }

  // ── CHECK 5: Volume without diversity ────────────────────────────────────
  if (txCount > 50 && uniquePartnerCount < 5) {
    indicators.push('volume_without_diversity')
    capReliability(45)
  }

  // ── CHECK 6: Funding chain detection ──────────────────────────────────
  // If this wallet received its earliest inflows from a single funder AND
  // subsequently transacts predominantly with that same funder, it's likely
  // a controlled puppet wallet. We check if the top partner by volume is
  // also the earliest funder (first inflow source in raw_transactions).
  if (uniquePartnerCount > 0) {
    const firstFunder = db
      .prepare<[string], { from_wallet: string }>(
        `SELECT from_wallet FROM raw_transactions
         WHERE to_wallet = ?
         ORDER BY timestamp ASC LIMIT 1`,
      )
      .get(w)

    if (firstFunder && firstFunder.from_wallet === partners[0].partner) {
      // Top partner is also the wallet's original funder — strong sybil signal
      indicators.push('funded_by_top_partner')
      capIdentity(40)
      capReliability(35)
    }
  }

  // ── CHECK 7: Tight cluster detection ──────────────────────────────────
  // If a wallet's partners also transact heavily with each other, the group
  // forms a closed cluster typical of sybil rings. We check how many of
  // the wallet's top 5 partners have relationships with each other.
  // A high interconnection ratio (>50%) indicates a sybil cluster.
  if (uniquePartnerCount >= 3) {
    const topPartners = partners.slice(0, 5).map((p) => p.partner)
    let interconnections = 0
    let possiblePairs = 0
    for (let i = 0; i < topPartners.length; i++) {
      for (let j = i + 1; j < topPartners.length; j++) {
        possiblePairs++
        const link = db
          .prepare<[string, string, string, string], { cnt: number }>(
            `SELECT COUNT(*) as cnt FROM relationship_graph
             WHERE (wallet_a = ? AND wallet_b = ?)
                OR (wallet_a = ? AND wallet_b = ?)`,
          )
          .get(topPartners[i], topPartners[j], topPartners[j], topPartners[i])
        if (link && link.cnt > 0) interconnections++
      }
    }
    if (possiblePairs > 0 && interconnections / possiblePairs > 0.5) {
      indicators.push('tight_cluster')
      capReliability(30)
      capIdentity(40)
    }
  }

  return {
    sybilFlag: indicators.length > 0,
    indicators,
    caps,
  }
}
