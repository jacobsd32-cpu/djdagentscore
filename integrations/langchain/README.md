# DJD AgentScore — LangChain Integration

LangChain tools for checking AI agent wallet reputation on Base L2. Use these to build trust-aware agents that verify counterparty wallets before transacting.

## Quick Start

```bash
pip install langchain langchain-core httpx
```

```python
from integrations.langchain.toolkit import AgentScoreToolkit

# Create toolkit (api_key optional — only needed for paid /full endpoint)
toolkit = AgentScoreToolkit(api_key="djd_live_...")
tools = toolkit.get_tools()

# Use with any LangChain agent
from langchain.agents import initialize_agent, AgentType
from langchain_openai import ChatOpenAI

agent = initialize_agent(
    tools,
    ChatOpenAI(model="gpt-4o-mini"),
    agent=AgentType.OPENAI_FUNCTIONS,
)

agent.run("Check the reputation of 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
```

## Tools

| Tool | Endpoint | Cost | Description |
|------|----------|------|-------------|
| `agent_score` | `GET /v1/score/basic` | Free | Quick score (0-100), tier, confidence |
| `agent_score_detail` | `GET /v1/score/full` | $0.10 | Full breakdown with dimensions, sybil flags, history |
| `agent_register` | `POST /v1/agent/register` | Free | Register wallet on the leaderboard |
| `agent_leaderboard` | `GET /v1/leaderboard` | Free | Top-ranked agents with scores and badges |

## Configuration

```python
toolkit = AgentScoreToolkit(
    api_key="djd_live_...",                       # For paid endpoints
    base_url="https://djdagentscore.dev",   # Default
    request_timeout=30.0,                         # Seconds
    include_paid=True,                            # Set False to exclude paid tools
)
```

## Get an API Key

API keys are available at [djdagentscore.dev/billing/plans](https://djdagentscore.dev/billing/plans):

| Plan | Price | Queries/month |
|------|-------|---------------|
| Starter | $29/mo | 1,000 |
| Growth | $79/mo | 5,000 |
| Scale | $199/mo | 25,000 |

## Use Case: Trust Gate

The most common pattern is a "trust gate" — check a wallet's score before allowing a transaction:

```python
result = agent.run(
    "I want to pay 0xABC...DEF 100 USDC for data services. "
    "Check their AgentScore first. Only proceed if they're "
    "Established tier or above with confidence > 0.7."
)
```

## Running Tests

```bash
pip install pytest pytest-asyncio httpx
pytest integrations/langchain/tests/ -v
```

## API Documentation

Full API docs: [djdagentscore.dev](https://djdagentscore.dev)
