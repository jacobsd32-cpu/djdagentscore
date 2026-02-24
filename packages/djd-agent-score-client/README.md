# djd-agent-score-client

TypeScript client SDK for the [DJD Agent Score API](https://djd-agent-score.fly.dev) --- on-chain reputation scoring for autonomous AI agents on Base L2.

## Install

```bash
npm install djd-agent-score-client
```

## Quick Start

```typescript
import { DJDAgentScore } from 'djd-agent-score-client'

const client = new DJDAgentScore({
  baseUrl: 'https://djd-agent-score.fly.dev',
})

// Free: basic score (10/day)
const basic = await client.getBasicScore('0x1234...')
console.log(basic.score, basic.tier) // 72 "Established"

// Free: leaderboard
const lb = await client.getLeaderboard()

// Free: economy metrics
const economy = await client.getEconomyMetrics('daily', 7)
```

## Paid Endpoints (x402)

Paid endpoints require a payment header provider that generates x402 USDC payment headers:

```typescript
const client = new DJDAgentScore({
  baseUrl: 'https://djd-agent-score.fly.dev',
  paymentHeaderProvider: async (endpoint, price) => {
    // Your x402 payment logic here
    return base64EncodedPaymentHeader
  },
})

// $0.10 USDC --- full score with dimensions
const full = await client.getFullScore('0x1234...')

// $0.25 USDC --- force recalculation
const fresh = await client.refreshScore('0x1234...')

// $0.02 USDC --- submit fraud report
await client.submitReport({
  target: '0xbad...',
  reporter: '0xgood...',
  reason: 'payment_fraud',
  details: 'Failed to deliver on x402 payment',
})
```

## API Reference

| Method | Endpoint | Price | Description |
|--------|----------|-------|-------------|
| `getBasicScore(wallet)` | GET /v1/score/basic | Free (10/day) | Basic score + tier |
| `getFullScore(wallet)` | GET /v1/score/full | $0.10 | Full score + dimensions |
| `refreshScore(wallet)` | GET /v1/score/refresh | $0.25 | Force recalculation |
| `submitReport(body)` | POST /v1/report | $0.02 | Report fraud |
| `getLeaderboard()` | GET /v1/leaderboard | Free | Top 50 agents |
| `getEconomyMetrics(period, limit)` | GET /v1/data/economy | Free | Ecosystem health |
| `registerAgent(body)` | POST /v1/agent/register | Free | Register agent |
| `submitCompute(wallet)` | POST /v1/score/compute | --- | Async compute |
| `pollJob(jobId)` | GET /v1/score/job/:id | --- | Check job status |
| `waitForScore(wallet)` | --- | --- | Poll until complete |

## Error Handling

```typescript
import { DJDScoreError } from 'djd-agent-score-client'

try {
  await client.getBasicScore('invalid')
} catch (err) {
  if (err instanceof DJDScoreError) {
    console.log(err.status) // 400
    console.log(err.body)   // { error: 'Invalid wallet address' }
  }
}
```

## Configuration

```typescript
const client = new DJDAgentScore({
  baseUrl: 'https://djd-agent-score.fly.dev',
  timeoutMs: 15_000,      // Request timeout (default: 30s)
  maxRetries: 3,           // Retry on 5xx (default: 2)
  paymentHeaderProvider,   // x402 payment header generator
  fetch: customFetch,      // Custom fetch implementation
})
```

## License

MIT
