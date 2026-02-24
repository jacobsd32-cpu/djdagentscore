# DJD Agent Score

On-chain reputation scoring for AI agent wallets, monetised via [x402](https://github.com/coinbase/x402) micropayments on Base.

**Live API:** https://djdagentscore.xyz
**OpenAPI spec:** https://djdagentscore.xyz/openapi.json

---

## What it does

As AI agents proliferate and start transacting autonomously, there's no standard way to assess their trustworthiness. DJD Agent Score produces a **0–100 reputation score** for any wallet by analysing its USDC on-chain history across five dimensions:

| Dimension | Weight | What it measures |
|---|---|---|
| **Payment Reliability** | 30% | Transaction volume, consistency, counterparty diversity |
| **Economic Viability** | 25% | USDC balance, inflow/outflow ratios, wallet age |
| **Identity** | 20% | Wallet age, Basename, voluntary registration, GitHub verification |
| **Behavior** | 15% | Transaction patterns, consistency, anomaly signals |
| **Capability** | 10% | x402 revenue earned, services operated |

**Score tiers:** Elite (90+) · Trusted (75–89) · Established (50–74) · Emerging (25–49) · Unverified (0–24)

The indexer also tracks x402 settlements on-chain using the EIP-3009 `AuthorizationUsed` event — so agents that *use* x402 to pay for services accumulate verifiable payment history that feeds directly into their reputation score. The more agents use x402, the more meaningful their scores become.

---

## API endpoints

### Free endpoints

#### `POST /v1/agent/register`

Register your agent wallet with optional metadata. Free, no payment required.
Registered wallets receive a **+10 point identity bonus**.
Re-posting updates metadata (upsert — omitted fields are preserved).

```bash
curl -X POST https://djdagentscore.xyz/v1/agent/register \
  -H 'Content-Type: application/json' \
  -d '{
    "wallet": "0xYourAgentWallet",
    "name": "My Agent",
    "description": "What your agent does",
    "github_url": "https://github.com/you/your-agent",
    "website_url": "https://your-agent.com"
  }'
```

Only `wallet` is required. Returns `201` on first registration, `200` on update.

#### `GET /health`

Service health, uptime, and indexer status.

#### `GET /v1/leaderboard`

Top-ranked agent wallets by score. Free, no payment required.

#### `GET /agent/{wallet}`

Human-readable agent profile page (HTML).

#### `GET /v1/badge/{wallet}.svg`

SVG score badge you can embed in READMEs.

```markdown
![Agent Score](https://djdagentscore.xyz/v1/badge/0xYourWallet.svg)
```

---

### Paid endpoints (x402 USDC on Base)

All paid endpoints return `402 Payment Required` when no valid payment proof is supplied. Include the payment proof in the `X-PAYMENT` header — handled automatically by any x402-compatible client.

The first **10 requests/day** to `/v1/score/basic` are free (no payment needed).

#### `GET /v1/score/basic?wallet=0x…` — Free (10/day)

```json
{
  "wallet": "0x…",
  "score": 72,
  "tier": "Established",
  "confidence": 0.85,
  "recommendation": "Moderate activity with verified identity.",
  "modelVersion": "2.0.0",
  "lastUpdated": "2026-02-22T12:00:00.000Z",
  "computedAt": "2026-02-22T12:00:00.000Z",
  "scoreFreshness": 0.95
}
```

#### `GET /v1/score/full?wallet=0x…` — $0.10

Full breakdown including per-dimension scores (reliability, viability, identity, behavior, capability), raw dimension data, score history, recommendations, and fraud flags.

#### `GET /v1/score/refresh?wallet=0x…` — $0.25

Forces a live recalculation from on-chain data, bypassing the 1-hour cache.

#### `POST /v1/report` — $0.02

Submit a fraud or misconduct report against a wallet. Verified reports apply a score penalty.

```json
{
  "target": "0x…",
  "reporter": "0x…",
  "reason": "payment_fraud",
  "details": "Agent accepted payment but never delivered the service."
}
```

`reason`: `failed_delivery` · `payment_fraud` · `impersonation` · `malicious_behavior` · `other`

#### `GET /v1/data/fraud/blacklist?wallet=0x…` — $0.05

Check whether a wallet appears on the fraud blacklist.

---

## Quick start (local dev)

```bash
git clone https://github.com/jacobsd32-cpu/djdagentscore
cd djdagentscore
npm install
npm run dev
```

Requires Node.js ≥ 20. Server starts on `http://localhost:3000`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `PAY_TO` | `0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528` | USDC recipient for x402 payments |
| `FACILITATOR_URL` | `https://x402.org/facilitator` | x402 facilitator endpoint |
| `BASE_RPC_URL` | `https://base-mainnet.public.blastapi.io` | Base RPC (BlastAPI recommended) |

---

## Architecture

```
src/
├── index.ts                   # Hono app, x402 middleware, background jobs
├── types.ts                   # TypeScript interfaces
├── db.ts                      # SQLite (better-sqlite3) — WAL mode
├── blockchain.ts              # viem public client, chunked getLogs
├── routes/
│   ├── register.ts            # POST /v1/agent/register
│   ├── score.ts               # GET /v1/score/*
│   ├── report.ts              # POST /v1/report
│   ├── leaderboard.ts         # GET /v1/leaderboard
│   ├── badge.ts               # GET /v1/badge/*.svg
│   └── agent.ts               # GET /agent/{wallet} (HTML)
├── scoring/
│   ├── dimensions.ts          # Reliability, Viability, Identity, Capability
│   ├── behavior.ts            # Behavior dimension (transaction patterns)
│   ├── engine.ts              # Orchestration, caching, fraud penalties
│   ├── sybil.ts               # Sybil detection
│   ├── gaming.ts              # Score gaming detection
│   ├── confidence.ts          # Confidence scoring
│   └── recommendation.ts     # Score improvement recommendations
└── jobs/
    ├── blockchainIndexer.ts   # Continuous x402 settlement indexer (EIP-3009)
    ├── scoreRefresh.ts        # Hourly background score refresh
    ├── anomalyDetector.ts     # Anomaly and Sybil monitoring
    ├── intentMatcher.ts       # Pre/post payment intent matching
    └── githubReverify.ts      # Periodic GitHub verification refresh
```

**Blockchain indexer:** Polls Base USDC every 12 seconds for `AuthorizationUsed` + `Transfer` events. Uses a two-layer filter (EIP-3009 event + $1 USDC amount cap) to isolate x402 settlements from regular DeFi activity. Adaptive chunk sizing handles BlastAPI's 20k result cap gracefully.

**Database:** SQLite with WAL mode. 22 tables covering scores, history, fraud reports, agent registrations, query logs, indexer state, and job stats.

---

## Notes

### RPC provider
The default RPC is BlastAPI's public Base endpoint. For heavy indexing, use a dedicated provider (Alchemy, QuickNode) via the `BASE_RPC_URL` env var. `publicnode.com` rejects 10k-block `eth_getLogs` ranges — use BlastAPI or similar.

### ERC-8004 Registry
[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) (AI Agent Registry) is a proposed standard. No registry contract is deployed on Base yet, so the ERC-8004 check is disabled in the scoring model. The 20 identity points previously allocated to ERC-8004 have been redistributed across Basename (+5), GitHub verification (+5), and wallet age (+5). When a registry deploys, the scoring model will re-integrate it.

### Score cache
Scores are cached for 1 hour. The background job refreshes up to 10 expired scores per hour. Use `/v1/score/refresh` ($0.25) to force an immediate recalculation.
