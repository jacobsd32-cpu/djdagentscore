# DJD Agent Score — Pilot Integration Guide

**Audience:** x402-enabled agent frameworks and wallet providers onboarding as design partners.
**API Base:** `https://djdagentscore.dev`
**Version:** v1 (March 2026)

---

## Part 1: Auth Setup

### Requesting a Pilot API Key

Contact Drew Jacobs (`drewjacobs32@gmail.com`) to receive a pilot API key. Keys are issued per agent or service and have the format:

```
djd_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Using Your API Key

Pass the key as a Bearer token on every request:

```http
Authorization: Bearer djd_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Without an API key**, requests fall through to x402 micropayment auth. Paid endpoints charge a small per-call fee via the x402 protocol (your agent needs a funded Base L2 wallet). During the pilot, API key auth bypasses x402 and usage is tracked against your monthly quota.

### Rate Limits

Responses include usage headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 2026-04-01T00:00:00.000Z
```

Quota resets monthly. Contact us to raise limits during your pilot.

### Registering Your Agent (Recommended)

Register your agent's wallet to improve scoring accuracy and unlock identity-linked evidence:

```http
POST /v1/agent/register
Authorization: Bearer djd_live_...
Content-Type: application/json

{
  "wallet": "0xYourAgentWallet",
  "name": "My Agent v1",
  "description": "An x402-enabled autonomous agent",
  "website_url": "https://your-project.dev"
}
```

**Response:**

```json
{
  "wallet": "0xYourAgentWallet",
  "name": "My Agent v1",
  "registered": true,
  "registered_at": "2026-03-17T10:00:00.000Z"
}
```

Registration is free and improves the quality of evaluator decisions over time.

---

## Part 2: Calling the Evaluator

The evaluator answers one question before every x402 transaction: **"Should I trust this counterparty enough to proceed?"**

### Endpoint

```
GET /v1/score/evaluator?wallet={counterpartyWallet}
Authorization: Bearer djd_live_...
```

Replace `{counterpartyWallet}` with the wallet address of the agent or party you are about to transact with.

### Request Example

```http
GET /v1/score/evaluator?wallet=0xAbCd1234...
Authorization: Bearer djd_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Response Example

```json
{
  "standard": "erc-8183-evaluator-prototype",
  "wallet": "0xabcd1234...",
  "decision": "approve",
  "confidence": 0.84,
  "rationale": "Wallet has a strong transaction history, no active fraud reports, and a verified identity profile.",
  "score": {
    "current_score": 78,
    "current_tier": "established",
    "score_confidence": 0.84,
    "score_recommendation": "transact",
    "score_model_version": "2.0.0",
    "last_scored_at": "2026-03-17T08:45:00.000Z"
  },
  "checks": [
    { "key": "score_threshold", "label": "Score threshold", "status": "pass", "details": {} },
    { "key": "fraud_reports", "label": "Fraud reports", "status": "pass", "details": { "count": 0 } },
    { "key": "blacklist", "label": "Blacklist check", "status": "pass", "details": {} },
    { "key": "identity", "label": "Identity verification", "status": "pass", "details": { "registered": true } }
  ],
  "risk": {
    "risk_level": "low",
    "flags": []
  },
  "certification": {
    "active": false,
    "tier": null
  },
  "links": {
    "full_score": "https://djdagentscore.dev/v1/score/full?wallet=0xabcd1234...",
    "evidence_packet": "https://djdagentscore.dev/v1/score/evaluator/evidence?wallet=0xabcd1234...",
    "forensics_summary": "https://djdagentscore.dev/v1/score/risk?wallet=0xabcd1234..."
  }
}
```

### Decision Values

| `decision` | Meaning | Recommended action |
|---|---|---|
| `approve` | Wallet passes all trust checks | Proceed with transaction |
| `review` | Mixed signals; not clearly safe or unsafe | Queue for human review before proceeding |
| `reject` | Wallet fails one or more trust checks | Abort transaction; log the decision |

---

## Part 3: Handling Decisions

### Integration Pattern

Add an evaluator call to your transaction pre-flight:

```typescript
async function shouldTransact(counterpartyWallet: string): Promise<boolean> {
  const res = await fetch(
    `https://djdagentscore.dev/v1/score/evaluator?wallet=${counterpartyWallet}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.DJD_API_KEY}`,
      },
    }
  )

  if (!res.ok) {
    // On API error, fall back to your default policy (allow or deny)
    console.error('DJD evaluator error', res.status)
    return false // conservative fallback
  }

  const result = await res.json()

  switch (result.decision) {
    case 'approve':
      return true

    case 'review':
      await queueForHumanReview(counterpartyWallet, result)
      return false // block until human clears

    case 'reject':
      await logRejection(counterpartyWallet, result.rationale)
      return false

    default:
      return false
  }
}
```

### Handling the `review` Case

When `decision` is `review`, do not silently allow or deny — route to a human. Log the full result for your operator's review queue:

```typescript
async function queueForHumanReview(wallet: string, evaluation: any) {
  await yourReviewQueue.push({
    wallet,
    decision: evaluation.decision,
    confidence: evaluation.confidence,
    rationale: evaluation.rationale,
    checks: evaluation.checks,
    evidence_url: evaluation.links.evidence_packet,
    queued_at: new Date().toISOString(),
  })
}
```

### Error Handling

| HTTP Status | Meaning | Action |
|---|---|---|
| `400` | Invalid wallet address | Fix request; log error |
| `402` | Payment required (no API key / quota exceeded) | Check API key or contact DJD |
| `404` | Wallet has no score data yet | Treat as `review` by default |
| `429` | Rate limit exceeded | Back off and retry after `X-RateLimit-Reset` |
| `5xx` | Server error | Fail open or closed per your policy; retry with backoff |

---

## Part 4: Retrieving Evidence Bundles

Every evaluator call can be paired with a full evidence packet — a structured record of exactly why a decision was made, suitable for audit, dispute, or export.

### Endpoint

```
GET /v1/score/evaluator/evidence?wallet={wallet}
Authorization: Bearer djd_live_...
```

### Response Structure

```json
{
  "standard": "erc-8183-evaluator-evidence-prototype",
  "packet_id": "evidence_7f3a4d1c93a2bc10",
  "wallet": "0xabcd1234...",
  "generated_at": "2026-03-17T10:01:00.000Z",
  "decision": "approve",
  "confidence": 0.84,
  "packet_hash": "sha256:a1b2c3d4...",
  "baseline_profile": "djd-transactional-settlement-v1",
  "checks": [...],
  "recent_reports": [],
  "report_count": 0,
  "open_disputes": 0,
  "artifacts": [
    {
      "key": "full_score",
      "label": "Full score breakdown",
      "category": "score",
      "status": "included",
      "href": "https://djdagentscore.dev/v1/score/full?wallet=0xabcd1234...",
      "summary": "Current score 78/100 with 84% confidence."
    },
    {
      "key": "certification_status",
      "label": "Certification status",
      "category": "certification",
      "status": "recommended",
      "href": "https://djdagentscore.dev/v1/certification?wallet=0xabcd1234...",
      "summary": "No active certification on file; Transactional Settlement certification is the preferred baseline."
    },
    {
      "key": "forensics_summary",
      "label": "Forensics summary",
      "category": "forensics",
      "status": "included",
      "href": "https://djdagentscore.dev/v1/score/risk?wallet=0xabcd1234...",
      "summary": "0 reports, 0 open disputes, risk level low."
    }
  ]
}
```

### When to Fetch Evidence

- **Always** for `reject` decisions — log the bundle ID as immutable proof of why the transaction was blocked.
- **Always** for `review` decisions — attach to the human review queue item.
- **Selectively** for `approve` decisions — fetch and store when the transaction value exceeds your risk threshold.

### Content-Addressed IDs

The `packet_id` and `packet_hash` uniquely identify this evidence snapshot. Store them with your transaction record. If a dispute arises, you can reference the bundle to demonstrate the trust evaluation that was in effect at transaction time.

---

## Quick Reference

| Endpoint | Method | Auth | Cost |
|---|---|---|---|
| `GET /v1/score/basic?wallet=` | GET | API key or x402 | Free |
| `GET /v1/score/evaluator?wallet=` | GET | API key or x402 | $0.35 |
| `GET /v1/score/evaluator/evidence?wallet=` | GET | API key or x402 | $0.45 |
| `GET /v1/score/risk?wallet=` | GET | API key or x402 | $0.50 |
| `POST /v1/agent/register` | POST | API key | Free |
| `GET /health` | GET | None | Free |

**Pilot keys bypass per-call charges** — you pay nothing during the pilot period.

---

## Getting Help

- **Email:** drewjacobs32@gmail.com
- **Docs:** https://djdagentscore.dev/docs
- **Status / Health:** `GET https://djdagentscore.dev/health`

During the pilot, response times for support questions are same-day. If you hit an edge case, the evaluator returns `review` by default — you will never get a silent failure.
