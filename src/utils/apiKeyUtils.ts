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
