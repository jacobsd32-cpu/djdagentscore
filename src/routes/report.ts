import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { insertReport, getScore, applyReportPenalty, scoreToTier, countReporterReportsForTarget } from '../db.js'
import { REPORT_REASONS } from '../types.js'
import type { ReportReason, ReportBody } from '../types.js'
import { REPORT_CONFIG } from '../config/constants.js'
import { errorResponse, ErrorCodes } from '../errors.js'
import { queueWebhookEvent } from '../jobs/webhookDelivery.js'
import { getPayerWallet } from '../utils/paymentUtils.js'
import { normalizeWallet } from '../utils/walletUtils.js'

const { PENALTY_PER_REPORT, MAX_REPORTS_PER_PAIR, MAX_DETAILS_LENGTH } = REPORT_CONFIG

const report = new Hono()

// POST /v1/report
report.post('/', async (c) => {
  let body: ReportBody
  try {
    body = await c.req.json<ReportBody>()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const { target: rawTarget, reason, details } = body

  // Validate fields
  const target = normalizeWallet(rawTarget)
  if (!target) {
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
  const actualReporter = normalizeWallet(getPayerWallet(c))

  if (!actualReporter) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Could not determine reporter identity from payment'), 400)
  }

  if (target === actualReporter) {
    return c.json(errorResponse(ErrorCodes.SELF_REPORT, 'target and reporter must be different addresses'), 400)
  }

  // Rate limit: max 3 reports per reporter per target
  const existingReports = countReporterReportsForTarget(
    actualReporter,
    target,
  )
  if (existingReports >= MAX_REPORTS_PER_PAIR) {
    return c.json(errorResponse(ErrorCodes.REPORT_LIMIT_EXCEEDED, `Report limit reached for this reporter/target pair (max ${MAX_REPORTS_PER_PAIR})`), 429)
  }

  const reportId = uuidv4()

  insertReport({
    id: reportId,
    target_wallet: target,
    reporter_wallet: actualReporter,
    reason: reason as ReportReason,
    details: details.trim().slice(0, MAX_DETAILS_LENGTH),
    penalty_applied: PENALTY_PER_REPORT,
  })

  // Apply penalty to cached score if present
  applyReportPenalty(target, PENALTY_PER_REPORT)

  const updatedRow = getScore(target)
  const targetCurrentScore = updatedRow?.composite_score ?? 0

  queueWebhookEvent('fraud.reported', {
    reportId,
    target,
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
