# DJD AgentScore — CrewAI Integration

CrewAI tools for checking AI agent wallet reputation on Base L2. Give your crew members the ability to verify counterparty wallets before transacting.

## Quick Start

```bash
pip install crewai httpx
```

```python
from crewai import Agent
from integrations.crewai.tools import check_agent_score, get_detailed_agent_score

agent = Agent(
    role="Trust Analyst",
    goal="Verify wallet reputation before transactions",
    tools=[check_agent_score, get_detailed_agent_score],
)
```

## Tools

| Tool | Endpoint | Cost | Description |
|------|----------|------|-------------|
| `check_agent_score` | `GET /v1/score/basic` | Free | Quick score (0-100), tier, confidence |
| `get_detailed_agent_score` | `GET /v1/score/full` | $0.10 | Full breakdown with dimensions, sybil flags |
| `register_agent` | `POST /v1/agent/register` | Free | Register wallet on the leaderboard |
| `get_agent_leaderboard` | `GET /v1/leaderboard` | Free | Top-ranked agents with scores and badges |

## Configuration

Set environment variables:

```bash
export DJD_API_KEY="djd_live_..."     # Required for paid endpoints
export DJD_BASE_URL="https://djd-agent-score.fly.dev"  # Default
```

## Get an API Key

[djd-agent-score.fly.dev/billing/plans](https://djd-agent-score.fly.dev/billing/plans)

| Plan | Price | Queries/month |
|------|-------|---------------|
| Starter | $29/mo | 1,000 |
| Growth | $79/mo | 5,000 |
| Scale | $199/mo | 25,000 |

## Example Crew

See [`example_crew.py`](./example_crew.py) for a full two-agent crew:
- **Trust Analyst** — researches wallet scores
- **Risk Advisor** — makes go/no-go recommendations

```bash
export OPENAI_API_KEY="sk-..."
python integrations/crewai/example_crew.py
```

## Running Tests

```bash
pip install pytest httpx crewai
pytest integrations/crewai/tests/ -v
```

## API Documentation

Full API docs: [djd-agent-score.fly.dev](https://djd-agent-score.fly.dev)
