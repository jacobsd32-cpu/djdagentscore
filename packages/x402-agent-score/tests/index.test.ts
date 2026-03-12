import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { agentScoreGate } from '../src/index.js'

const WALLET = '0x1234567890abcdef1234567890abcdef12345678'
const originalFetch = globalThis.fetch

function paymentHeader(wallet = WALLET): string {
  return Buffer.from(
    JSON.stringify({
      x402Version: 2,
      payload: {
        authorization: {
          from: wallet,
        },
      },
    }),
    'utf8',
  ).toString('base64')
}

function createApp(options?: Parameters<typeof agentScoreGate>[0]) {
  const app = new Hono()
  app.use('*', agentScoreGate(options))
  app.get('/paid', (c) => c.json({ ok: true }))
  return app
}

async function flushBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('agentScoreGate', () => {
  it('uses x402 payment headers to warm the cache and annotate the first request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          score: 72,
          tier: 'Established',
          recommendation: 'proceed_with_caution',
          confidence: 0.44,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    globalThis.fetch = fetchMock as typeof globalThis.fetch

    const app = createApp()
    const first = await app.request('http://localhost/paid', {
      headers: {
        'PAYMENT-SIGNATURE': paymentHeader(),
      },
    })

    expect(first.status).toBe(200)
    expect(first.headers.get('X-Agent-Score')).toBe('unscored')
    expect(first.headers.get('X-Agent-Tier')).toBe('Unknown')
    expect(first.headers.get('X-Agent-Recommendation')).toBe('insufficient_history')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await flushBackgroundWork()

    const second = await app.request('http://localhost/paid', {
      headers: {
        'PAYMENT-SIGNATURE': paymentHeader(),
      },
    })

    expect(second.status).toBe(200)
    expect(second.headers.get('X-Agent-Score')).toBe('72')
    expect(second.headers.get('X-Agent-Tier')).toBe('Established')
    expect(second.headers.get('X-Agent-Recommendation')).toBe('proceed_with_caution')
  })

  it('returns consistent decision headers when unknown wallets are rejected', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          score: 18,
          tier: 'Unverified',
          recommendation: 'high_risk',
          confidence: 0.91,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ) as typeof globalThis.fetch

    const app = createApp({
      apiUrl: 'https://scores.example.test/',
      onUnknown: 'reject',
    })
    const response = await app.request('http://localhost/paid', {
      headers: {
        'X-PAYMENT': paymentHeader(),
      },
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(response.headers.get('X-Agent-Score')).toBe('unscored')
    expect(response.headers.get('X-Agent-Tier')).toBe('Unknown')
    expect(response.headers.get('X-Agent-Recommendation')).toBe('insufficient_history')
    expect(body).toEqual({
      error: 'agent_score_unknown',
      message: 'This wallet has not been scored yet. Try again in a few seconds.',
      scoreUrl: `https://scores.example.test/v1/score/basic?wallet=${WALLET}`,
    })
  })

  it('blocks low-scoring wallets with headers after the cache is warm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          score: 12,
          tier: 'Unverified',
          recommendation: 'high_risk',
          confidence: 0.96,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    globalThis.fetch = fetchMock as typeof globalThis.fetch

    const app = createApp({ minScore: 25 })

    await app.request('http://localhost/paid', {
      headers: {
        'PAYMENT-SIGNATURE': paymentHeader(),
      },
    })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await flushBackgroundWork()

    const blocked = await app.request('http://localhost/paid', {
      headers: {
        'PAYMENT-SIGNATURE': paymentHeader(),
      },
    })
    const body = await blocked.json()

    expect(blocked.status).toBe(403)
    expect(blocked.headers.get('X-Agent-Score')).toBe('12')
    expect(blocked.headers.get('X-Agent-Tier')).toBe('Unverified')
    expect(blocked.headers.get('X-Agent-Recommendation')).toBe('high_risk')
    expect(body).toEqual({
      error: 'agent_score_too_low',
      score: 12,
      tier: 'Unverified',
      minRequired: 25,
      improve: 'https://djdagentscore.dev/v1/agent/register',
    })
  })
})
