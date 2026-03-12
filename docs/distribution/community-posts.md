# Community Posts — DJD Agent Score

> Ready-to-post messages for Discord channels, Reddit, and forums.
> Adapt tone per community. Keep it real — share what you built, not hype.

---

## 1. Coinbase Developer Discord — #x402 or #agent-toolkit channel

**Post:**

Hey all — I built an open-source wallet reputation API for Base, monetized through x402.

**What it does:** Score any wallet on Base based on its on-chain USDC transaction history. Returns a 0-100 score with sybil detection, gaming detection, and 12 behavioral checks. One GET request, under 200ms.

**Why it exists:** If your agent is about to send USDC to a wallet it's never interacted with, there's currently no way to know if that wallet is a legit 6-month operator or a fresh sybil wallet created 3 hours ago.

**Free tier — no signup, no API key:**
```
curl "https://djdagentscore.dev/v1/score/basic?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
```

Paid endpoints (full dimension breakdown, batch scoring, history) use x402 natively — USDC micropayments per request on Base.

Repo: https://github.com/jacobsd32-cpu/djdagentscore
API docs: https://djdagentscore.dev/docs

I'd love feedback from anyone building agents that transact on Base. The scoring model (v2.5) uses adaptive weights that learn from outcome data — dimensions that better predict real wallet behavior get higher weight over time.

---

## 2. r/x402 Post

**Title:** I built a wallet reputation API for Base agents, paid via x402

**Body:**

Been building this for a few months — DJD Agent Score is a reputation scoring API for AI agent wallets on Base.

**The problem it solves:** Your agent is about to transfer USDC to a wallet. Should it? That wallet could be legit or a fresh sybil. DJD answers this in one API call.

**How it works:**
- Indexes every USDC transfer on Base (EIP-3009 `AuthorizationUsed` events + standard transfers)
- Scores wallets across 5 dimensions: payment reliability, economic viability, identity, behavior, capability
- Runs 12 sybil/gaming detection checks (closed-loop trading, wash trading, velocity spikes, balance window dressing, etc.)
- Returns a 0-100 score with confidence level and recommendation

**Free tier:**
```
curl "https://djdagentscore.dev/v1/score/basic?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
```
10 calls/day, no API key, no signup, no payment.

**Paid tier uses x402:**
| Endpoint | Price |
|---|---|
| Full score + dimensions | $0.10 |
| Force refresh | $0.25 |
| History + trends | $0.15 |
| Batch (20 wallets) | $0.50 |
| Fraud report | $0.02 |

The scoring engine's v2.5 "flywheel" adapts over time — population-derived breakpoints, outcome-learned weights, trajectory analysis, and confidence dampening.

Stack: Hono + SQLite + viem. Deployed on Fly.io. MIT licensed.

- Repo: https://github.com/jacobsd32-cpu/djdagentscore
- Live API: https://djdagentscore.dev
- API Docs: https://djdagentscore.dev/docs
- Discovery: https://djdagentscore.dev/.well-known/x402

Would love feedback, especially from anyone building x402 services or agent frameworks on Base. Open to PRs.

---

## 3. Base Builders / Onchain Agents Discord

**Post:**

Shipping something for the agents-on-Base community: a free API that scores any wallet's reputation based on its on-chain USDC history.

**Use case:** Before your agent sends money to a counterparty, check if they're legit:

```js
const { score, tier } = await fetch(
  `https://djdagentscore.dev/v1/score/basic?wallet=${recipientWallet}`
).then(r => r.json());

if (score < 40) {
  // This wallet has almost no history or shows suspicious patterns
  decline();
}
```

It indexes USDC transfers on Base in real-time and runs sybil + gaming detection (wash trading, velocity spikes, balance window dressing, closed-loop detection, etc.).

Free: 10 calls/day, no key. Paid tier is x402 micropayments.

Try it: https://djdagentscore.dev/docs
GitHub: https://github.com/jacobsd32-cpu/djdagentscore

If you're building with AgentKit, Eliza, or any framework that sends USDC on Base — this is designed for you. Happy to help with integration.

---

## 4. Twitter/X Thread (if you want to post from your account)

**Tweet 1:**
I built a free wallet reputation API for AI agents on Base.

One API call tells you if a wallet is legit or a fresh sybil. No signup, no API key.

```
curl "https://djdagentscore.dev/v1/score/basic?wallet=0x..."
```

Returns: score (0-100), tier, confidence, recommendation.

Thread ↓

**Tweet 2:**
How it works:

- Indexes every USDC transfer on Base in real-time
- Scores wallets across 5 dimensions (payment reliability, economic viability, identity, behavior, capability)
- Runs 12 sybil/gaming checks
- Adaptive weights learn from outcome data

**Tweet 3:**
Built for agent devs on Base who need to answer one question:

"Should my agent send money to this wallet?"

Works with AgentKit, Eliza, x402, or any framework that transacts on Base.

Free: 10 calls/day
Paid: x402 micropayments ($0.10 for full score)

**Tweet 4:**
Open source, MIT licensed. Hono + SQLite + viem on Fly.io.

Repo: github.com/jacobsd32-cpu/djdagentscore
Docs: djdagentscore.dev/docs
Discovery: djdagentscore.dev/.well-known/x402

Feedback welcome. Especially from anyone building agents that move money on Base.

---

## 5. Dev.to Article (short version)

**Title:** How to Check a Wallet's Reputation Before Your AI Agent Sends Money

**Tags:** #x402 #base #aiagents #web3

**Body:** (Keep it practical, code-heavy)

If you're building an AI agent that transacts on Base, you have a problem: how do you know if the wallet you're about to send USDC to is trustworthy?

DJD Agent Score is a free API that answers this. Score any wallet on Base in one GET request, based on its real on-chain transaction history.

### Quick start

```bash
curl "https://djdagentscore.dev/v1/score/basic?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
```

Returns:
```json
{
  "score": 68,
  "tier": "Established",
  "confidence": 0.49,
  "recommendation": "proceed_with_caution"
}
```

### Add it to your agent in 5 lines

```typescript
async function shouldTrust(wallet: string): Promise<boolean> {
  const res = await fetch(
    `https://djdagentscore.dev/v1/score/basic?wallet=${wallet}`
  );
  const { score, confidence } = await res.json();
  return score >= 50 && confidence >= 0.3;
}

// Before sending money
if (!(await shouldTrust(recipientWallet))) {
  console.log("Low reputation wallet — declining transaction");
  return;
}
```

### What the score is based on

The scoring engine indexes every USDC transfer on Base and evaluates wallets across 5 dimensions:

- **Payment Reliability** (30%) — Transaction history and consistency
- **Economic Viability** (25%) — Financial health signals
- **Identity** (20%) — Verifiable markers (Basename, GitHub, registration)
- **Behavior** (15%) — Transaction timing patterns, anomaly detection
- **Capability** (10%) — Service delivery and ecosystem participation

Plus 12 sybil/gaming detection checks: closed-loop trading, wash trading, velocity spikes, balance window dressing, and more.

### Pricing

Free tier: 10 calls/day, no signup, no API key.

Paid tier uses x402 micropayments (USDC on Base):
- Full score: $0.10
- Force refresh: $0.25
- Batch (20 wallets): $0.50

### Links

- [Live API](https://djdagentscore.dev)
- [API Docs](https://djdagentscore.dev/docs)
- [GitHub](https://github.com/jacobsd32-cpu/djdagentscore)
- [OpenAPI Spec](https://djdagentscore.dev/openapi.json)

Open source, MIT licensed. Feedback welcome.
