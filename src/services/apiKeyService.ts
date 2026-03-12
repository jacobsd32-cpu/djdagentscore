import { insertApiKey, listApiKeys, resetApiKeyUsage, revokeApiKey } from '../db.js'
import type { ApiKeyRow } from '../db.js'
import { createApiKeyMaterial, getNextUsageResetAt } from '../utils/apiKeyUtils.js'

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

export interface ApiKeyProvisionDraft {
  rawKey: string
  insertInput: {
    key_hash: string
    key_prefix: string
    wallet: string
    name: string | null
    tier: string
    monthly_limit: number
    usage_reset_at: string
    stripe_customer_id?: string | null
  }
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

export function prepareApiKeyProvisioning(input: {
  wallet: string
  name: string | null
  tier: string
  monthlyLimit: number
  stripeCustomerId?: string | null
}): ApiKeyProvisionDraft {
  const material = createApiKeyMaterial()
  return {
    rawKey: material.rawKey,
    insertInput: {
      key_hash: material.keyHash,
      key_prefix: material.keyPrefix,
      wallet: input.wallet.toLowerCase(),
      name: input.name,
      tier: input.tier,
      monthly_limit: input.monthlyLimit,
      usage_reset_at: getNextUsageResetAt(),
      stripe_customer_id: input.stripeCustomerId ?? null,
    },
  }
}

export function createAdminApiKey(body: unknown): ApiKeyCreateResult {
  if (!isRecord(body) || typeof body.wallet !== 'string' || !body.wallet.trim()) {
    return invalidRequest('wallet is required')
  }

  const provisioned = prepareApiKeyProvisioning({
    wallet: body.wallet,
    name: normalizeOptionalString(body.name),
    tier: normalizeTier(body.tier),
    monthlyLimit: normalizeMonthlyLimit(body.monthly_limit),
  })
  const created = insertApiKey(provisioned.insertInput)

  return {
    ok: true,
    apiKey: {
      ...created,
      key: provisioned.rawKey,
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
