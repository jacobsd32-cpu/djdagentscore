import type { Context } from 'hono'
import type { AppEnv } from '../types/hono-env.js'

/**
 * Extract the payer wallet from the x402 X-PAYMENT header.
 * The header is a base64-encoded JSON payload whose structure depends on
 * the facilitator version; we try common paths and fall back to null.
 */
export function extractPayerWallet(header: string | undefined): string | null {
  if (!header) return null
  try {
    const json = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    return (
      json?.payload?.authorization?.from ??
      json?.payer ??
      json?.from ??
      null
    )
  } catch {
    return null
  }
}

/**
 * Read the X-PAYMENT header from a Hono request context.
 * Normalizes the case-insensitive header lookup.
 */
export function getPaymentHeader(c: Context): string | undefined {
  return c.req.header('X-PAYMENT') ?? c.req.header('x-payment') ?? undefined
}

/**
 * Get the payer wallet from a request context.
 * Prefers the API key wallet (set by apiKeyAuth middleware) over the x402 payment header.
 */
export function getPayerWallet(c: Context): string | null {
  const apiKeyWallet = (c as Context<AppEnv>).get('apiKeyWallet') ?? null
  if (apiKeyWallet) return apiKeyWallet
  return extractPayerWallet(getPaymentHeader(c))
}
