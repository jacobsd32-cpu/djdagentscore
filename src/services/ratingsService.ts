import { v4 as uuidv4 } from 'uuid'

import { RATING_CONFIG } from '../config/constants.js'
import {
  getIndexedTransactionBetweenWallets,
  getMutualRatingByTxAndPair,
  getRatingBreakdownForWallet,
  getRatingsSummaryForWallet,
  getScore,
  insertMutualRating,
  listMutualRatingsByWallet,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import type { Address, RatingBody, RatingResponse } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'

const DEFAULT_RATINGS_LIMIT = 25
const MAX_RATINGS_LIMIT = 100
const VALID_TX_HASH = /^0x[0-9a-fA-F]{64}$/

interface RatingsServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 401 | 404 | 409
  details?: Record<string, unknown>
}

interface RatingsServiceSuccess<T> {
  ok: true
  data: T
  status?: 201
}

type RatingsServiceResult<T> = RatingsServiceError | RatingsServiceSuccess<T>

interface RatingsView {
  wallet: Address
  current_score: number | null
  current_tier: string | null
  average_rating: number
  rating_count: number
  unique_raters: number
  most_recent_rating_at: string | null
  breakdown: Array<{
    rating: number
    count: number
  }>
  ratings: Array<{
    rating_id: string
    rater_wallet: Address
    tx_hash: string
    rating: number
    comment: string | null
    created_at: string
  }>
  count: number
  returned: number
}

interface RatingsViewParams {
  rawWallet: string | undefined
  limit: string | undefined
}

function invalidWalletError(message: string): RatingsServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_WALLET,
    message,
    status: 400,
  }
}

function invalidRatingError(message: string, details?: Record<string, unknown>): RatingsServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_RATING,
    message,
    status: 400,
    ...(details ? { details } : {}),
  }
}

function parseLimit(rawLimit: string | undefined): number {
  const parsed = Number.parseInt(rawLimit ?? String(DEFAULT_RATINGS_LIMIT), 10)
  if (Number.isNaN(parsed)) return DEFAULT_RATINGS_LIMIT
  return Math.min(Math.max(parsed, 1), MAX_RATINGS_LIMIT)
}

function normalizeComment(comment: unknown): string | null | RatingsServiceError {
  if (comment === undefined || comment === null) return null
  if (typeof comment !== 'string') {
    return invalidRatingError('comment must be a string')
  }

  const trimmed = comment.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > RATING_CONFIG.MAX_COMMENT_LENGTH) {
    return invalidRatingError(`comment must be ${RATING_CONFIG.MAX_COMMENT_LENGTH} characters or fewer`)
  }

  return trimmed
}

function isRatingsServiceError<T>(value: T | RatingsServiceError): value is RatingsServiceError {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false
}

export async function submitMutualRating(
  body: RatingBody | unknown,
  raterWallet: string | null | undefined,
): Promise<RatingsServiceResult<RatingResponse>> {
  const actualRater = normalizeWallet(raterWallet)
  if (!actualRater) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'Paid rating submission requires a payer wallet',
      status: 401,
    }
  }

  if (typeof body !== 'object' || body === null) {
    return invalidRatingError('rated_wallet, tx_hash, and rating are required')
  }

  const input = body as Record<string, unknown>
  const ratedWallet = normalizeWallet(typeof input.rated_wallet === 'string' ? input.rated_wallet : undefined)
  if (!ratedWallet) {
    return invalidWalletError('Valid rated_wallet required')
  }

  if (ratedWallet === actualRater) {
    return {
      ok: false,
      code: ErrorCodes.SELF_RATING,
      message: 'You cannot rate your own wallet',
      status: 400,
    }
  }

  if (typeof input.tx_hash !== 'string' || !VALID_TX_HASH.test(input.tx_hash)) {
    return invalidRatingError('Valid tx_hash required')
  }
  const txHash = input.tx_hash.toLowerCase()

  const rawRating = input.rating
  if (typeof rawRating !== 'number' || !Number.isInteger(rawRating) || rawRating < 1 || rawRating > 5) {
    return invalidRatingError('rating must be an integer between 1 and 5')
  }
  const rating = rawRating

  const comment = normalizeComment(input.comment)
  if (isRatingsServiceError(comment)) return comment

  const transaction = getIndexedTransactionBetweenWallets(txHash, actualRater, ratedWallet)
  if (!transaction) {
    return invalidRatingError('tx_hash must reference an indexed transaction between rater and rated wallet')
  }

  if (getMutualRatingByTxAndPair(actualRater, ratedWallet, txHash)) {
    return {
      ok: false,
      code: ErrorCodes.DUPLICATE_RATING,
      message: 'A rating already exists for this wallet pair and transaction',
      status: 409,
    }
  }

  const ratingId = uuidv4()
  const createdAt = new Date().toISOString()

  try {
    insertMutualRating({
      id: ratingId,
      rater_wallet: actualRater,
      rated_wallet: ratedWallet,
      tx_hash: txHash,
      rating,
      comment,
      created_at: createdAt,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return {
        ok: false,
        code: ErrorCodes.DUPLICATE_RATING,
        message: 'A rating already exists for this wallet pair and transaction',
        status: 409,
      }
    }
    throw error
  }

  const summary = getRatingsSummaryForWallet(ratedWallet)

  return {
    ok: true,
    status: 201,
    data: {
      ratingId,
      status: 'accepted',
      ratedWallet,
      txHash,
      rating,
      averageRating: summary.average_rating ?? rating,
      ratingCount: summary.rating_count,
    },
  }
}

export function getRatingsView(params: RatingsViewParams): RatingsServiceResult<RatingsView> {
  const wallet = normalizeWallet(params.rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  const summary = getRatingsSummaryForWallet(wallet)
  if (summary.rating_count === 0 || summary.average_rating === null) {
    return {
      ok: false,
      code: ErrorCodes.WALLET_NOT_FOUND,
      message: 'No ratings data found for this wallet',
      status: 404,
    }
  }

  const limit = parseLimit(params.limit)
  const ratings = listMutualRatingsByWallet(wallet, { limit })
  const breakdown = getRatingBreakdownForWallet(wallet)
  const score = getScore(wallet)

  return {
    ok: true,
    data: {
      wallet,
      current_score: score?.composite_score ?? null,
      current_tier: score?.tier ?? null,
      average_rating: summary.average_rating,
      rating_count: summary.rating_count,
      unique_raters: summary.unique_raters,
      most_recent_rating_at: summary.most_recent_rating_at,
      breakdown: breakdown.map((row) => ({
        rating: row.rating,
        count: row.count,
      })),
      ratings: ratings.map((row) => ({
        rating_id: row.id,
        rater_wallet: row.rater_wallet as Address,
        tx_hash: row.tx_hash,
        rating: row.rating,
        comment: row.comment,
        created_at: row.created_at,
      })),
      count: summary.rating_count,
      returned: ratings.length,
    },
  }
}
