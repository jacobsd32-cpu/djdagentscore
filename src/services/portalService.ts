import { BILLING_PLANS } from '../config/plans.js'
import { findApiKeyByHash, getApiKeyAnalytics } from '../db.js'
import type { ApiKeyAnalytics, ApiKeyRow } from '../db.js'
import { ErrorCodes } from '../errors.js'
import type { PortalData } from '../templates/portal.js'

export interface PortalServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 401 | 404
}

export interface PortalUsageSuccess {
  ok: true
  data: PortalData
}

export interface PortalAnalyticsSuccess {
  ok: true
  analytics: ApiKeyAnalytics
}

export type PortalUsageResult = PortalServiceError | PortalUsageSuccess
export type PortalAnalyticsResult = PortalServiceError | PortalAnalyticsSuccess

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function invalidKeyHash(): PortalServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_JSON,
    message: 'Invalid key hash',
    status: 400,
  }
}

function getKeyHash(body: unknown): string | PortalServiceError {
  if (!isRecord(body) || typeof body.keyHash !== 'string' || !/^[a-f0-9]{64}$/i.test(body.keyHash)) {
    return invalidKeyHash()
  }

  return body.keyHash
}

function getPortalKey(keyHash: string): ApiKeyRow | PortalServiceError {
  const row = findApiKeyByHash(keyHash)
  if (!row) {
    return {
      ok: false,
      code: ErrorCodes.API_KEY_INVALID,
      message: 'API key not found',
      status: 404,
    }
  }

  if (!row.is_active || row.revoked_at) {
    return {
      ok: false,
      code: ErrorCodes.API_KEY_REVOKED,
      message: 'API key is inactive or revoked',
      status: 401,
    }
  }

  return row
}

function isPortalServiceError(value: string | ApiKeyRow | PortalServiceError): value is PortalServiceError {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false
}

export function getPortalUsage(body: unknown): PortalUsageResult {
  const keyHash = getKeyHash(body)
  if (isPortalServiceError(keyHash)) return keyHash

  const row = getPortalKey(keyHash)
  if (isPortalServiceError(row)) return row

  const plan = BILLING_PLANS[row.tier]
  return {
    ok: true,
    data: {
      keyPrefix: row.key_prefix,
      planName: plan?.name ?? row.tier,
      tier: row.tier,
      monthlyUsed: row.monthly_used,
      monthlyLimit: row.monthly_limit,
      usageResetAt: row.usage_reset_at,
      stripeCustomerId: row.stripe_customer_id,
      lastUsedAt: row.last_used_at,
    },
  }
}

export function getPortalAnalytics(body: unknown): PortalAnalyticsResult {
  const keyHash = getKeyHash(body)
  if (isPortalServiceError(keyHash)) return keyHash

  const row = getPortalKey(keyHash)
  if (isPortalServiceError(row)) return row

  const rawDays = isRecord(body) ? body.days : undefined
  const days = typeof rawDays === 'number' && Number.isFinite(rawDays) ? Math.min(Math.max(1, rawDays), 90) : 30

  return {
    ok: true,
    analytics: getApiKeyAnalytics(row.wallet, days),
  }
}
