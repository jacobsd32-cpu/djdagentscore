/**
 * Billing Plan Definitions
 *
 * Flat monthly plans that map directly to the existing API key system.
 * Each plan creates an api_keys row with the corresponding monthly_limit.
 * Stripe price IDs are loaded from environment variables at startup.
 */

export interface BillingPlan {
  id: string
  name: string
  monthlyPrice: number
  monthlyLimit: number
  stripePriceId: string
}

/** Mutable at startup — stripePriceId is populated from env */
export const BILLING_PLANS: Record<string, BillingPlan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 29,
    monthlyLimit: 1_000,
    stripePriceId: '',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyPrice: 79,
    monthlyLimit: 5_000,
    stripePriceId: '',
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    monthlyPrice: 199,
    monthlyLimit: 25_000,
    stripePriceId: '',
  },
}

/**
 * Populate Stripe price IDs from environment.
 * Called once at startup. Throws if Stripe is configured but price IDs are missing.
 */
export function initBillingPlans(): void {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return // Stripe not configured — billing disabled

  const mapping: Record<string, string> = {
    starter: 'STRIPE_PRICE_STARTER',
    growth: 'STRIPE_PRICE_GROWTH',
    scale: 'STRIPE_PRICE_SCALE',
  }

  for (const [planId, envVar] of Object.entries(mapping)) {
    const priceId = process.env[envVar]
    if (!priceId) {
      throw new Error(`Missing ${envVar} — required when STRIPE_SECRET_KEY is set`)
    }
    BILLING_PLANS[planId]!.stripePriceId = priceId
  }
}

/** Lookup a plan by its Stripe price ID (used in webhook to identify which plan was purchased) */
export function planFromPriceId(priceId: string): BillingPlan | undefined {
  return Object.values(BILLING_PLANS).find((p) => p.stripePriceId === priceId)
}
