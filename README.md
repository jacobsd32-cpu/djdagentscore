# DJD Agent Score API

Reputation scoring service for autonomous AI agents, monetised via x402 micropayments on Base.

## Overview

Every AI agent gets a **composite score (0–100)** derived from four on-chain dimensions:

| Dimension | Weight | Data source |
|---|---|---|
| Transaction Reliability | 35% | USDC transfer history |
| Economic Viability | 30% | USDC balance & flow |
| Identity & Lineage | 20% | Wallet age, ERC-8004 |
| Capability Signal | 15% | Revenue, services |

**Tiers:** Elite (90+), Trusted (75–89), Established (50–74), Emerging (25–49), Unverified (0–24)

---

## Quick start

### Prerequisites

- Node.js ≥ 20
- npm / pnpm / bun

### Install

```bash
npm install
```

### Run (development)

```bash
npm run dev
```

### Run (production)

```bash
npm run build
npm start
```

The server starts on **http://localhost:3000** by default.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `PAY_TO` | `0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528` | USDC recipient for x402 payments |
| `FACILITATOR_URL` | `https://facilitator.openx402.ai` | x402 facilitator endpoint |

---

## API reference

### Free endpoints

#### `GET /health`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600,
  "cachedScores": 142
}
```

#### `GET /v1/leaderboard`

```json
{
  "leaderboard": [
    { "rank": 1, "wallet": "0x…", "score": 94, "tier": "Elite", "daysAlive": 120 }
  ],
  "totalAgentsScored": 142,
  "lastUpdated": "2025-01-01T00:00:00.000Z"
}
```

---

### Paid endpoints (x402 USDC on Base)

All paid endpoints return **402 Payment Required** when no valid payment proof is supplied.
Include the payment proof in the `X-PAYMENT` request header (handled automatically by x402-compatible clients).

#### `GET /v1/score/basic?wallet=0x…` — $0.03

```json
{
  "wallet": "0x…",
  "score": 72,
  "tier": "Established",
  "lastUpdated": "2025-01-01T00:00:00.000Z"
}
```

> Optional `"stale": true` is added when the RPC is unavailable and a cached score is served.

#### `GET /v1/score/full?wallet=0x…` — $0.10

Same as `/basic` plus:

```json
{
  "dimensions": {
    "reliability": {
      "score": 68,
      "data": { "txCount": 47, "successRate": 0.96, "lastTxTimestamp": 1700000000000, "failedTxCount": 0, "uptimeEstimate": 0.78 }
    },
    "viability": {
      "score": 75,
      "data": { "usdcBalance": "123.45", "inflows30d": "200.00", "outflows30d": "80.00", "inflows7d": "50.00", "outflows7d": "20.00", "totalInflows": "800.00", "walletAgedays": 45, "everZeroBalance": false }
    },
    "identity": {
      "score": 60,
      "data": { "erc8004Registered": false, "walletAgeDays": 45, "creatorScore": null, "generationDepth": 0, "constitutionHashVerified": false }
    },
    "capability": {
      "score": 55,
      "data": { "activeX402Services": 1, "totalRevenue": "800.00", "domainsOwned": 0, "successfulReplications": 0 }
    }
  },
  "scoreHistory": [
    { "score": 70, "calculatedAt": "2024-12-31T00:00:00.000Z" }
  ]
}
```

#### `GET /v1/score/refresh?wallet=0x…` — $0.25

Forces live recalculation from on-chain data, bypassing the 1-hour cache.
Returns the same schema as `/full`.

#### `POST /v1/report` — $0.02

Request body:

```json
{
  "target": "0x…",
  "reporter": "0x…",
  "reason": "payment_fraud",
  "details": "Agent accepted payment but never delivered the service."
}
```

`reason` must be one of: `failed_delivery`, `payment_fraud`, `impersonation`, `malicious_behavior`, `other`

Response:

```json
{
  "reportId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "accepted",
  "targetCurrentScore": 67,
  "penaltyApplied": 5
}
```

---

## Architecture

```
src/
├── index.ts          # Hono app, x402 middleware, background refresh job
├── types.ts          # TypeScript interfaces
├── db.ts             # SQLite (better-sqlite3) schema & queries
├── blockchain.ts     # viem public client, USDC event queries
└── scoring/
    ├── dimensions.ts # Reliability, Viability, Identity, Capability calculators
    └── engine.ts     # Orchestration, caching logic, penalty application
```

**Database** (`data/scores.db`):
- `scores` — cached composite & dimension scores (1-hour TTL)
- `score_history` — last 50 scores per wallet
- `fraud_reports` — submitted reports with penalty tracking

**Blockchain reads** (Base mainnet RPC):
- USDC `Transfer` events (chunked `eth_getLogs`, 10k blocks/call, 5 parallel)
- `balanceOf` for current USDC balance
- ERC-8004 registry check (stub — update contract address when registry is live)

---

## Notes

### x402-hono version compatibility

The `paymentMiddleware` call uses the signature:

```ts
paymentMiddleware(payTo, routes[], { url: facilitatorUrl })
```

If your installed version of `x402-hono` uses a different signature, update `src/index.ts` accordingly.
Check the [x402-hono changelog](https://github.com/coinbase/x402) for your version.

### ERC-8004 Registry

ERC-8004 (AI Agent Registry) is a proposed standard. The registry contract address in `src/blockchain.ts` is currently set to the zero address and will return `false` for all wallets until the actual registry is deployed on Base.
Update the `ERC8004_REGISTRY` constant once the contract is live.

### RPC rate limits

The default Base mainnet RPC (`https://mainnet.base.org`) may rate-limit heavy traffic.
For production, use a dedicated RPC provider (Alchemy, QuickNode, Infura) by overriding the URL in `src/blockchain.ts` or via an environment variable.

### Score freshness

- Scores are cached for **1 hour**.
- The background job runs every hour to proactively refresh expired scores (up to 10 at a time).
- Clients can force a fresh calculation using `/v1/score/refresh` (costs $0.25).
