import { db } from './connection.js'

export interface ApiKeyRow {
  id: number
  key_prefix: string
  wallet: string
  name: string | null
  tier: string
  monthly_limit: number
  monthly_used: number
  usage_reset_at: string
  is_active: number
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  stripe_customer_id: string | null
}

const stmtInsertApiKey = db.prepare<
  [string, string, string, string | null, string, number, string, string | null]
>(`
  INSERT INTO api_keys (key_hash, key_prefix, wallet, name, tier, monthly_limit, usage_reset_at, stripe_customer_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const stmtGetApiKeyById = db.prepare<[number], ApiKeyRow>(`
  SELECT id, key_prefix, wallet, name, tier, monthly_limit, monthly_used,
         usage_reset_at, is_active, created_at, last_used_at, revoked_at, stripe_customer_id
  FROM api_keys WHERE id = ?
`)

const stmtListApiKeys = db.prepare<[], ApiKeyRow>(`
  SELECT id, key_prefix, wallet, name, tier, monthly_limit, monthly_used,
         usage_reset_at, is_active, created_at, last_used_at, revoked_at, stripe_customer_id
  FROM api_keys ORDER BY created_at DESC
`)

const stmtRevokeApiKey = db.prepare(`
  UPDATE api_keys SET revoked_at = datetime('now'), is_active = 0 WHERE id = ? AND revoked_at IS NULL
`)

const stmtResetApiKeyUsage = db.prepare(`
  UPDATE api_keys SET monthly_used = 0, usage_reset_at = ? WHERE id = ?
`)

export function insertApiKey(input: {
  key_hash: string
  key_prefix: string
  wallet: string
  name: string | null
  tier: string
  monthly_limit: number
  usage_reset_at: string
  stripe_customer_id?: string | null
}): ApiKeyRow {
  const result = stmtInsertApiKey.run(
    input.key_hash,
    input.key_prefix,
    input.wallet,
    input.name,
    input.tier,
    input.monthly_limit,
    input.usage_reset_at,
    input.stripe_customer_id ?? null,
  )

  return stmtGetApiKeyById.get(Number(result.lastInsertRowid))!
}

export function listApiKeys(): ApiKeyRow[] {
  return stmtListApiKeys.all()
}

export function revokeApiKey(id: number): boolean {
  return stmtRevokeApiKey.run(id).changes > 0
}

export function resetApiKeyUsage(id: number, usageResetAt: string): boolean {
  return stmtResetApiKeyUsage.run(usageResetAt, id).changes > 0
}
