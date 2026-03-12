---
title: "5 On-Chain Patterns That Reveal Sybil Agents"
published: true
description: "How behavioral forensics on transaction data separates real AI agents from manufactured identities in the x402 economy."
tags: blockchain, ai, security, web3
canonical_url: https://djdagentscore.dev/blog/sybil-patterns
cover_image:
---

The AI agent economy has a trust problem.

As autonomous agents begin transacting via protocols like x402, every participant needs to answer a fundamental question: is this agent real, or is it a manufactured identity designed to game the system?

At [DJD Agent Score](https://djdagentscore.dev), we analyze on-chain transaction patterns to assign reputation scores to AI agent wallets. We've identified five behavioral signatures that reliably expose sybil agents — even when operators try to disguise them.

## Pattern 1: Tight Cluster Rings

**The signal:** A wallet's top transaction partners all transact heavily with each other.

Legitimate agents interact with diverse counterparties. Sybil agents exist in a manufactured ecosystem where the operator controls all wallets. We build a relationship graph and check whether a wallet's top 5 partners share significant mutual connections. When more than 50% are interconnected, the `tight_cluster` indicator fires.

Think shell company networks in traditional finance — entities that only transact with each other are likely under common control.

## Pattern 2: Symmetric Round-Trips

**The signal:** More than 50% of partnerships show nearly equal volume in both directions.

Real economic activity is asymmetric. Providers collect payments; consumers pay fees. When an operator moves funds between controlled wallets, the amounts going A→B and B→A are suspiciously similar.

```
// Detection logic
for each wallet pair:
  ratio = min(volume_AB, volume_BA) / max(volume_AB, volume_BA)
  if ratio > 0.90:  // within 10%
    flag as symmetric
```

We also detect explicit wash trading — when >40% of a wallet's 7-day volume consists of round-trips (A→B then B→A within 24 hours).

## Pattern 3: Coordinated Creation Windows

**The signal:** A wallet and its primary partner were both first seen within 24 hours.

Organic relationships develop over time. Sybil wallets are deployed in batches. Creation timestamps are permanent on-chain — operators can sophisticate their transaction patterns, but they can't change when their wallets first appeared.

This becomes especially powerful combined with Pattern 4: a wallet created simultaneously with its top partner AND funded by that same partner is almost certainly a puppet.

## Pattern 4: Puppet Funding Chains

**The signal:** A wallet's earliest funding source is also its highest-volume transaction partner.

Every wallet needs initial funding. Legitimate agents are funded by exchanges, bridges, or treasuries. Sybil agents are funded by the operator — the same entity they'll "transact" with to manufacture reputation.

```
first_funder = trace_first_inbound_transfer(wallet)
top_partner  = get_highest_volume_partner(wallet)

if first_funder == top_partner:
  fire("funded_by_top_partner")  // highest-confidence signal
```

This is our highest-confidence signal. Real agents have independence (funding ≠ revenue source). Puppet agents have dependence.

## Pattern 5: Bot-Like Temporal Signatures

**The signal:** Transactions arrive at metronomically regular intervals.

We compute three statistical measures:

| Metric | What it measures | Sybil threshold |
|--------|-----------------|-----------------|
| Inter-arrival CV | Gap variability between txs | < 0.1 |
| Hourly entropy | Distribution across hours | Low |
| Maximum gap | Longest pause between txs | None (continuous) |

Human-directed agents show natural variability. Sybil scripts run on fixed intervals with unnaturally low variance.

## How Patterns Compound

No single pattern is conclusive. The power is in **pattern stacking**. Each detected pattern applies a multiplicative penalty:

```
tight_cluster:  0.55x
symmetric_txs:  0.60x
wash_trading:   0.50x
────────────────────
combined:       0.55 × 0.60 × 0.50 = 0.165x  (83.5% reduction)
```

This creates sharp separation between legitimate agents (multiplier ~1.0x) and sybils (<0.30x).

## On-Chain Publication

Scores are published to the **ERC-8004 Reputation Registry** on Base mainnet. Any protocol can call `getSummary()` to check an agent's reputation — no API key, no centralized dependency.

```solidity
// On-chain verification
IReputationRegistry registry = IReputationRegistry(
  0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
);
ReputationSummary memory rep = registry.getSummary(agentId);
```

## Why Transparency?

We publish our detection methodology openly because it makes the system stronger. Operators who adapt need more resources to maintain sybils — resources better spent building real services.

---

*DJD Agent Score is a reputation scoring engine for autonomous AI agents. Scores are paid via x402 micropayments and published to the ERC-8004 Reputation Registry on Base mainnet.*

**Check your agent's score:** [djdagentscore.dev](https://djdagentscore.dev)
