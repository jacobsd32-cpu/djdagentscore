import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  stripeEnabled: true,
  constructEvent: vi.fn(),
  handleSubscriptionUpdate: vi.fn(),
  handleSubscriptionCanceled: vi.fn(),
  provisionApiKey: vi.fn(),
  storePendingKey: vi.fn(),
}))

vi.mock('../../src/billing/stripeClient.js', () => ({
  isStripeEnabled: () => state.stripeEnabled,
  getStripe: () => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => state.constructEvent(...args),
    },
  }),
}))

vi.mock('../../src/billing/subscriptionManager.js', () => ({
  handleSubscriptionUpdate: (...args: unknown[]) => state.handleSubscriptionUpdate(...args),
  handleSubscriptionCanceled: (...args: unknown[]) => state.handleSubscriptionCanceled(...args),
  provisionApiKey: (...args: unknown[]) => state.provisionApiKey(...args),
  storePendingKey: (...args: unknown[]) => state.storePendingKey(...args),
}))

import { Hono } from 'hono'
import stripeWebhookRoute from '../../src/routes/stripeWebhook.js'

function makeApp() {
  const app = new Hono()
  app.route('/stripe/webhook', stripeWebhookRoute)
  return app
}

const originalSecret = process.env.STRIPE_WEBHOOK_SECRET

describe('stripe webhook route', () => {
  beforeEach(() => {
    state.stripeEnabled = true
    state.constructEvent.mockReset()
    state.handleSubscriptionUpdate.mockReset()
    state.handleSubscriptionCanceled.mockReset()
    state.provisionApiKey.mockReset()
    state.storePendingKey.mockReset()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  })

  afterEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = originalSecret
  })

  it('returns 503 when Stripe billing is disabled', async () => {
    state.stripeEnabled = false
    const app = makeApp()
    const res = await app.request('/stripe/webhook', {
      method: 'POST',
      body: 'payload',
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('billing_disabled')
  })

  it('returns 400 when the signature header is missing', async () => {
    const app = makeApp()
    const res = await app.request('/stripe/webhook', {
      method: 'POST',
      body: 'payload',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('billing_webhook_signature_invalid')
  })

  it('returns 400 when signature verification fails', async () => {
    state.constructEvent.mockImplementation(() => {
      throw new Error('bad signature')
    })

    const app = makeApp()
    const res = await app.request('/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      body: 'payload',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('billing_webhook_signature_invalid')
  })

  it('updates subscription status for a customer.subscription.updated event', async () => {
    state.constructEvent.mockReturnValue({
      id: 'evt_123',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          current_period_end: 1_775_000_000,
        },
      },
    })

    const app = makeApp()
    const res = await app.request('/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      body: 'payload',
    })
    expect(res.status).toBe(200)
    expect(state.handleSubscriptionUpdate).toHaveBeenCalledWith(
      'sub_123',
      'active',
      new Date(1_775_000_000 * 1000).toISOString(),
    )
  })

  it('provisions and stores a key for checkout.session.completed', async () => {
    state.constructEvent.mockReturnValue({
      id: 'evt_456',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          customer: 'cus_123',
          subscription: 'sub_123',
          customer_email: 'founder@example.com',
          metadata: { plan: 'starter' },
        },
      },
    })
    state.provisionApiKey.mockReturnValue({
      apiKeyId: 1,
      rawKey: 'sk_live_123',
      plan: 'starter',
    })

    const app = makeApp()
    const res = await app.request('/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      body: 'payload',
    })
    expect(res.status).toBe(200)
    expect(state.provisionApiKey).toHaveBeenCalled()
    expect(state.storePendingKey).toHaveBeenCalledWith('cs_test_123', 'sk_live_123')
  })

  it('returns 200 with an error payload when event handling fails', async () => {
    state.constructEvent.mockReturnValue({
      id: 'evt_789',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_456',
          customer: 'cus_456',
          subscription: 'sub_456',
          customer_email: 'founder@example.com',
          metadata: { plan: 'starter' },
        },
      },
    })
    state.provisionApiKey.mockImplementation(() => {
      throw new Error('provision failed')
    })

    const app = makeApp()
    const res = await app.request('/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      body: 'payload',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      received: true,
      error: 'Handler failed — see server logs',
    })
  })
})
