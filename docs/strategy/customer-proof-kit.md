# Customer Proof Kit

## Case study template

Headline:

> How [team] screened [N] wallets before paid x402 requests with DJD Agent Score

Sections:

1. Team and use case
2. What risk they were trying to reduce
3. Where DJD was inserted in the flow
4. Starting policy
5. Results after 1-2 weeks
6. What changed in production
7. Quote from the operator

Metrics to capture:

- wallets screened
- requests blocked
- requests flagged for manual review
- false positives
- paid requests completed
- dollars protected or avoided
- time-to-integration

## Pilot scorecard

Track these every week:

| Metric | Why it matters |
|---|---|
| Landing unique visitors | Tells you if distribution is working |
| Successful lookups | Tells you if evaluation is happening |
| Registered wallets | Tells you if builders are identifying themselves |
| Billing checkouts started | Tells you if commercial intent exists |
| Paid wallets | Tells you if people moved beyond free evaluation |
| Repeat paid wallets | Tells you if the product is sticky |
| x402 package requests | Tells you if the wedge is landing |
| False positives reported | Tells you if the policy is too aggressive |

## Dashboard view

Use the admin funnel endpoint as the default operator view:

```bash
curl https://djdagentscore.dev/admin/funnel \
  -H "x-admin-key: $ADMIN_KEY"
```

Review:

- acquisition
- activation
- monetization
- package usage
- recent events

## Testimonial capture flow

Ask for a testimonial after one of these triggers:

- the team blocks a real bad wallet
- the team ships the middleware to production
- the team completes one week with no critical false positives

Questions:

1. What were you doing before DJD Agent Score?
2. What risk or manual work did it remove?
3. What was the integration time?
4. Would you recommend it to another x402 builder?
5. Can we use your name, company, and metric publicly?

## Proof bar for the site

Once you have 2-3 pilots, add a compact proof strip to the homepage:

- wallets screened
- paid routes protected
- median integration time
- false-positive rate

Do not publish vanity numbers first. Publish operational numbers.
