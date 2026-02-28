/**
 * Stripe SDK Singleton
 *
 * Initializes the Stripe client from STRIPE_SECRET_KEY env var.
 * Exports `stripe` (nullable) and `isStripeEnabled()` guard.
 * All billing code should check isStripeEnabled() before calling Stripe APIs.
 */

import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

export function initStripe(): void {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return

  stripeInstance = new Stripe(key)
}

export function getStripe(): Stripe {
  if (!stripeInstance) {
    throw new Error('Stripe is not configured — set STRIPE_SECRET_KEY')
  }
  return stripeInstance
}

export function isStripeEnabled(): boolean {
  return stripeInstance !== null
}
