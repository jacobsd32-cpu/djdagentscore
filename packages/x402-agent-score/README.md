# x402-agent-score

Hono middleware that checks the [DJD Agent Score](https://djdagentscore.dev) reputation of the wallet paying your x402 API, and optionally blocks low-reputation agents.

Scores are based on on-chain signals: wallet age, transaction history, ETH balance, USDC activity, Basename ownership, and GitHub-verified registration. Scores range 0-100.

## Install

```bash
npm install x402-agent-score @x402/core @x402/evm @x402/hono hono
```

## Usage

```ts
import { HTTPFacilitatorClient } from '@x402/core/server'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { paymentMiddlewareFromConfig } from '@x402/hono'
import { Hono } from 'hono'
import { agentScoreGate } from 'x402-agent-score'

const app = new Hono()
const facilitator = new HTTPFacilitatorClient({ url: 'https://x402.org/facilitator' })

app.use(
  paymentMiddlewareFromConfig(
    {
      'GET /my-api': {
        accepts: {
          scheme: 'exact',
          network: 'eip155:8453',
          payTo: '0xYourPayToAddress',
          price: '$0.01',
        },
        description: 'Protected x402 endpoint',
      },
    },
    facilitator,
    [{ network: 'eip155:8453', server: new ExactEvmScheme() }],
  ),
)

// Run this after x402 payment verification.
app.use(agentScoreGate({
  minScore: 25,
  onUnknown: 'allow',
}))

app.get('/my-api', (c) => c.json({ result: 'ok' }))
```

`agentScoreGate()` should run after the x402 middleware so it reads a verified x402 payment header, not an untrusted client-supplied value.

Every response gets three headers:

| Header | Value |
|--------|-------|
| `X-Agent-Score` | `0`-`100`, or `unscored` if not yet cached |
| `X-Agent-Tier` | `Elite` / `Trusted` / `Established` / `Emerging` / `Unverified` / `Unknown` |
| `X-Agent-Recommendation` | `proceed` / `proceed_with_caution` / `insufficient_history` / `high_risk` / `flagged_for_review` |

The first request from a new wallet typically returns `unscored`, `Unknown`, and `insufficient_history` while the cache warms in the background.

## Options

```ts
agentScoreGate({
  // Minimum score to allow. Below this -> 403. Default: 0 (headers only, nothing blocked)
  minScore: 25,

  // What to do for wallets with no score yet. Default: 'allow'
  // 'allow'  -> let through, fetch score async for next request
  // 'reject' -> return 403 until the wallet has been scored
  onUnknown: 'allow',

  // How to get the paying wallet from Hono context.
  // Default order:
  //   1. c.get('x402PayerAddress')
  //   2. decoded PAYMENT-SIGNATURE / X-PAYMENT header from x402 clients
  //   3. X-Agent-Wallet header
  //   4. ?wallet query param
  getWallet: (c) => c.get('myPayerAddress'),

  // Score API base URL. Default: https://djdagentscore.dev
  apiUrl: 'https://djdagentscore.dev',

  // Local cache TTL (ms). Avoids a score API call on every request. Default: 5 min
  cacheTtl: 300_000,
})
```

## How it works

1. The middleware extracts the paying wallet address from x402 headers or your custom context.
2. If the wallet has a cached score, it enforces `minScore` and adds decision headers.
3. If the wallet is unknown, it fires an async score fetch to warm the cache, then either allows or rejects based on `onUnknown`.
4. The cache is in-process (a `Map`). Scores are refreshed after `cacheTtl` ms.

The async-fetch design means the first request from any wallet is never delayed. It passes through while the score is fetched in the background, so the second request gets enforcement.

## Extracting the wallet from x402 requests

The default wallet extractor tries these in order:

1. `c.get('x402PayerAddress')` if your own middleware sets it
2. Decoded `PAYMENT-SIGNATURE` or `X-PAYMENT` x402 payment header
3. `X-Agent-Wallet` request header
4. `?wallet` query parameter

If none of these work for your setup, provide `getWallet`:

```ts
agentScoreGate({
  getWallet: (c) => {
    return c.req.header('x-paying-wallet')
  },
})
```

## Blocking unverified agents

To require a minimum reputation before serving any paid request:

```ts
agentScoreGate({
  minScore: 20,
  onUnknown: 'allow',
})
```

A rejected request receives:

```json
{
  "error": "agent_score_too_low",
  "score": 12,
  "tier": "Unverified",
  "minRequired": 20,
  "improve": "https://djdagentscore.dev/v1/agent/register"
}
```

Rejected responses still include `X-Agent-Score`, `X-Agent-Tier`, and `X-Agent-Recommendation` headers so you can log or meter the decision consistently.

## Agent registration

Agents can boost their score by self-registering:

```bash
curl -X POST https://djdagentscore.dev/v1/agent/register \
  -H 'Content-Type: application/json' \
  -d '{"wallet":"0x...","name":"My Agent","github_url":"https://github.com/..."}'
```

Registration is free and adds +10-45 pts to the identity dimension.

## Reference example

Full Hono example: [examples/x402-hono.ts](https://github.com/jacobsd32-cpu/djdagentscore/blob/main/examples/x402-hono.ts)

## License

MIT
