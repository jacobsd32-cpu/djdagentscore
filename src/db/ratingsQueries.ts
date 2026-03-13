import type { MutualRatingRow } from '../types.js'
import { db } from './connection.js'

export interface IndexedTransactionRow {
  tx_hash: string
  from_wallet: string
  to_wallet: string
  amount_usdc: number
  timestamp: string
}

export interface MutualRatingSummaryRow {
  rating_count: number
  unique_raters: number
  average_rating: number | null
  most_recent_rating_at: string | null
}

export interface MutualRatingBreakdownRow {
  rating: number
  count: number
}

const stmtInsertMutualRating = db.prepare(`
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
`)

const stmtGetMutualRatingByTxAndPair = db.prepare<[string, string, string], MutualRatingRow>(`
  SELECT id, rater_wallet, rated_wallet, tx_hash, rating, comment, created_at
  FROM mutual_ratings
  WHERE rater_wallet = ? AND rated_wallet = ? AND tx_hash = ?
  LIMIT 1
`)

const stmtGetIndexedTransactionBetweenWallets = db.prepare<
  [string, string, string, string, string],
  IndexedTransactionRow
>(`
  SELECT tx_hash, from_wallet, to_wallet, amount_usdc, timestamp
  FROM raw_transactions
  WHERE tx_hash = ?
    AND (
      (from_wallet = ? AND to_wallet = ?)
      OR
      (from_wallet = ? AND to_wallet = ?)
    )
  LIMIT 1
`)

const stmtGetRatingsSummaryForWallet = db.prepare<[string], MutualRatingSummaryRow>(`
  SELECT
    COUNT(*) as rating_count,
    COUNT(DISTINCT rater_wallet) as unique_raters,
    ROUND(AVG(rating), 2) as average_rating,
    MAX(created_at) as most_recent_rating_at
  FROM mutual_ratings
  WHERE rated_wallet = ?
`)

const stmtGetRatingBreakdownForWallet = db.prepare<[string], MutualRatingBreakdownRow>(`
  SELECT rating, COUNT(*) as count
  FROM mutual_ratings
  WHERE rated_wallet = ?
  GROUP BY rating
  ORDER BY rating DESC
`)

const stmtCountMutualRatingsForWallet = db.prepare<[string], { count: number }>(`
  SELECT COUNT(*) as count
  FROM mutual_ratings
  WHERE rated_wallet = ?
`)

const stmtListMutualRatingsByWallet = db.prepare<[string, number], MutualRatingRow>(`
  SELECT id, rater_wallet, rated_wallet, tx_hash, rating, comment, created_at
  FROM mutual_ratings
  WHERE rated_wallet = ?
  ORDER BY created_at DESC
  LIMIT ?
`)

export function insertMutualRating(input: {
  id: string
  rater_wallet: string
  rated_wallet: string
  tx_hash: string
  rating: number
  comment: string | null
  created_at: string
}): void {
  stmtInsertMutualRating.run(
    input.id,
    input.rater_wallet,
    input.rated_wallet,
    input.tx_hash,
    input.rating,
    input.comment,
    input.created_at,
  )
}

export function getMutualRatingByTxAndPair(
  raterWallet: string,
  ratedWallet: string,
  txHash: string,
): MutualRatingRow | undefined {
  return stmtGetMutualRatingByTxAndPair.get(raterWallet, ratedWallet, txHash)
}

export function getIndexedTransactionBetweenWallets(
  txHash: string,
  walletA: string,
  walletB: string,
): IndexedTransactionRow | undefined {
  return stmtGetIndexedTransactionBetweenWallets.get(txHash, walletA, walletB, walletB, walletA)
}

export function getRatingsSummaryForWallet(wallet: string): MutualRatingSummaryRow {
  return (
    stmtGetRatingsSummaryForWallet.get(wallet) ?? {
      rating_count: 0,
      unique_raters: 0,
      average_rating: null,
      most_recent_rating_at: null,
    }
  )
}

export function getRatingBreakdownForWallet(wallet: string): MutualRatingBreakdownRow[] {
  return stmtGetRatingBreakdownForWallet.all(wallet)
}

export function countMutualRatingsForWallet(wallet: string): number {
  return stmtCountMutualRatingsForWallet.get(wallet)?.count ?? 0
}

export function listMutualRatingsByWallet(wallet: string, options: { limit: number }): MutualRatingRow[] {
  return stmtListMutualRatingsByWallet.all(wallet, options.limit)
}
