"""LangChain tools for querying the DJD AgentScore API.

Each tool wraps a single API endpoint and returns structured data that an
LLM agent can reason over.  All tools are safe to use in async agent loops
(``_arun`` is the primary implementation; ``_run`` delegates via ``asyncio``).

Typical usage inside a LangChain agent::

    from integrations.langchain.toolkit import AgentScoreToolkit

    toolkit = AgentScoreToolkit(api_key="djd_live_...")
    tools = toolkit.get_tools()
    agent = initialize_agent(tools, llm, ...)
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Optional, Type

import httpx
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_BASE_URL = "https://djd-agent-score.fly.dev"
DEFAULT_TIMEOUT = 30.0  # seconds


# ---------------------------------------------------------------------------
# Input schemas  (Pydantic v2 — used by LangChain to validate tool inputs)
# ---------------------------------------------------------------------------

class WalletInput(BaseModel):
    """Input for tools that require a single wallet address."""

    wallet: str = Field(
        description="Ethereum wallet address (0x-prefixed, 40 hex chars). Example: 0x1234...abcd"
    )


class RegistrationInput(BaseModel):
    """Input for the agent registration tool."""

    wallet: str = Field(
        description="Ethereum wallet address to register."
    )
    name: Optional[str] = Field(
        default=None,
        description="Optional display name for the agent (max 100 chars).",
    )
    description: Optional[str] = Field(
        default=None,
        description="Optional description of what the agent does (max 500 chars).",
    )
    github_url: Optional[str] = Field(
        default=None,
        description="Optional HTTPS GitHub repo URL for the agent's source code.",
    )
    website_url: Optional[str] = Field(
        default=None,
        description="Optional HTTPS URL for the agent's website or docs.",
    )


class LeaderboardInput(BaseModel):
    """Input for the leaderboard tool (no required fields)."""

    pass


# ---------------------------------------------------------------------------
# Shared HTTP helper
# ---------------------------------------------------------------------------

async def _api_request(
    method: str,
    path: str,
    *,
    base_url: str,
    api_key: Optional[str] = None,
    params: Optional[dict[str, str]] = None,
    json_body: Optional[dict[str, Any]] = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """Make an HTTP request to the AgentScore API and return parsed JSON."""
    headers: dict[str, str] = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(base_url=base_url, timeout=timeout) as client:
        resp = await client.request(
            method,
            path,
            params=params,
            json=json_body,
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()


def _run_async(coro):
    """Run an async coroutine from a sync context."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # We're inside an existing event loop (e.g. Jupyter) — create a task
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(asyncio.run, coro).result()
    else:
        return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Tool: Basic Score
# ---------------------------------------------------------------------------

class AgentScoreTool(BaseTool):
    """Get the reputation score for an AI agent wallet on Base L2.

    Returns a 0-100 score, tier (Elite/Trusted/Established/Emerging/Unverified),
    confidence level, and a human-readable recommendation.  This is the **free**
    endpoint — no API key required.
    """

    name: str = "agent_score"
    description: str = (
        "Look up the DJD AgentScore reputation rating for an Ethereum wallet. "
        "Returns score (0-100), tier, confidence, and recommendation. "
        "Use this to check if an AI agent wallet is trustworthy before transacting."
    )
    args_schema: Type[BaseModel] = WalletInput

    base_url: str = DEFAULT_BASE_URL
    api_key: Optional[str] = None
    request_timeout: float = DEFAULT_TIMEOUT

    def _run(self, wallet: str, **kwargs: Any) -> str:
        return _run_async(self._arun(wallet, **kwargs))

    async def _arun(self, wallet: str, **kwargs: Any) -> str:
        try:
            data = await _api_request(
                "GET",
                "/v1/score/basic",
                base_url=self.base_url,
                api_key=self.api_key,
                params={"wallet": wallet},
                timeout=self.request_timeout,
            )
            return json.dumps(data, indent=2)
        except httpx.HTTPStatusError as e:
            return f"API error {e.response.status_code}: {e.response.text}"
        except Exception as e:
            return f"Request failed: {e}"


# ---------------------------------------------------------------------------
# Tool: Full / Detailed Score
# ---------------------------------------------------------------------------

class AgentScoreDetailTool(BaseTool):
    """Get a detailed reputation breakdown for an AI agent wallet.

    Returns the full scoring dimensions (reliability, viability, identity,
    capability, behavior), sybil detection flags, gaming indicators,
    score history, trajectory analysis, and improvement suggestions.

    **Requires an API key** — this is a paid endpoint ($0.10/query).
    """

    name: str = "agent_score_detail"
    description: str = (
        "Get a detailed DJD AgentScore breakdown for a wallet including "
        "dimension scores (reliability, viability, identity, capability, behavior), "
        "sybil/gaming detection, score history, and improvement suggestions. "
        "Costs $0.10 per query — requires an API key."
    )
    args_schema: Type[BaseModel] = WalletInput

    base_url: str = DEFAULT_BASE_URL
    api_key: Optional[str] = None
    request_timeout: float = DEFAULT_TIMEOUT

    def _run(self, wallet: str, **kwargs: Any) -> str:
        return _run_async(self._arun(wallet, **kwargs))

    async def _arun(self, wallet: str, **kwargs: Any) -> str:
        try:
            data = await _api_request(
                "GET",
                "/v1/score/full",
                base_url=self.base_url,
                api_key=self.api_key,
                params={"wallet": wallet},
                timeout=self.request_timeout,
            )
            return json.dumps(data, indent=2)
        except httpx.HTTPStatusError as e:
            return f"API error {e.response.status_code}: {e.response.text}"
        except Exception as e:
            return f"Request failed: {e}"


# ---------------------------------------------------------------------------
# Tool: Agent Registration
# ---------------------------------------------------------------------------

class AgentRegistrationTool(BaseTool):
    """Register an AI agent wallet with the DJD AgentScore network.

    Registration is free and optional, but registered agents appear on the
    public leaderboard and can earn a GitHub-verified badge.  Providing a
    public GitHub repo URL triggers automatic verification.
    """

    name: str = "agent_register"
    description: str = (
        "Register an AI agent wallet with the DJD AgentScore network. "
        "Free — provides visibility on the leaderboard and optional "
        "GitHub verification badge. Pass wallet address, and optionally "
        "name, description, github_url, and website_url."
    )
    args_schema: Type[BaseModel] = RegistrationInput

    base_url: str = DEFAULT_BASE_URL
    api_key: Optional[str] = None
    request_timeout: float = DEFAULT_TIMEOUT

    def _run(
        self,
        wallet: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        github_url: Optional[str] = None,
        website_url: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        return _run_async(
            self._arun(
                wallet,
                name=name,
                description=description,
                github_url=github_url,
                website_url=website_url,
                **kwargs,
            )
        )

    async def _arun(
        self,
        wallet: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        github_url: Optional[str] = None,
        website_url: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        body: dict[str, Any] = {"wallet": wallet}
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description
        if github_url is not None:
            body["github_url"] = github_url
        if website_url is not None:
            body["website_url"] = website_url

        try:
            data = await _api_request(
                "POST",
                "/v1/agent/register",
                base_url=self.base_url,
                api_key=self.api_key,
                json_body=body,
                timeout=self.request_timeout,
            )
            return json.dumps(data, indent=2)
        except httpx.HTTPStatusError as e:
            return f"API error {e.response.status_code}: {e.response.text}"
        except Exception as e:
            return f"Request failed: {e}"


# ---------------------------------------------------------------------------
# Tool: Leaderboard
# ---------------------------------------------------------------------------

class AgentLeaderboardTool(BaseTool):
    """Retrieve the public AgentScore leaderboard.

    Returns the top-ranked AI agent wallets with their scores, tiers,
    registration status, and GitHub verification badges.  Free endpoint.
    """

    name: str = "agent_leaderboard"
    description: str = (
        "Get the DJD AgentScore leaderboard showing top-ranked AI agent wallets. "
        "Returns rank, score, tier, registration status, and GitHub verification. "
        "Free — no API key required."
    )
    args_schema: Type[BaseModel] = LeaderboardInput

    base_url: str = DEFAULT_BASE_URL
    api_key: Optional[str] = None
    request_timeout: float = DEFAULT_TIMEOUT

    def _run(self, **kwargs: Any) -> str:
        return _run_async(self._arun(**kwargs))

    async def _arun(self, **kwargs: Any) -> str:
        try:
            data = await _api_request(
                "GET",
                "/v1/leaderboard",
                base_url=self.base_url,
                api_key=self.api_key,
                timeout=self.request_timeout,
            )
            return json.dumps(data, indent=2)
        except httpx.HTTPStatusError as e:
            return f"API error {e.response.status_code}: {e.response.text}"
        except Exception as e:
            return f"Request failed: {e}"
