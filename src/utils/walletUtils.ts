import type { Address } from '../types.js'
import { isValidAddress } from '../types.js'

/**
 * Validate and normalize an Ethereum wallet address.
 * Returns a lowercased Address if valid, or null if invalid/missing.
 *
 * Replaces the scattered pattern of:
 *   if (!wallet || !isValidAddress(wallet)) { ... }
 *   const normalized = wallet.toLowerCase()
 */
export function normalizeWallet(input: string | undefined | null): Address | null {
  if (!input || !isValidAddress(input)) return null
  return input.toLowerCase() as Address
}
