/**
 * API Key Utilities
 *
 * Shared key generation and hashing used by both the admin API key routes
 * and the Stripe billing subscription manager.
 */

import crypto from 'node:crypto'

/** Generate a new API key with the `djd_live_` prefix + 32 random hex bytes. */
export function generateApiKey(): string {
  return `djd_live_${crypto.randomBytes(32).toString('hex')}`
}

/** SHA-256 hash of a raw API key — only the hash is stored in the database. */
export function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/** Extract the display prefix from a raw key (first 16 chars + "..."). */
export function keyPrefix(key: string): string {
  return `${key.slice(0, 16)}...`
}

export interface ApiKeyMaterial {
  rawKey: string
  keyHash: string
  keyPrefix: string
}

/** Generate the raw key plus the derived values stored in the database. */
export function createApiKeyMaterial(): ApiKeyMaterial {
  const rawKey = generateApiKey()
  return {
    rawKey,
    keyHash: hashKey(rawKey),
    keyPrefix: keyPrefix(rawKey),
  }
}

/** Calculate the next monthly quota reset timestamp (first day of next month at 00:00). */
export function getNextUsageResetAt(from = new Date()): string {
  const nextReset = new Date(from)
  nextReset.setUTCMonth(nextReset.getUTCMonth() + 1)
  nextReset.setUTCDate(1)
  nextReset.setUTCHours(0, 0, 0, 0)
  return nextReset.toISOString()
}
