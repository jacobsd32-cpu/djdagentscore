# x402-agent-score

Hono middleware that checks the [DJD Agent Score](https://djdagentscore.xyz) reputation of the wallet paying your x402 API — and optionally blocks low-reputation agents.

Scores are based on on-chain signals: wallet age, transaction history, ETH balance, USDC activity, Basename ownership, and GitHub-verified registration. Scores range 0–100.

## Install

```bash
npm install x402-agent-score
```

## Usage

```ts
import { Hono } from 'hono'
import { paymentMiddleware } from 'x402-hono'
import { agentScoreGate } from 'x402-agent-score'

const app = new Hono()

// 1. x402 payment middleware (verifies USDC payment)
app.use(paymentMiddleware(PAY_TO, routes, { url: FACILITATOR_URL }))

// 2. Agent score gate (runs after payment is verified)
app.use(agentScoreGate({
  minScore: 25,        // block wallets scoring below 25
  onUnknown: 'allow',  // let unscored wallets through (score fetched async)
}))

app.get('/my-api', (c) => c.json({ result: 'ok' }))
```

Every response gets three headers:

| Header | Value |
|--------|-------|
| `X-Agent-Score` | `0`–`100`, or `unscored` if not yet cached |
| `X-Agent-Tier` | `Elite` / `Trusted` / `Emerging` / `Unverified` / `Unknown` |
| `X-Agent-Recommendation` | `proceed` / `proceed_with_caution` / `review` / `block` |

## Options

```ts
agentScoreGate({
  // Minimum score to allow. Below this → 403. Default: 0 (headers only, nothing blocked)
  minScore: 25,

  // What to do for wallets with no score yet. Default: 'allow'
  // 'allow'  — let through, fetch score async for next request
  // 'reject' — return 403 until the wallet has been scored
  onUnknown: 'allow',

  // How to get the paying wallet from Hono context.
  // Default: tries c.get('x402PayerAddress'), X-Agent-Wallet header, ?wallet query param
  getWallet: (c) => c.get('myPayerAddress'),

  // Score API base URL. Default: https://djdagentscore.xyz
  apiUrl: 'https://djdagentscore.xyz',

  // Local cache TTL (ms). Avoids a score API call on every request. Default: 5 min
  cacheTtl: 300_000,
})
```

## How it works

1. The middleware extracts the paying wallet address from the request context
2. If the wallet has a **cached score** (from a previous request in this process), it enforces `minScore` and adds headers
3. If the wallet is **unknown**, it fires an async score fetch to warm the cache, then either allows or rejects based on `onUnknown`
4. The cache is in-process (a `Map`). Scores are refreshed after `cacheTtl` ms

The async-fetch design means **the first request from any wallet is never delayed** — it passes through while the score is fetched in the background, so the second request gets the enforcement.

## Extracting the wallet from x402 context

The default wallet extractor tries these in order:

1. `c.get('x402PayerAddress')` — if your x402 middleware sets this
2. `X-Agent-Wallet` request header
3. `?wallet` query parameter

If none of these work for your setup, provide `getWallet`:

```ts
agentScoreGate({
  getWallet: (c) => {
    // Example: extract from a custom auth header
    return c.req.header('x-paying-wallet')
  }
})
```

## Blocking unverified agents

To require a minimum reputation before serving any paid request:

```ts
agentScoreGate({
  minScore: 20,       // block Unverified tier (scores < 20 are brand new wallets)
  onUnknown: 'allow', // still allow first-time wallets (they get scored async)
})
```

A rejected request receives:

```json
{
  "error": "agent_score_too_low",
  "score": 12,
  "tier": "Unverified",
  "minRequired": 20,
  "improve": "https://djdagentscore.xyz/v1/agent/register"
}
```

## Agent registration

Agents can boost their score by self-registering:

```bash
curl -X POST https://djdagentscore.xyz/v1/agent/register \
  -H 'Content-Type: application/json' \
  -d '{"wallet":"0x...","name":"My Agent","github_url":"https://github.com/..."}'
```

Registration is free and adds +10–45 pts to the identity dimension.

## License

MIT
