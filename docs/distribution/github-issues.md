# GitHub Issue Outreach — DJD Agent Score Integration

> These are ready-to-post GitHub issues for the top agent frameworks on Base.
> Each one is respectful, includes working code, and shows clear value.
> Post these as feature requests on each repo.

---

## 1. coinbase/agentkit — Pre-Transfer Reputation Check

**Title:** `[Feature Request] Add wallet reputation check before transfers`

**Body:**

### Problem

When an AgentKit agent executes a `transfer` action, it sends USDC/ETH to a wallet address with no way to assess the recipient's trustworthiness. A fresh sybil wallet looks identical to a 6-month-old legitimate operator.

### Proposal

Add an optional pre-transfer reputation check using [DJD Agent Score](https://djdagentscore.dev), a free API that scores wallets on Base based on their on-chain transaction history.

The integration is 5 lines in the transfer action:

```typescript
// Before executing transfer, check recipient reputation
const scoreRes = await fetch(
  `https://djdagentscore.dev/v1/score/basic?wallet=${recipientAddress}`
);
const { score, tier, confidence } = await scoreRes.json();

if (score < 40 || confidence < 0.2) {
  return `Warning: Recipient wallet ${recipientAddress} has a low reputation score (${score}/100, ${tier}). This wallet may be newly created or exhibit suspicious patterns. Proceed with caution.`;
}

// Continue with existing transfer logic...
```

### Why this matters

- **Free tier:** 10 calls/day, no API key, no signup, no payment
- **Fast:** <200ms response time, cached scores
- **On-chain data only:** Scores are based on real USDC transaction history, partner diversity, account age, and 12 behavioral sybil/gaming checks
- **x402 native:** Paid tier uses the same x402 protocol AgentKit already supports

### Try it

```bash
curl "https://djdagentscore.dev/v1/score/basic?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
```

[API Docs](https://djdagentscore.dev/docs) · [OpenAPI Spec](https://djdagentscore.dev/openapi.json) · [GitHub](https://github.com/jacobsd32-cpu/djdagentscore)

---

## 2. coinbase/x402 — Facilitator-Level Reputation Gating

**Title:** `[Feature Request] Reputation-based payment acceptance in facilitator`

**Body:**

### Problem

The x402 facilitator settles payments from any wallet that signs a valid USDC authorization. There's no way for the facilitator (or the resource server) to filter payments from wallets with known sybil or gaming behavior.

### Proposal

Add an optional reputation check in the facilitator's payment verification flow. Before settling a payment, the facilitator could query the payer wallet's reputation score and reject payments from wallets below a configurable threshold.

This could be implemented as:

1. **Facilitator-level** — The facilitator checks the payer's score before calling `transferWithAuthorization`
2. **Middleware hook** — The `@x402/hono` / `@x402/express` middleware exposes a `beforeSettle` callback where the resource server can check reputation

Example middleware hook:

```typescript
import { paymentMiddleware } from '@x402/hono';

app.use(paymentMiddleware({
  // ... existing config
  beforeSettle: async (payerWallet) => {
    const res = await fetch(
      `https://djdagentscore.dev/v1/score/basic?wallet=${payerWallet}`
    );
    const { score } = await res.json();
    if (score < 25) {
      throw new Error(`Payer wallet reputation too low (${score}/100)`);
    }
  }
}));
```

### Context

[DJD Agent Score](https://djdagentscore.dev) is a reputation scoring API for agent wallets on Base, itself monetized through x402. It analyzes on-chain USDC transaction history and runs 12 behavioral checks (sybil detection, gaming detection, wash trading, etc.).

Free tier: 10 calls/day, no signup. [Try it →](https://djdagentscore.dev/v1/score/basic?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)

---

## 3. Conway-Research/automaton — Score Check Before Funding Child Agents

**Title:** `[Feature Request] Reputation check for external wallet interactions`

**Body:**

### Problem

Automaton agents can spawn child agents and fund their wallets. They also interact with external services by paying USDC via x402. Currently there's no reputation signal for the external wallets these agents interact with — or for the automaton agents themselves when they interact with third-party services.

### Proposal

Add a reputation check using [DJD Agent Score](https://djdagentscore.dev) in two places:

**1. Before paying an external service:**
```typescript
const { score, tier } = await fetch(
  `https://djdagentscore.dev/v1/score/basic?wallet=${serviceWallet}`
).then(r => r.json());

if (score < 50) {
  log(`Skipping service at ${serviceWallet} — low reputation (${score}/100, ${tier})`);
  return findAlternativeService();
}
```

**2. Exposing the automaton's own score to services:**
Services that an automaton agent pays could check its wallet reputation before accepting payment. This creates a two-way trust layer.

### Why this matters for self-replicating agents

When an automaton spawns a child and funds its wallet, the ecosystem needs a way to differentiate legitimate automatons from malicious self-replicating agents. DJD scores provide this signal — agents with consistent, non-gaming transaction patterns score higher over time.

Free tier: 10 calls/day, no API key needed.
[API Docs](https://djdagentscore.dev/docs) · [GitHub](https://github.com/jacobsd32-cpu/djdagentscore)

---

## 4. BlockRunAI/ClawRouter — Wallet Reputation for Payment Acceptance

**Title:** `[Feature Request] Reputation scoring for agent wallets`

**Body:**

### Problem

ClawRouter uses wallet-based identity — agents fund a wallet and pay USDC per request with no API keys. This is elegant, but it means there's no trust signal for incoming wallets. A fresh sybil wallet is treated the same as a wallet with 6 months of clean transaction history.

### Proposal

Add optional reputation scoring for agent wallets using [DJD Agent Score](https://djdagentscore.dev). This could enable:

- **Tiered pricing:** Low-reputation wallets pay a premium, high-reputation wallets get discounts
- **Rate limiting by reputation:** Higher-trust wallets get more generous rate limits
- **Flagging:** Admin dashboard shows reputation scores alongside wallet activity

```typescript
// On first request from a new wallet, check reputation
const { score, tier, confidence } = await fetch(
  `https://djdagentscore.dev/v1/score/basic?wallet=${payerWallet}`
).then(r => r.json());

// Cache the score — it changes slowly (hourly refresh)
walletReputationCache.set(payerWallet, { score, tier, confidence, checkedAt: Date.now() });
```

### Context

DJD Agent Score analyzes on-chain USDC transaction history on Base, running 12 behavioral checks including sybil detection, wash trading detection, and gaming detection. Since ClawRouter already operates on Base with USDC, the data is directly relevant.

Free tier: 10 calls/day. [Try it →](https://djdagentscore.dev/v1/score/basic?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)

---

## 5. google-agentic-commerce/a2a-x402 — Agent Reputation in A2A Commerce

**Title:** `[Feature Request] Reputation scoring for agent-to-agent transactions`

**Body:**

### Problem

In A2A + x402 commerce, a client agent discovers a merchant agent, requests a service, pays USDC, and receives the result. Neither side has a reputation signal about the other. A new, unverified agent is treated identically to one with months of clean transaction history.

### Proposal

Add an optional reputation check using [DJD Agent Score](https://djdagentscore.dev) at two points in the A2A flow:

**1. Client checks merchant before paying:**
```typescript
// Before signing USDC payment to merchant
const { score, tier } = await fetch(
  `https://djdagentscore.dev/v1/score/basic?wallet=${merchantWallet}`
).then(r => r.json());

if (score < 50) {
  // Find a more reputable merchant
  return discoverAlternativeMerchant(taskDescription);
}
```

**2. Merchant checks client before delivering:**
```typescript
// After receiving payment proof, before executing task
const { score } = await fetch(
  `https://djdagentscore.dev/v1/score/basic?wallet=${clientWallet}`
).then(r => r.json());

// Low-reputation clients might get limited service or require higher payment
```

**3. Agent Card metadata:**
The A2A agent card could include a `reputationScore` field that other agents check during discovery:
```json
{
  "name": "My Agent",
  "skills": [...],
  "reputationScore": {
    "provider": "djd-agent-score",
    "wallet": "0x...",
    "score": 82,
    "tier": "Trusted"
  }
}
```

### Context

[DJD Agent Score](https://djdagentscore.dev) scores wallets on Base based on real USDC transaction history. It runs 12 behavioral checks (sybil detection, gaming detection, wash trading). Free tier: 10/day, no signup. Paid tier uses x402 — the same protocol this repo implements.

[API Docs](https://djdagentscore.dev/docs) · [GitHub](https://github.com/jacobsd32-cpu/djdagentscore)
