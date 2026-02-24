import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { insertReport, getScore, applyReportPenalty, scoreToTier, countReporterReportsForTarget } from '../db.js'
import { isValidAddress, REPORT_REASONS } from '../types.js'
import type { Address, ReportReason, ReportBody } from '../types.js'
import { errorResponse, ErrorCodes } from '../errors.js'

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

  const { target, reporter, reason, details } = body

  // Validate fields
  if (!target || !isValidAddress(target)) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing target address'), 400)
  }
  if (!reporter || !isValidAddress(reporter)) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing reporter address'), 400)
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
  if (target.toLowerCase() === reporter.toLowerCase()) {
    return c.json(errorResponse(ErrorCodes.SELF_REPORT, 'target and reporter must be different addresses'), 400)
  }

  // Rate limit: max 3 reports per reporter per target
  const existingReports = countReporterReportsForTarget(
    reporter.toLowerCase(),
    target.toLowerCase(),
  )
  if (existingReports >= 3) {
    return c.json(errorResponse(ErrorCodes.REPORT_LIMIT_EXCEEDED, 'Report limit reached for this reporter/target pair (max 3)'), 429)
  }

  const reportId = uuidv4()

  insertReport({
    id: reportId,
    target_wallet: target.toLowerCase(),
    reporter_wallet: reporter.toLowerCase(),
    reason: reason as ReportReason,
    details: details.trim().slice(0, 1000),
    penalty_applied: PENALTY_PER_REPORT,
  })

  // Apply penalty to cached score if present
  applyReportPenalty(target.toLowerCase(), PENALTY_PER_REPORT)

  const updatedRow = getScore(target.toLowerCase())
  const targetCurrentScore = updatedRow?.composite_score ?? 0

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
