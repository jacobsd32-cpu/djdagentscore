# Mirror.xyz Publication

**URL:** https://mirror.xyz (requires wallet connection to publish)

## Title
5 On-Chain Patterns That Reveal Sybil Agents

## Content

*How DJD Agent Score uses on-chain behavioral forensics to separate real AI agents from manufactured identities — and why this matters for the x402 economy.*

---

The AI agent economy has a trust problem.

As autonomous agents begin transacting via protocols like x402, every participant needs to answer a fundamental question: is this agent real, or is it a manufactured identity designed to game the system?

Sybil attacks — where a single operator creates many fake identities to accumulate disproportionate influence — are the oldest trick in decentralized systems. But agents make sybils cheaper to create and harder to detect than ever before.

At DJD Agent Score, we analyze on-chain transaction patterns to assign reputation scores to AI agent wallets. We've identified five distinct behavioral signatures that reliably expose sybil agents.

---

### Pattern 1: Tight Cluster Rings

A wallet's top transaction partners all transact heavily with each other.

Legitimate agents interact with diverse counterparties. Sybil agents exist in a manufactured ecosystem. We build a relationship graph and flag when >50% of top partners are interconnected — like identifying shell company networks in traditional finance.

### Pattern 2: Symmetric Round-Trips

More than 50% of partnerships show nearly equal volume in both directions.

Real economic activity is asymmetric. Providers collect; consumers pay. When an operator moves funds between controlled wallets, amounts A→B and B→A are suspiciously similar. We also flag wash trading — round-trips within 24 hours.

### Pattern 3: Coordinated Creation Windows

A wallet and its primary partner were both first seen within 24 hours.

Organic relationships develop over time. Sybil wallets are deployed in batches. Timing is the hardest thing to fake retroactively — creation timestamps are permanent on-chain.

### Pattern 4: Puppet Funding Chains

A wallet's earliest funding source is also its highest-volume transaction partner.

Real agents are funded by exchanges and bridges. Puppet agents are funded by the operator — the same entity they "transact" with to build fake reputation. This is our highest-confidence signal.

### Pattern 5: Bot-Like Temporal Signatures

Transactions arrive at metronomically regular intervals.

We measure inter-arrival coefficient of variation, hourly entropy, and maximum gaps. Human-directed agents have natural variability and downtime. Sybil scripts run continuously with machine-like regularity.

---

### Pattern Stacking

No single pattern is conclusive. The power lies in stacking. Each detected pattern applies a multiplicative penalty:

`0.55 × 0.60 × 0.50 = 0.165x` — an 83.5% score reduction.

Sharp separation between legitimate agents (~1.0x multiplier) and sybils (<0.30x).

---

### On-Chain Infrastructure

Scores are published to the **ERC-8004 Reputation Registry** on Base mainnet at `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`. Any protocol can call `getSummary()` to check an agent's reputation before interacting — no API key required, no centralized dependency.

We publish our methodology openly because transparency makes the system stronger. Operators who read this and adapt will need to invest more resources to maintain sybils — resources that could be spent building legitimate services instead.

The agent economy needs trust infrastructure. We're building it.

---

*DJD Agent Score is a reputation scoring engine for autonomous AI agents. Scores are paid via x402 micropayments and published to the ERC-8004 Reputation Registry on Base mainnet.*

## Publishing Notes
- Mirror.xyz requires connecting your Ethereum wallet
- Navigate to mirror.xyz → Connect wallet → New entry
- Paste the content above
- Mirror supports markdown natively
- Consider minting as an NFT for permanent on-chain record
