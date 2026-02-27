/**
 * GET /v1/data/fraud/blacklist?wallet=0x...
 * Price: $0.05 via x402
 */
import { Hono } from 'hono'
import { db } from '../db.js'
import { ErrorCodes, errorResponse } from '../errors.js'
import { normalizeWallet } from '../utils/walletUtils.js'

const blacklist = new Hono()

blacklist.get('/', (c) => {
  const wallet = normalizeWallet(c.req.query('wallet'))

  if (!wallet) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing wallet address'), 400)
  }

  const reports = db
    .prepare<[string], { reason: string; created_at: string }>(
      `SELECT reason, created_at
       FROM fraud_reports
       WHERE target_wallet = ?
       ORDER BY created_at DESC`,
    )
    .all(wallet)

  const reasons = [...new Set(reports.map((r) => r.reason))]
  const mostRecentDate = reports[0]?.created_at ?? null

  return c.json({
    wallet,
    reported: reports.length > 0,
    reportCount: reports.length,
    mostRecentDate,
    reasons,
    disputeStatus: 'none' as const,
  })
})

export default blacklist
