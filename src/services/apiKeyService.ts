import { insertApiKey, listApiKeys, resetApiKeyUsage, revokeApiKey } from '../db.js'
import type { ApiKeyRow } from '../db.js'
import { generateApiKey, hashKey, keyPrefix } from '../utils/apiKeyUtils.js'

export interface ApiKeyServiceError {
  ok: false
  code: 'invalid_request' | 'not_found'
  message: string
  status: 400 | 404
}

export interface ApiKeyCreateSuccess {
  ok: true
  apiKey: ApiKeyRow & { key: string }
  message: string
}

export type ApiKeyCreateResult = ApiKeyServiceError | ApiKeyCreateSuccess

export function getNextUsageResetAt(from = new Date()): string {
  const nextReset = new Date(from)
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)
  return nextReset.toISOString()
}

function invalidRequest(message: string): ApiKeyServiceError {
  return {
    ok: false,
    code: 'invalid_request',
    message,
    status: 400,
  }
}

function notFound(message: string): ApiKeyServiceError {
  return {
    ok: false,
    code: 'not_found',
    message,
    status: 404,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeTier(value: unknown): string {
  if (typeof value !== 'string') return 'standard'
  const trimmed = value.trim()
  return trimmed || 'standard'
}

function normalizeMonthlyLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 10000
  return value
}

export function createAdminApiKey(body: unknown): ApiKeyCreateResult {
  if (!isRecord(body) || typeof body.wallet !== 'string' || !body.wallet.trim()) {
    return invalidRequest('wallet is required')
  }

  const rawKey = generateApiKey()
  const created = insertApiKey({
    key_hash: hashKey(rawKey),
    key_prefix: keyPrefix(rawKey),
    wallet: body.wallet.toLowerCase(),
    name: normalizeOptionalString(body.name),
    tier: normalizeTier(body.tier),
    monthly_limit: normalizeMonthlyLimit(body.monthly_limit),
    usage_reset_at: getNextUsageResetAt(),
  })

  return {
    ok: true,
    apiKey: {
      ...created,
      key: rawKey,
    },
    message: 'Store this key securely — it cannot be retrieved again.',
  }
}

export function listAdminApiKeys(): ApiKeyRow[] {
  return listApiKeys()
}

export function revokeApiKeyRecord(id: number): ApiKeyServiceError | { ok: true } {
  if (!revokeApiKey(id)) {
    return notFound('API key not found or already revoked')
  }

  return { ok: true }
}

export function resetApiKeyUsageRecord(id: number): ApiKeyServiceError | { ok: true; usageResetAt: string } {
  const usageResetAt = getNextUsageResetAt()
  if (!resetApiKeyUsage(id, usageResetAt)) {
    return notFound('API key not found')
  }

  return { ok: true, usageResetAt }
}
