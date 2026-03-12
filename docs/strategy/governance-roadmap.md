# Governance Roadmap

This is the practical version of the broader DJD governance thesis.

## Positioning

DJD should be positioned as **the governance layer for paid agent commerce**, not just as a generic wallet reputation API.

That does **not** mean every governance idea belongs in `main` right now.

The current product is strongest when it is sold around one concrete workflow:

- screen a wallet before sending funds
- gate a paid x402 route before work starts
- capture evidence after a bad interaction

That is a real wedge with a real user and a copy-paste integration path.

## What The Shipped Product Can Honestly Claim Today

The current system already covers more than "a score":

- **Before**: wallet scoring, x402 route gating, identity metadata, certification status
- **During**: monitoring subscriptions, webhooks, policy thresholds, query logging
- **After**: counterparty ratings, fraud reports, disputes, and DJD Forensics feeds/timelines

So the right public story is:

> DJD starts as the trust gate for paid agent interactions and grows into the governance layer around them.

## Now

These should stay on the main product path and get sold immediately:

- `x402-agent-score` middleware for Hono routes
- free wallet screening before payouts or assignments
- certification as a trust signal for providers
- monitoring and webhook policies for active wallets
- forensics and ratings as the post-incident evidence layer

Success metric:

- teams using DJD before a paid route or payout runs

## Next

These fit the governance thesis, but they are phase-two surfaces and should stay disciplined:

- `risk` views that translate raw trust signals into allow / monitor / review / block actions
- `cluster` intelligence that explains whether a wallet sits inside a sybil ring, fraud hotspot, or broker hub
- a trusted-provider or trusted-endpoint directory for agent buyers
- an MCP "trust compass" that helps agents choose who to pay

These are promising because they move DJD from "score lookup" toward "governance decision support."

They should come into `main` only when:

- the output is easy to explain
- the output supports a real operator decision
- at least one design partner will use it

## Later

These are part of the long-term governance stack, but they should not drive the current product surface:

- escrow evaluator / oracle services
- ERC-8004 and adjacent standards positioning
- cross-platform governance beyond the current Base/x402 wedge
- insurance or claims-style products
- protocol RFC authorship as a moat strategy

Those may become important. They are not the fastest path to adoption.

## Branch Policy

Use this rule:

- `main` should contain features that help someone adopt DJD in the next 30 days
- exploratory governance intelligence belongs in a parallel branch until it proves a clear user decision

Applied to the current parallel work:

- **ratings** belonged in `main` because they add a concrete post-incident signal
- **risk** and **cluster** look like good phase-two candidates, but they are still interpretation layers and should stay separate until the product story is tighter

## Product Sentence

If someone asks what DJD is, the answer should be:

> DJD is the governance layer for paid agent commerce on Base. Start by screening wallets before an x402 request runs, then add monitoring, ratings, and forensics as you need more accountability.
