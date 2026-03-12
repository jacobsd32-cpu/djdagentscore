"""CrewAI tools for querying the DJD AgentScore API.

Each tool is a standalone function decorated with ``@tool``, following
CrewAI's idiomatic pattern.  All tools are synchronous (CrewAI runs
tools in a sync context) but use ``httpx`` for clean HTTP handling.

Usage in a CrewAI agent::

    from crewai import Agent
    from integrations.crewai.tools import check_agent_score, get_detailed_agent_score

    agent = Agent(
        role="Trust Analyst",
        goal="Verify wallet reputation before transactions",
        tools=[check_agent_score, get_detailed_agent_score],
    )
"""

from __future__ import annotations

import json
import os
from typing import Optional

import httpx
from crewai.tools import tool

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = os.getenv("DJD_BASE_URL", "https://djdagentscore.dev")
API_KEY = os.getenv("DJD_API_KEY", "")
TIMEOUT = 30.0


def _get_headers() -> dict[str, str]:
    """Build request headers, including API key if configured."""
    headers = {"Accept": "application/json"}
    key = API_KEY or os.getenv("DJD_API_KEY", "")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _api_get(path: str, params: Optional[dict[str, str]] = None) -> dict:
    """Synchronous GET request to the AgentScore API."""
    resp = httpx.get(
        f"{BASE_URL}{path}",
        params=params,
        headers=_get_headers(),
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def _api_post(path: str, body: dict) -> dict:
    """Synchronous POST request to the AgentScore API."""
    resp = httpx.post(
        f"{BASE_URL}{path}",
        json=body,
        headers=_get_headers(),
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Tool: Basic Score
# ---------------------------------------------------------------------------

@tool("Check Agent Reputation Score")
def check_agent_score(wallet: str) -> str:
    """Look up the DJD AgentScore reputation rating for an Ethereum wallet address.

    Returns a trust score (0-100), tier (Elite/Trusted/Established/Emerging/Unverified),
    confidence level, and a human-readable recommendation.

    This is the FREE endpoint — no API key required. Use this to quickly check
    if an AI agent wallet is trustworthy before transacting with it.

    Args:
        wallet: Ethereum wallet address (0x-prefixed, 40 hex chars).
    """
    try:
        data = _api_get("/v1/score/basic", params={"wallet": wallet})
        return json.dumps(data, indent=2)
    except httpx.HTTPStatusError as e:
        return f"API error {e.response.status_code}: {e.response.text}"
    except Exception as e:
        return f"Request failed: {e}"


# ---------------------------------------------------------------------------
# Tool: Detailed Score
# ---------------------------------------------------------------------------

@tool("Get Detailed Agent Score")
def get_detailed_agent_score(wallet: str) -> str:
    """Get a detailed reputation breakdown for an AI agent wallet on Base L2.

    Returns the full scoring dimensions (reliability, viability, identity,
    capability, behavior), sybil detection flags, gaming indicators,
    score history, trajectory analysis, and improvement suggestions.

    IMPORTANT: This is a PAID endpoint ($0.10/query). Set the DJD_API_KEY
    environment variable before using this tool.

    Args:
        wallet: Ethereum wallet address (0x-prefixed, 40 hex chars).
    """
    try:
        data = _api_get("/v1/score/full", params={"wallet": wallet})
        return json.dumps(data, indent=2)
    except httpx.HTTPStatusError as e:
        return f"API error {e.response.status_code}: {e.response.text}"
    except Exception as e:
        return f"Request failed: {e}"


# ---------------------------------------------------------------------------
# Tool: Agent Registration
# ---------------------------------------------------------------------------

@tool("Register AI Agent")
def register_agent(
    wallet: str,
    name: str = "",
    description: str = "",
    github_url: str = "",
    website_url: str = "",
) -> str:
    """Register an AI agent wallet with the DJD AgentScore network.

    Registration is FREE and optional, but registered agents appear on the
    public leaderboard and can earn a GitHub-verified badge. Providing a
    public GitHub repo URL triggers automatic verification.

    Args:
        wallet: Ethereum wallet address to register.
        name: Optional display name for the agent (max 100 chars).
        description: Optional description of the agent's purpose (max 500 chars).
        github_url: Optional HTTPS GitHub repo URL for source code.
        website_url: Optional HTTPS URL for the agent's website.
    """
    body: dict = {"wallet": wallet}
    if name:
        body["name"] = name
    if description:
        body["description"] = description
    if github_url:
        body["github_url"] = github_url
    if website_url:
        body["website_url"] = website_url

    try:
        data = _api_post("/v1/agent/register", body)
        return json.dumps(data, indent=2)
    except httpx.HTTPStatusError as e:
        return f"API error {e.response.status_code}: {e.response.text}"
    except Exception as e:
        return f"Request failed: {e}"


# ---------------------------------------------------------------------------
# Tool: Leaderboard
# ---------------------------------------------------------------------------

@tool("Get Agent Leaderboard")
def get_agent_leaderboard() -> str:
    """Retrieve the DJD AgentScore public leaderboard.

    Returns the top-ranked AI agent wallets with their scores, tiers,
    registration status, and GitHub verification badges. This is the
    FREE endpoint — no API key required.

    Use this to find the most trusted agents on Base L2 or to see where
    a specific agent ranks relative to others.
    """
    try:
        data = _api_get("/v1/leaderboard")
        return json.dumps(data, indent=2)
    except httpx.HTTPStatusError as e:
        return f"API error {e.response.status_code}: {e.response.text}"
    except Exception as e:
        return f"Request failed: {e}"
