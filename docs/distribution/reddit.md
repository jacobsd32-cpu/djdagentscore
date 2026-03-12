# Reddit Distribution Plan

## Target Subreddits

### r/ethereum (1.8M members)
**Title:** We built a sybil detection engine for AI agent wallets — here are the 5 on-chain patterns we use
**Body:**
As AI agents start transacting autonomously on-chain (via protocols like x402), sybil attacks become cheaper to execute and harder to detect.

We built DJD Agent Score — a reputation scoring engine that analyzes on-chain transaction patterns to separate real AI agents from manufactured identities. Scores get published to the ERC-8004 Reputation Registry on Base so any protocol can check an agent's reputation with a single contract call.

Here are the 5 behavioral signatures we look for:

1. **Tight Cluster Rings** — top partners all transact with each other (shell company network detection)
2. **Symmetric Round-Trips** — equal volume in both directions between wallet pairs (wash trading signal)
3. **Coordinated Creation Windows** — wallet and its top partner appeared within 24 hours of each other
4. **Puppet Funding Chains** — earliest funding source = highest-volume partner (highest-confidence signal)
5. **Bot-Like Temporal Signatures** — metronomically regular transaction intervals

Each pattern applies a multiplicative penalty. Stack them and sybils get 80%+ score reductions.

Full writeup with detection methodology: https://djdagentscore.dev/blog/sybil-patterns

On-chain registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` on Base

Happy to answer questions about the detection logic.

**Flair:** Technology

---

### r/artificial (750K members)
**Title:** 5 on-chain patterns that expose fake AI agent identities — behavioral forensics for the agent economy
**Body:**
As autonomous AI agents start operating with real wallets and real money, a new problem emerges: how do you tell a legitimate agent from a manufactured identity?

We've been building a reputation scoring engine for AI agent wallets (DJD Agent Score). In the process, we identified 5 distinct transaction patterns that reliably expose sybil agents — fake identities created by a single operator to game the system.

The patterns range from graph analysis (do a wallet's partners all transact with each other?) to temporal forensics (are transactions arriving at suspiciously regular intervals?) to funding chain analysis (was this wallet funded by the same entity it primarily transacts with?).

The interesting part is how they compound. Each detected pattern applies a multiplicative penalty. A wallet flagged for 3 patterns might see an 83% score reduction.

Full methodology: https://djdagentscore.dev/blog/sybil-patterns

Curious what other approaches people are thinking about for agent identity verification.

---

### r/cryptocurrency (7.5M members)
**Title:** Built a sybil detection system for AI agent wallets — 5 on-chain behavioral patterns that catch fakes
**Body:**
Sybil attacks are the oldest problem in decentralized systems, but AI agents make them way cheaper. An operator can spin up 50 agent wallets and manufacture transaction volume between them to build fake reputation.

We built DJD Agent Score to solve this. It analyzes on-chain transaction patterns and assigns reputation scores to AI agent wallets. The 5 main detection patterns:

1. Tight clusters — wallet's partners all trade with each other
2. Symmetric flows — equal amounts going both directions (wash trading)
3. Batch creation — wallet and its top partner appeared at the same time
4. Puppet funding — funded by the same wallet it "trades" with
5. Bot timing — perfectly regular transaction intervals

Scores are published on-chain via the ERC-8004 Reputation Registry on Base. Any dApp can check an agent's reputation before interacting.

Full technical breakdown: https://djdagentscore.dev/blog/sybil-patterns

Registry contract: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
