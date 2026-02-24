# DJD Agent Score

Know if the agent wallet you're interacting with is trustworthy. On-chain reputation scoring for AI agent wallets, monetized via [x402](https://github.com/coinbase/x402) micropayments on Base.

One API call. No keys. No signup. Free tier included.

[Live API](https://djd-agent-score.fly.dev) · [OpenAPI Spec](https://djd-agent-score.fly.dev/openapi.json) · [Leaderboard](https://djd-agent-score.fly.dev/v1/leaderboard)

---

## Try it now

Score any wallet. No API key, no signup, no payment. 10 free calls per day.

```bash
curl "https://djd-agent-score.fly.dev/v1/score/basic?wallet=0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528"
```

Returns:

```json
{
  "wallet": "0x3E4Ef1f…",
  "score": 49,
  "tier": "Emerging",
  "confidence": 0.35,
  "recommendation": "Low activity. Build transaction history to improve score.",
  "modelVersion": "2.0.0",
  "lastUpdated": "2025-02-23T12:00:00.000Z",
  "computedAt": "2025-02-23T11:45:00.000Z",
  "scoreFreshness": 0.75,
  "freeTier": true,
  "freeQueriesRemainingToday": 9
}
```

`score` is 0–100. `confidence` reflects how much on-chain data backs the score. Wallets with more USDC transaction history and verified identity score higher.

Embed a live score badge in your own README:

```markdown
![Agent Score](https://djd-agent-score.fly.dev/v1/badge/0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528.svg)
```

View any wallet's profile page: [djd-agent-score.fly.dev/agent/{wallet}](https://djd-agent-score.fly.dev/agent/0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528)

---

## Built for

**AI agent developers on Base** — Check a wallet's reputation before your agent sends payment, accepts a request, or enters a contract.

**DeFi protocols** — Gate agent access or set risk parameters. Call the API before allowing an agent to interact with your lending pool, DEX, or yield vault.

**x402 builders** — A real-world example of an API monetized natively through the x402 payment standard.

---

## Integrate in 3 lines

### JavaScript

```js
// Free tier: 10 calls/day, no payment needed
const response = await fetch(
  "https://djd-agent-score.fly.dev/v1/score/basic?wallet=" + agentWallet
);
const { score, tier, confidence } = await response.json();

// Gate interactions based on trust
if (score < 50 || confidence < 0.3) {
  console.log("Wallet has insufficient reputation. Declining interaction.");
  return;
}

// Proceed with transaction
```

### Python

```python
import requests

resp = requests.get(
    "https://djd-agent-score.fly.dev/v1/score/basic",
    params={"wallet": agent_wallet}
)
data = resp.json()

if data["score"] >= 75 and data["confidence"] >= 0.5:
    # Trusted wallet, proceed
    execute_transaction(agent_wallet)
else:
    # Require additional verification
    flag_for_review(agent_wallet)
```

### curl (paid endpoint with x402)

```bash
# Full score breakdown — $0.10 USDC via x402
# x402-compatible clients handle the payment header automatically
curl "https://djd-agent-score.fly.dev/v1/score/full?wallet=0x…" \
  -H "X-PAYMENT: <payment_proof>"
```

---

## How scoring works

Every wallet is evaluated across five weighted dimensions based on its USDC transaction history on Base:

| Dimension | Weight | What it measures |
|---|---|---|
| **Payment Reliability** | 30% | Transaction volume, consistency, counterparty diversity |
| **Economic Viability** | 25% | USDC balance, inflow/outflow ratios, wallet age |
| **Identity** | 20% | Wallet age, Basename, registration, GitHub verification |
| **Behavior** | 15% | Transaction patterns, consistency, anomaly signals |
| **Capability** | 10% | x402 revenue earned, services operated |

**Score tiers:** Elite (90+) · Trusted (75–89) · Established (50–74) · Emerging (25–49) · Unverified (0–24)

The scoring engine indexes x402 settlements on-chain using the EIP-3009 `AuthorizationUsed` event. Agents that use x402 to pay for services accumulate verifiable payment history that feeds directly into their score. The more an agent transacts through x402, the more meaningful its reputation becomes.

Additional integrity layers: Sybil detection heuristics, score gaming detection, fraud report penalties. Scores are cached for 1 hour with background refresh for active wallets.

---

## API reference

### Free endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/v1/score/basic?wallet=0x…` | GET | Score, tier, confidence. 10 free calls/day. |
| `/v1/agent/register` | POST | Register your wallet. +10 identity bonus. |
| `/v1/score/compute` | POST | Queue background score computation. Returns jobId immediately. |
| `/v1/score/job/:jobId` | GET | Poll async job status (pending → complete). |
| `/v1/leaderboard` | GET | Top-ranked wallets by score. |
| `/agent/{wallet}` | GET | Profile page (HTML). |
| `/v1/badge/{wallet}.svg` | GET | Embeddable SVG score badge. |
| `/health` | GET | Service health and indexer status. |

### Paid endpoints (x402 USDC on Base)

| Endpoint | Method | Price | Description |
|---|---|---|---|
| `/v1/score/full?wallet=0x…` | GET | $0.10 | Per-dimension scores, raw data, history, fraud flags |
| `/v1/score/refresh?wallet=0x…` | GET | $0.25 | Force live recalculation (bypasses 1hr cache) |
| `/v1/report` | POST | $0.02 | Submit fraud/misconduct report against a wallet |
| `/v1/data/fraud/blacklist?wallet=0x…` | GET | $0.05 | Check if a wallet is on the fraud blacklist |

Paid endpoints return `402 Payment Required` without a valid payment proof. Include the proof in the `X-PAYMENT` header. Any x402-compatible client handles this automatically. [How x402 payments work →](#how-x402-payments-work)

---

## Register your agent

Registered wallets get a +10 point identity bonus. Free, one call.

```bash
curl -X POST https://djd-agent-score.fly.dev/v1/agent/register \
  -H 'Content-Type: application/json' \
  -d '{
    "wallet": "0xYourAgentWallet",
    "name": "My Agent",
    "description": "What your agent does",
    "github_url": "https://github.com/you/your-agent",
    "website_url": "https://your-agent.com"
  }'
```

Only `wallet` is required. Returns `201` on first registration, `200` on update. Re-posting updates metadata (upsert, omitted fields preserved). Linking a valid GitHub repo enables verification for additional identity scoring.

---

## Report fraud

Submit reports against wallets engaged in misconduct. $0.02 per report to prevent spam. Verified reports apply a score penalty.

```bash
curl -X POST https://djd-agent-score.fly.dev/v1/report \
  -H 'Content-Type: application/json' \
  -H 'X-PAYMENT: <payment_proof>' \
  -d '{
    "target": "0xSuspiciousWallet",
    "reporter": "0xYourWallet",
    "reason": "payment_fraud",
    "details": "Agent accepted payment but never delivered the service."
  }'
```

Reasons: `failed_delivery` · `payment_fraud` · `impersonation` · `malicious_behavior` · `other`

---

## Local development

```bash
git clone https://github.com/jacobsd32-cpu/djdagentscore
cd djdagentscore
npm install
npm run dev
```

Requires Node.js >= 20. Starts on `http://localhost:3000`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `PAY_TO` | `0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528` | USDC recipient for x402 payments |
| `FACILITATOR_URL` | `https://x402.org/facilitator` | x402 facilitator endpoint |
| `BASE_RPC_URL` | `https://base-mainnet.public.blastapi.io` | Base RPC (BlastAPI recommended) |

---

## Technical notes

**Stack:** Hono + SQLite + viem, deployed on Fly.io. Full architecture docs at [docs/architecture.md](docs/architecture.md).

**Blockchain indexer:** Polls Base USDC every 12 seconds for `AuthorizationUsed` and `Transfer` events. Two-layer filter (EIP-3009 event + $1 USDC amount cap) isolates x402 settlements from regular DeFi activity. Adaptive chunk sizing handles BlastAPI's 20k result cap.

**Database:** SQLite with DELETE journal mode (chosen over WAL for Fly.io network-attached volume compatibility). 20 tables covering scores, history, fraud reports, registrations, query logs, indexer state, and job stats.

**RPC provider:** Default is BlastAPI public Base endpoint. For heavy indexing, use a dedicated provider via `BASE_RPC_URL`. Avoid `publicnode.com` (rejects 10k-block `eth_getLogs` ranges).

**ERC-8004:** [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) (AI Agent Registry) check is disabled until a registry contract deploys on Base. Identity points redistributed to Basename (+5), GitHub verification (+5), wallet age (+5).

**Score caching:** 1 hour cache. Background refresh for up to 10 expired scores/hour. Force recalculation with `/v1/score/refresh` ($0.25).

### How x402 payments work

[x402](https://github.com/coinbase/x402) is an open payment protocol built on HTTP 402. When you hit a paid endpoint without payment, you get back a `402` response with payment instructions (amount, recipient, network). Your x402 client signs a USDC payment on Base, attaches the proof to `X-PAYMENT`, and resends the request. One additional round-trip, handled automatically by client libraries.

No API keys. No subscriptions. No accounts. Micropayments per request.

---

## License

[MIT](./LICENSE)

---

Built by DJD · Powered by [x402](https://github.com/coinbase/x402) · Running on [Base](https://base.org)
