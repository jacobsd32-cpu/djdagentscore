import { findApiKeyAuthByHash, incrementApiKeyUsageByHash, resetApiKeyUsageByHash } from '../db.js'
import type { ApiKeyAuthRow } from '../db.js'
import { ErrorCodes } from '../errors.js'
import { getNextUsageResetAt, hashKey } from '../utils/apiKeyUtils.js'

export interface ApiKeyAuthError {
  kind: 'error'
  code: string
  message: string
  status: 401 | 429
  details?: Record<string, unknown>
}

export interface ApiKeyAuthSkip {
  kind: 'skip'
}

export interface ApiKeyAuthSuccess {
  kind: 'authenticated'
  keyHash: string
  row: ApiKeyAuthRow
}

export type ApiKeyAuthResult = ApiKeyAuthSkip | ApiKeyAuthError | ApiKeyAuthSuccess

export function authenticateApiKeyHeader(authHeader: string | undefined, now = new Date()): ApiKeyAuthResult {
  if (!authHeader?.startsWith('Bearer djd_live_')) {
    return { kind: 'skip' }
  }

  const rawKey = authHeader.slice(7)
  const keyHash = hashKey(rawKey)
  const row = findApiKeyAuthByHash(keyHash)

  if (!row) {
    return {
      kind: 'error',
      code: ErrorCodes.API_KEY_INVALID,
      message: 'Invalid API key',
      status: 401,
    }
  }

  if (row.revoked_at) {
    return {
      kind: 'error',
      code: ErrorCodes.API_KEY_REVOKED,
      message: 'API key has been revoked',
      status: 401,
    }
  }

  if (!row.is_active) {
    return {
      kind: 'error',
      code: ErrorCodes.API_KEY_INVALID,
      message: 'API key is inactive',
      status: 401,
    }
  }

  if (new Date(row.usage_reset_at) <= now) {
    const nextReset = getNextUsageResetAt(now)
    resetApiKeyUsageByHash(keyHash, nextReset)
    row.monthly_used = 0
    row.usage_reset_at = nextReset
  }

  if (row.monthly_used >= row.monthly_limit) {
    return {
      kind: 'error',
      code: ErrorCodes.API_KEY_EXHAUSTED,
      message: 'Monthly API key quota exhausted',
      status: 429,
      details: {
        limit: row.monthly_limit,
        used: row.monthly_used,
        resetsAt: row.usage_reset_at,
      },
    }
  }

  return {
    kind: 'authenticated',
    keyHash,
    row,
  }
}

export function recordSuccessfulApiKeyUsage(auth: ApiKeyAuthSuccess, now = new Date()): void {
  incrementApiKeyUsageByHash(auth.keyHash, now.toISOString())
  auth.row.monthly_used += 1
  auth.row.last_used_at = now.toISOString()
}
