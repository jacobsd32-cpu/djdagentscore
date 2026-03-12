# DJD Agent Score Demo Script

## Goal

Show one clear before/after:

- before: any wallet can hit the paid route
- after: low-trust wallets are blocked before work starts

## Demo setup

1. Open the homepage lookup on `https://djdagentscore.dev/#lookup`
2. Open the reference example in `examples/x402-hono.ts`
3. Have one high-score wallet and one low-score wallet ready

## Script

### Step 1: name the problem

Say:

> I run a paid x402 route. A wallet I have never seen can hit it and make my app do work. I want one policy check before that happens.

### Step 2: show the free lookup

Run:

```bash
curl "https://djdagentscore.dev/v1/score/basic?wallet=0xHIGH_SCORE_WALLET"
curl "https://djdagentscore.dev/v1/score/basic?wallet=0xLOW_SCORE_WALLET"
```

Call out:

- score
- tier
- confidence
- recommendation

### Step 3: show the middleware

Open this snippet:

```ts
app.use(
  '/premium/*',
  agentScoreGate({
    minScore: 60,
    onUnknown: 'reject',
  }),
)
```

Say:

> This is the whole wedge. The route keeps its existing business logic. DJD decides whether the payer wallet is good enough to enter the route.

### Step 4: show the outcome

Call the protected route with:

- a wallet that passes
- a wallet that fails

Point to the decision headers:

- `X-Agent-Score`
- `X-Agent-Tier`
- `X-Agent-Recommendation`

### Step 5: close with rollout advice

Say:

> The safe rollout is headers-only first, then reject low-trust wallets once you have a week of traffic and false-positive review.

## Demo close

End on this ask:

> If you run a paid x402 route, I want to help you wire this in and pick an initial threshold that is conservative enough for a pilot.
