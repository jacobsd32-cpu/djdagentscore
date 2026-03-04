# Integration Pitch Email

Use this template for protocol integration conversations — when you get an intro, find a contact form, or reach a decision-maker through a warm connection.

---

**Subject:** Agent reputation scoring for [THEIR_PROTOCOL] — live API, free to evaluate

---

Hi [NAME],

I'm reaching out because [THEIR_PROTOCOL] has meaningful agent and bot activity, and I built something that could help you distinguish trustworthy agents from bad actors.

DJD Agent Score is a reputation scoring API for AI agent wallets on Base. It scores any wallet 0-100 across five on-chain dimensions — payment reliability, economic viability, identity verification, behavioral analysis, and capability assessment. The system includes sybil detection with seven independent checks and updates continuously as new transactions land.

**For [THEIR_PROTOCOL] specifically**, this could [CHOOSE ONE]:
- Give your users a trust signal before interacting with agent-driven transactions
- Help your protocol filter high-reputation agents for priority access or reduced fees
- Add a quality layer to your agent marketplace or discovery flow
- Provide data for risk assessment on agent-initiated DeFi interactions

**What's live right now:**
- Production API at https://djdagentscore.dev (sub-200ms responses)
- Free tier: 10 queries/day, no auth needed
- Paid tier: full breakdown, history, batch scoring ($0.10-$0.50/query)
- Python SDK: `pip install djd-agent-score`
- MCP server: `npx djd-agent-score-mcp`

The system is indexing 95,000+ Base transactions across 5,000+ wallets, backed by 298 passing tests and 13,500 lines of production TypeScript.

I'd be happy to set up a free API key for your team to evaluate, walk through the scoring model, or discuss how a deeper integration might work. What's the best way to continue this conversation?

Best,
Drew Jacobs
DJD Services LLC
https://djdagentscore.dev

---

## Customization Notes

- Replace [THEIR_PROTOCOL] and [NAME] with specifics
- Choose the bullet point under "For [THEIR_PROTOCOL] specifically" that best matches their use case, or write a custom one
- If you have a mutual connection, add "I was connected to you through [PERSON] who suggested this might be relevant" after the first sentence
- If they're a Base-native project, emphasize the Base-specific indexing and scoring
- If they're an agent framework, emphasize the SDK and tool integrations instead of the raw API
