import { Hono } from 'hono'
import type { ReportBody } from '../types.js'
import { errorResponse, ErrorCodes } from '../errors.js'
import { submitFraudReport } from '../services/evidenceService.js'
import { getPayerWallet } from '../utils/paymentUtils.js'

const report = new Hono()

// POST /v1/report
report.post('/', async (c) => {
  let body: ReportBody
  try {
    body = await c.req.json<ReportBody>()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const outcome = await submitFraudReport(body, getPayerWallet(c))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 201)
})

export default report
