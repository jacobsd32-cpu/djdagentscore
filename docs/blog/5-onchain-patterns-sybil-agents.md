# 5 On-Chain Patterns That Reveal Sybil Agents

*How DJD Agent Score uses on-chain behavioral forensics to separate real AI agents from manufactured identities — and why this matters for the x402 economy.*

---

The AI agent economy has a trust problem.

As autonomous agents begin transacting via protocols like x402, every participant needs to answer a fundamental question: *is this agent real, or is it a manufactured identity designed to game the system?*

Sybil attacks — where a single operator creates many fake identities to accumulate disproportionate influence, rewards, or reputation — are the oldest trick in decentralized systems. But agents make sybils *cheaper* to create and *harder* to detect than ever before.

At DJD Agent Score, we analyze on-chain transaction patterns to assign reputation scores to AI agent wallets. In the process, we've identified five distinct behavioral signatures that reliably expose sybil agents — even when their operators try to disguise them.

Here's what we look for.

---

## Pattern 1: Tight Cluster Rings

**The signal:** A wallet's top transaction partners all transact heavily with *each other*.

Legitimate agents interact with diverse counterparties — they serve different customers, use different protocols, and accumulate relationships organically. Sybil agents, by contrast, exist in a manufactured ecosystem. Their operator controls all the wallets, so the "agents" inevitably transact within a tight, interconnected group.

**How we detect it:** We build a relationship graph from on-chain transfers and check whether a wallet's top 5 partners share significant mutual connections. When more than 50% of those partners are interconnected, the `tight_cluster` indicator fires.

**Why it works:** Creating the *appearance* of diverse relationships is expensive. An operator would need to maintain dozens of active wallets with independent transaction histories — and the more wallets they add, the more likely they are to trigger other detection patterns.

**Real-world analog:** In traditional finance, this is similar to how investigators identify shell company networks — entities that only transact with each other are likely under common control.

---

## Pattern 2: Symmetric Round-Trips

**The signal:** More than 50% of a wallet's partnerships show nearly equal volume in both directions.

Real economic activity is messy. An agent that provides a service collects payments; an agent that consumes a service pays fees. The flow of value is inherently asymmetric. But when an operator is simply moving funds between controlled wallets to manufacture volume, the amounts going A→B and B→A tend to be suspiciously similar.

**How we detect it:** For each wallet pair in the relationship graph, we compare bidirectional volume. When the smaller direction is within 10% of the larger direction, we flag it as symmetric. If more than half of a wallet's partnerships exhibit this pattern, the `symmetric_transactions` indicator fires.

**Why it works:** Maintaining asymmetry across many wallet pairs requires careful orchestration. Most operators take the simpler path of sending round numbers back and forth, which leaves a clear statistical footprint.

**The wash trading variant:** We also detect explicit wash trading — when more than 40% of a wallet's 7-day volume consists of round-trips (A→B then B→A within 24 hours). This is the most aggressive form of volume inflation and carries the heaviest penalty in our scoring model.

---

## Pattern 3: Coordinated Creation Windows

**The signal:** A wallet and its primary transaction partner were both first seen on-chain within the same 24-hour window.

This one is deceptively simple but remarkably effective. Organic relationships develop over time — an agent discovers a service, begins transacting with it, and gradually builds a history. Sybil wallets are deployed in batches. The operator creates 10 wallets on Tuesday, funds them all from the same source, and starts manufacturing activity between them.

**How we detect it:** We compare the `first_seen` timestamps of a wallet and its highest-volume partner. If both appeared within 24 hours of each other *and* are now primary transaction partners, the `coordinated_creation` indicator fires.

**Why it works:** Timing is the hardest thing to fake retroactively. Once a wallet's creation timestamp is on-chain, it's permanent. Operators can sophisticate their transaction patterns, but they can't change when their wallets first appeared.

**Compounding signal:** This pattern becomes especially powerful when combined with the funding chain pattern (Pattern 4). A wallet that was created simultaneously with its top partner *and* funded by that same partner is almost certainly a puppet.

---

## Pattern 4: Puppet Funding Chains

**The signal:** A wallet's earliest funding source is also its highest-volume transaction partner.

Every wallet needs to be funded before it can transact. For legitimate agents, the funding source is usually an exchange, a bridge, or a treasury — a neutral infrastructure entity. For sybil agents, funding comes from the operator's main wallet, which is also the entity they'll be "transacting" with to manufacture reputation.

**How we detect it:** We trace back to a wallet's very first inbound transfer and compare that funding source to the wallet's top partner by volume. When they match, the `funded_by_top_partner` indicator fires. This is one of our highest-confidence signals — it simultaneously caps both the Identity and Reliability dimension scores.

**Why it works:** This pattern exploits a fundamental constraint of sybil operations: the operator must fund their puppet wallets *from somewhere*. Using the same wallet for funding and transaction generation creates an indelible connection that's visible in the on-chain record.

**The economic insight:** Real agents have independence. Their funding and their revenue come from different sources, because they provide genuine value to third parties. Puppet agents have dependence — their "revenue" comes from the same entity that created them.

---

## Pattern 5: Bot-Like Temporal Signatures

**The signal:** Transactions arrive at metronomically regular intervals, concentrated in a narrow time window.

This pattern doesn't analyze *who* a wallet transacts with, but *when*. Human-directed agents show natural variability — transactions cluster around business hours, include weekend gaps, and have irregular spacing. Automated sybil operations run on scripts with fixed intervals, producing transactions with unnaturally low variance in their timing.

**How we detect it:** We compute three statistical measures across a wallet's transaction history:

- **Inter-arrival coefficient of variation (CV):** How variable are the gaps between consecutive transactions? A CV below 0.1 indicates machine-like regularity.
- **Hourly entropy:** How evenly distributed are transactions across hours of the day? Low entropy means activity is concentrated in a few hours (or perfectly spread, which is also suspicious).
- **Maximum gap:** What's the longest pause between transactions? Genuine agents have downtime — days without activity. Sybil scripts run continuously.

Wallets scoring below 25 on the behavior dimension are classified as `suspicious`, indicating strong bot-like temporal patterns.

**Why it works:** Timing patterns are an emergent property of genuine usage that's expensive to simulate. An operator *can* add random delays and vary their schedule, but doing so across many sybil wallets while still generating enough volume to build reputation requires significant engineering effort — effort that undermines the economic advantage of sybil attacks in the first place.

---

## How These Patterns Compound

No single pattern is conclusive on its own. A wallet with a symmetric trading relationship might simply have a legitimate reciprocal business arrangement. A wallet created at the same time as a partner might be a coincidence.

The power of behavioral forensics lies in *pattern stacking*. DJD Agent Score applies each detected pattern as a multiplicative penalty — what we call the **integrity multiplier**. A wallet flagged for tight clustering (0.55x), symmetric transactions (0.60x), and wash trading (0.50x) receives a combined multiplier of:

```
0.55 × 0.60 × 0.50 = 0.165x
```

That's an 83.5% reduction in composite score. The final score is floored at a 0.10x multiplier — we never completely zero a score, because even our highest-confidence signals carry some false positive risk.

This multiplicative approach creates a sharp separation between legitimate agents (multiplier near 1.0x) and sybils (multiplier below 0.30x), making the system robust even when individual signals are noisy.

---

## Why This Matters for the Agent Economy

As AI agents begin operating autonomously in the x402 ecosystem — paying for services, earning revenue, building reputation — the ability to distinguish real agents from manufactured ones becomes critical infrastructure.

Consider the use cases:

- **Service providers** need to know if a client agent is trustworthy before extending credit or prioritizing service.
- **Protocols** need to prevent sybil agents from accumulating governance influence or farming rewards.
- **Marketplaces** need to surface quality agents and suppress fake ones.

With DJD Agent Score now publishing reputation data to the on-chain ERC-8004 Reputation Registry, these signals are available as public infrastructure. Any protocol on Base can call `getSummary()` to check an agent's reputation before interacting with it — no API key required, no centralized dependency.

---

## Building in Public

DJD Agent Score is open about its detection methodology because we believe transparency makes the system stronger. Operators who read this post and adapt their behavior will need to invest more resources to maintain sybil operations — resources that could be spent on building legitimate services instead.

The five patterns described here are the foundation. Our scoring model continues to evolve as we observe new attack vectors, and every score we publish carries a `model_version` tag so consumers can track which version of the detection logic produced a given rating.

Want to check your agent's score? Query the API at `agentscore.ai`, paid via x402 micropayments. Want to verify a score on-chain? Read from the ERC-8004 Reputation Registry at `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` on Base.

The agent economy needs trust infrastructure. We're building it.

---

*DJD Agent Score is a reputation scoring engine for autonomous AI agents. Scores are paid via x402 micropayments and published to the ERC-8004 Reputation Registry on Base mainnet.*
