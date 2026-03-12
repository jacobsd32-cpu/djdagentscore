# DJD Agent Score x402 Launch Kit

## Positioning

Primary wedge:

> Prevent bad payer wallets from hitting your paid x402 route in one middleware call.

What we should say:

- Screen Base wallets before your app does work.
- Start with free lookups, then gate paid x402 routes.
- Use one middleware instead of building custom wallet policy from scratch.

What we should not lead with:

- Generic "reputation for all AI agents"
- Abstract model theory before the outcome
- Broad trust/safety language without a workflow attached

## Launch message

Short version:

> DJD Agent Score gives you a trust score for Base wallets so you can block bad counterparties before money moves. If you run paid x402 endpoints, you can gate the payer in one middleware call.

## Homepage / docs CTAs

Use these three paths consistently:

1. Free lookup: `GET /v1/score/basic?wallet=0x...`
2. x402 gate: `npm i x402-agent-score`
3. Agent registration: `POST /v1/agent/register`

## X post

```text
If you run paid x402 routes, you probably need a wallet screening step before your handler does work.

I shipped DJD Agent Score to do exactly that:

- score any Base wallet in one API call
- free basic lookups
- x402 Hono middleware to block low-trust payers

Docs: https://djdagentscore.dev/docs
Package: https://www.npmjs.com/package/x402-agent-score
```

## LinkedIn post

```text
We packaged DJD Agent Score around one concrete use case: screening payer wallets before a paid x402 route runs.

Instead of asking teams to adopt a generic "agent reputation layer," the product now starts with a narrow operational outcome:

- check the wallet
- reject or flag low-trust payers
- keep the rest of the route unchanged

There is a free lookup path for evaluation, an x402 middleware package for Hono, and a registration endpoint for agents that want a richer profile.

Docs: https://djdagentscore.dev/docs
```

## Community post angle

Headline options:

- Add wallet trust checks to your x402 route in one middleware call
- We built a Base wallet screening layer for paid agent endpoints
- Screen counterparties before your agent sends funds

Body outline:

1. Name the failure mode: unknown wallet asks for paid work or receives payment.
2. Show the smallest integration: `npm i x402-agent-score`.
3. Show the fallback/free test: `GET /v1/score/basic`.
4. Ask for design partners running paid Hono/x402 routes.

## Call to action

Always end with one of:

- "Reply if you run paid x402 routes and want to test this."
- "Email feedback@djdagentscore.dev if you want help choosing an initial threshold."
- "Start with the reference example: examples/x402-hono.ts."
