import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  stripeEnabled: true,
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  getSubscriptionBySessionId: vi.fn(),
  consumePendingKey: vi.fn(),
  successPageHtml: vi.fn((props: Record<string, unknown>) => JSON.stringify(props)),
}))

vi.mock('../../src/billing/stripeClient.js', () => ({
  isStripeEnabled: () => state.stripeEnabled,
}))

vi.mock('../../src/billing/subscriptionManager.js', () => ({
  createCheckoutSession: (...args: unknown[]) => state.createCheckoutSession(...args),
  createPortalSession: (...args: unknown[]) => state.createPortalSession(...args),
  getSubscriptionBySessionId: (...args: unknown[]) => state.getSubscriptionBySessionId(...args),
  consumePendingKey: (...args: unknown[]) => state.consumePendingKey(...args),
}))

vi.mock('../../src/templates/billingSuccess.js', () => ({
  successPageHtml: (props: Record<string, unknown>) => state.successPageHtml(props),
}))

vi.mock('../../src/middleware/apiKeyAuth.js', () => ({
  apiKeyAuthMiddleware: async (
    c: {
      req: { header: (name: string) => string | undefined }
      set: (key: string, value: unknown) => void
    },
    next: () => Promise<void>,
  ) => {
    if (c.req.header('authorization') === 'Bearer djd_live_valid') {
      c.set('apiKeyId', 1)
      c.set('apiKeyWallet', '0x1234567890abcdef1234567890abcdef12345678')
      c.set('apiKeyTier', 'starter')
    }
    await next()
  },
}))

vi.mock('../../src/services/growthService.js', () => ({
  trackGrowthEventSafe: vi.fn(),
}))

import { Hono } from 'hono'
import billingRoute from '../../src/routes/billing.js'

function makeApp() {
  const app = new Hono()
  app.route('/billing', billingRoute)
  return app
}

describe('billing routes', () => {
  beforeEach(() => {
    state.stripeEnabled = true
    state.createCheckoutSession.mockReset()
    state.createPortalSession.mockReset()
    state.getSubscriptionBySessionId.mockReset()
    state.consumePendingKey.mockReset()
    state.successPageHtml.mockClear()
  })

  it('lists billing plans without requiring Stripe', async () => {
    const app = makeApp()
    const res = await app.request('/billing/plans')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plans.some((plan: { id: string }) => plan.id === 'starter')).toBe(true)
  })

  it('returns 503 for checkout when Stripe is disabled', async () => {
    state.stripeEnabled = false
    const app = makeApp()
    const res = await app.request('/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'starter' }),
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('billing_disabled')
  })

  it('returns 400 for an invalid billing plan', async () => {
    const app = makeApp()
    const res = await app.request('/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'invalid-plan' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('billing_invalid_plan')
  })

  it('creates a checkout session for a valid plan', async () => {
    state.createCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
      sessionId: 'cs_test_123',
    })

    const app = makeApp()
    const res = await app.request('/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'starter', email: 'founder@example.com' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      url: 'https://checkout.stripe.test/session',
      sessionId: 'cs_test_123',
    })
    expect(state.createCheckoutSession).toHaveBeenCalledWith('starter', 'founder@example.com')
  })

  it('renders the success page with a provisioned key', async () => {
    state.getSubscriptionBySessionId.mockReturnValue({ plan: 'starter', apiKeyId: 1, status: 'active' })
    state.consumePendingKey.mockReturnValue('sk_live_123')

    const app = makeApp()
    const res = await app.request('/billing/success?session_id=cs_test_123')
    expect(res.status).toBe(200)
    expect(state.successPageHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk_live_123',
        planName: 'Starter',
        monthlyLimit: 1000,
      }),
    )
    expect(await res.text()).toContain('sk_live_123')
  })

  it('renders the provisioning state when the webhook has not completed yet', async () => {
    state.getSubscriptionBySessionId.mockReturnValue(null)
    state.consumePendingKey.mockReturnValue(null)

    const app = makeApp()
    const res = await app.request('/billing/success?session_id=cs_test_123')
    expect(res.status).toBe(200)
    expect(state.successPageHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Your API key is being provisioned. Please refresh this page in a few seconds.',
      }),
    )
  })

  it('requires API key auth for the billing portal', async () => {
    const app = makeApp()
    const res = await app.request('/billing/portal?customer_id=cus_123')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('billing_session_not_found')
  })

  it('returns the Stripe billing portal url for authenticated dashboard requests', async () => {
    state.createPortalSession.mockResolvedValue('https://billing.stripe.test/portal')

    const app = makeApp()
    const res = await app.request('/billing/portal?customer_id=cus_123', {
      headers: {
        accept: 'application/json',
        authorization: 'Bearer djd_live_valid',
      },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.test/portal' })
  })

  it('redirects to the Stripe billing portal for authenticated browser requests', async () => {
    state.createPortalSession.mockResolvedValue('https://billing.stripe.test/portal')

    const app = makeApp()
    const res = await app.request('/billing/portal?customer_id=cus_123', {
      headers: { authorization: 'Bearer djd_live_valid' },
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://billing.stripe.test/portal')
  })
})
