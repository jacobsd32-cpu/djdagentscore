import { isStripeEnabled } from '../billing/stripeClient.js'
import {
  consumePendingKey,
  createCheckoutSession,
  createPortalSession,
  getSubscriptionBySessionId,
} from '../billing/subscriptionManager.js'
import { BILLING_PLANS } from '../config/plans.js'
import { ErrorCodes } from '../errors.js'
import { log } from '../logger.js'
import { successPageHtml } from '../templates/billingSuccess.js'

interface BillingServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 500 | 503
}

interface BillingServiceSuccess<T> {
  ok: true
  data: T
}

export type BillingServiceResult<T> = BillingServiceError | BillingServiceSuccess<T>

function billingDisabledError(message = 'Billing is not configured on this instance'): BillingServiceError {
  return {
    ok: false,
    code: ErrorCodes.BILLING_DISABLED,
    message,
    status: 503,
  }
}

function internalBillingError(message: string): BillingServiceError {
  return {
    ok: false,
    code: ErrorCodes.INTERNAL_ERROR,
    message,
    status: 500,
  }
}

function ensureBillingEnabled(message?: string): BillingServiceError | null {
  if (!isStripeEnabled()) {
    return billingDisabledError(message)
  }
  return null
}

export function listBillingPlans(): { plans: Array<{ id: string; name: string; monthlyPrice: number; monthlyLimit: number }> } {
  return {
    plans: Object.values(BILLING_PLANS).map((plan) => ({
      id: plan.id,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      monthlyLimit: plan.monthlyLimit,
    })),
  }
}

export async function createBillingCheckout(
  bodyLoader: () => Promise<{ plan?: string; email?: string }>,
): Promise<BillingServiceResult<{ url: string; sessionId: string }>> {
  const guard = ensureBillingEnabled()
  if (guard) return guard

  let body: { plan?: string; email?: string }
  try {
    body = await bodyLoader()
  } catch {
    return {
      ok: false,
      code: ErrorCodes.INVALID_JSON,
      message: 'Invalid JSON body',
      status: 400,
    }
  }

  const planId = body.plan
  if (!planId || !BILLING_PLANS[planId]) {
    return {
      ok: false,
      code: ErrorCodes.BILLING_INVALID_PLAN,
      message: `Invalid plan. Choose: ${Object.keys(BILLING_PLANS).join(', ')}`,
      status: 400,
    }
  }

  try {
    const result = await createCheckoutSession(planId, body.email)
    return { ok: true, data: result }
  } catch (err) {
    log.error('billing', 'Failed to create checkout session', { planId, error: err })
    return internalBillingError('Failed to create checkout session')
  }
}

export function renderBillingSuccessPage(sessionId: string | undefined): BillingServiceResult<{ html: string }> {
  const guard = ensureBillingEnabled()
  if (guard) return guard

  if (!sessionId) {
    return {
      ok: true,
      data: { html: successPageHtml({ error: 'Missing session_id parameter.' }) },
    }
  }

  const subscription = getSubscriptionBySessionId(sessionId)
  const rawKey = consumePendingKey(sessionId)

  if (!subscription) {
    return {
      ok: true,
      data: {
        html: successPageHtml({
          error: 'Your API key is being provisioned. Please refresh this page in a few seconds.',
        }),
      },
    }
  }

  const plan = BILLING_PLANS[subscription.plan]

  if (rawKey) {
    return {
      ok: true,
      data: {
        html: successPageHtml({
          apiKey: rawKey,
          planName: plan?.name ?? subscription.plan,
          monthlyLimit: plan?.monthlyLimit ?? 0,
        }),
      },
    }
  }

  return {
    ok: true,
    data: {
      html: successPageHtml({
        alreadyConsumed: true,
        planName: plan?.name ?? subscription.plan,
      }),
    },
  }
}

export async function createBillingPortalLink(customerId: string | undefined): Promise<BillingServiceResult<{ url: string }>> {
  const guard = ensureBillingEnabled()
  if (guard) return guard

  if (!customerId) {
    return {
      ok: false,
      code: ErrorCodes.BILLING_SESSION_NOT_FOUND,
      message: 'Missing customer_id parameter',
      status: 400,
    }
  }

  try {
    const url = await createPortalSession(customerId)
    return { ok: true, data: { url } }
  } catch (err) {
    log.error('billing', 'Failed to create portal session', { customerId, error: err })
    return internalBillingError('Failed to create portal session')
  }
}
