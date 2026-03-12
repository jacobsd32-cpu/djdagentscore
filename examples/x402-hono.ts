/**
 * Reference x402 + DJD Agent Score integration for a Hono resource server.
 *
 * Install:
 *   npm install hono @x402/core @x402/evm @x402/hono x402-agent-score
 *
 * The agent score gate runs after x402 payment verification and extracts the
 * payer wallet from the official PAYMENT-SIGNATURE / X-PAYMENT header.
 */

import { HTTPFacilitatorClient } from '@x402/core/server'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { paymentMiddlewareFromConfig } from '@x402/hono'
import { Hono } from 'hono'
import { agentScoreGate } from 'x402-agent-score'

const app = new Hono()
const facilitator = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL ?? 'https://x402.org/facilitator',
})

const payTo = (process.env.PAY_TO ?? '0x0000000000000000000000000000000000000000') as `0x${string}`

app.use(
  paymentMiddlewareFromConfig(
    {
      'GET /research': {
        accepts: {
          scheme: 'exact',
          network: 'eip155:8453',
          payTo,
          price: '$0.05',
        },
        description: 'Premium research endpoint',
      },
    },
    facilitator,
    [{ network: 'eip155:8453', server: new ExactEvmScheme() }],
  ),
)

app.use(
  agentScoreGate({
    minScore: 25,
    onUnknown: 'allow',
    cacheTtl: 300_000,
  }),
)

app.get('/research', (c) => {
  return c.json({
    result: 'paid research payload',
    agentScore: c.res.headers.get('X-Agent-Score'),
    agentTier: c.res.headers.get('X-Agent-Tier'),
    recommendation: c.res.headers.get('X-Agent-Recommendation'),
  })
})

export default app
