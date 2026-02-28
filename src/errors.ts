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

export function errorResponse(code: string, message: string, details?: Record<string, unknown>): ErrorBody {
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

  // API Keys
  API_KEY_INVALID: 'api_key_invalid',
  API_KEY_EXHAUSTED: 'api_key_quota_exhausted',
  API_KEY_REVOKED: 'api_key_revoked',

  // Webhooks
  WEBHOOK_INVALID: 'webhook_invalid',
  WEBHOOK_NOT_FOUND: 'webhook_not_found',
  WEBHOOK_LIMIT_EXCEEDED: 'webhook_limit_exceeded',
  WEBHOOK_URL_INVALID: 'webhook_url_invalid',

  // Billing
  BILLING_DISABLED: 'billing_disabled',
  BILLING_INVALID_PLAN: 'billing_invalid_plan',
  BILLING_SESSION_NOT_FOUND: 'billing_session_not_found',
  BILLING_KEY_NOT_READY: 'billing_key_not_ready',
  BILLING_WEBHOOK_SIGNATURE: 'billing_webhook_signature_invalid',

  // History
  HISTORY_NOT_FOUND: 'history_not_found',
  INVALID_DATE_RANGE: 'invalid_date_range',

  // Certification
  CERT_REQUIREMENTS_NOT_MET: 'cert_requirements_not_met',
  CERT_NOT_FOUND: 'cert_not_found',
  CERT_ALREADY_ACTIVE: 'cert_already_active',
  CERT_EXPIRED: 'cert_expired',
  CERT_SCORE_TOO_LOW: 'cert_score_too_low',
  CERT_NOT_REGISTERED: 'cert_not_registered',
} as const
