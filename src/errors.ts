/**
 * Structured Error Utilities
 * All API errors use a consistent { error: { code, message, details? } } shape.
 */

export interface ErrorBody {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export function errorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorBody {
  const body: ErrorBody = { error: { code, message } }
  if (details) body.error.details = details
  return body
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }

  toJSON(): ErrorBody {
    return errorResponse(this.code, this.message, this.details)
  }
}

/** Discoverable error codes for API consumers */
export const ErrorCodes = {
  // Generic
  NOT_FOUND: 'not_found',
  INTERNAL_ERROR: 'internal_error',
  INVALID_JSON: 'invalid_json',
  BODY_TOO_LARGE: 'body_too_large',

  // Wallet
  INVALID_WALLET: 'invalid_wallet',
  WALLET_NOT_FOUND: 'wallet_not_found',

  // Score
  INVALID_JOB_ID: 'invalid_job_id',
  JOB_NOT_FOUND: 'job_not_found',
  BATCH_INVALID: 'batch_invalid',

  // Report
  INVALID_REPORT: 'invalid_report',
  DUPLICATE_REPORT: 'duplicate_report',
  REPORT_LIMIT_EXCEEDED: 'report_limit_exceeded',
  SELF_REPORT: 'self_report',

  // Registration
  INVALID_REGISTRATION: 'invalid_registration',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
} as const
