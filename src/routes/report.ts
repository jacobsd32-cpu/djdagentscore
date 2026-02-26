import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { insertReport, getScore, applyReportPenalty, scoreToTier, countReporterReportsForTarget } from '../db.js'
import { isValidAddress, REPORT_REASONS } from '../types.js'
import type { Address, ReportReason, ReportBody } from '../types.js'
import { errorResponse, ErrorCodes } from '../errors.js'
import { queueWebhookEvent } from '../jobs/webhookDelivery.js'
import type { AppEnv } from '../types/hono-env.js'

const PENALTY_PER_REPORT = 5

const report = new Hono()

// POST /v1/report
report.post('/', async (c) => {
  let body: ReportBody
  try {
    body = await c.req.json<ReportBody>()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const { target, reason, details } = body

  // Validate fields
  if (!target || !isValidAddress(target)) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing target address'), 400)
  }
  if (!reason || !(REPORT_REASONS as readonly string[]).includes(reason)) {
    return c.json(
      errorResponse(ErrorCodes.INVALID_REPORT, `Invalid reason. Must be one of: ${REPORT_REASONS.join(', ')}`, { validReasons: [...REPORT_REASONS] }),
      400,
    )
  }
  if (typeof details !== 'string' || details.trim().length === 0) {
    return c.json(errorResponse(ErrorCodes.INVALID_REPORT, 'details is required'), 400)
  }

  // H4 fix: Extract the actual payer identity — ignore body.reporter
  const apiKeyWallet = (c as unknown as { get(key: 'apiKeyWallet'): string | null }).get('apiKeyWallet') ?? null
  const paymentHeader = c.req.header('X-PAYMENT') ?? c.req.header('x-payment')
  let actualReporter: string | undefined

  if (apiKeyWallet) {
    actualReporter = apiKeyWallet.toLowerCase()
  } else if (paymentHeader) {
    try {
      const json = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'))
      actualReporter = (json?.payload?.authorization?.from ?? json?.payer ?? json?.from)?.toLowerCase()
    } catch {
      // ignore parse errors
    }
  }

  if (!actualReporter || !isValidAddress(actualReporter)) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Could not determine reporter identity from payment'), 400)
  }

  if (target.toLowerCase() === actualReporter) {
    return c.json(errorResponse(ErrorCodes.SELF_REPORT, 'target and reporter must be different addresses'), 400)
  }

  // Rate limit: max 3 reports per reporter per target
  const existingReports = countReporterReportsForTarget(
    actualReporter,
    target.toLowerCase(),
  )
  if (existingReports >= 3) {
    return c.json(errorResponse(ErrorCodes.REPORT_LIMIT_EXCEEDED, 'Report limit reached for this reporter/target pair (max 3)'), 429)
  }

  const reportId = uuidv4()

  insertReport({
    id: reportId,
    target_wallet: target.toLowerCase(),
    reporter_wallet: actualReporter,
    reason: reason as ReportReason,
    details: details.trim().slice(0, 1000),
    penalty_applied: PENALTY_PER_REPORT,
  })

  // Apply penalty to cached score if present
  applyReportPenalty(target.toLowerCase(), PENALTY_PER_REPORT)

  const updatedRow = getScore(target.toLowerCase())
  const targetCurrentScore = updatedRow?.composite_score ?? 0

  queueWebhookEvent('fraud.reported', {
    reportId,
    target: target.toLowerCase(),
    reporter: actualReporter,
    reason,
    penaltyApplied: PENALTY_PER_REPORT,
    targetCurrentScore,
  })

  return c.json(
    {
      reportId,
      status: 'accepted',
      targetCurrentScore,
      penaltyApplied: PENALTY_PER_REPORT,
    },
    201,
  )
})

export default report
