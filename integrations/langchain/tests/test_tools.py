"""Tests for DJD AgentScore LangChain tools.

Uses httpx mock transport to avoid real network calls.
Run with: pytest integrations/langchain/tests/test_tools.py -v
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from langchain_core.tools import BaseTool

from integrations.langchain.djd_agent_score_tool import (
    AgentLeaderboardTool,
    AgentRegistrationTool,
    AgentScoreDetailTool,
    AgentScoreTool,
)
from integrations.langchain.toolkit import AgentScoreToolkit

# ---------------------------------------------------------------------------
# Mock responses  (mirror actual API shapes from src/types.ts)
# ---------------------------------------------------------------------------

MOCK_BASIC_SCORE = {
    "wallet": "0x1234567890abcdef1234567890abcdef12345678",
    "score": 72,
    "tier": "Established",
    "confidence": 0.85,
    "recommendation": "Moderate trust — established track record.",
    "modelVersion": "2.5.0",
    "lastUpdated": "2026-03-01T12:00:00.000Z",
    "computedAt": "2026-03-01T12:00:00.000Z",
    "scoreFreshness": 1.0,
    "dataSource": "live",
}

MOCK_FULL_SCORE = {
    **MOCK_BASIC_SCORE,
    "sybilFlag": False,
    "gamingIndicators": [],
    "dimensions": {
        "reliability": {"score": 80, "data": {"txCount": 150, "nonce": 200, "successRate": 0.95, "lastTxTimestamp": 1709200000, "failedTxCount": 8, "uptimeEstimate": 0.9}},
        "viability": {"score": 65, "data": {"usdcBalance": "1000.50", "ethBalance": "0.5", "inflows30d": "500", "outflows30d": "300", "inflows7d": "100", "outflows7d": "50", "totalInflows": "5000", "walletAgedays": 180, "everZeroBalance": False}},
        "identity": {"score": 70, "data": {"erc8004Registered": True, "hasBasename": True, "walletAgeDays": 180, "creatorScore": 50, "generationDepth": 1, "constitutionHashVerified": True, "insumerVerified": False}},
        "capability": {"score": 75, "data": {"activeX402Services": 2, "totalRevenue": "250", "domainsOwned": 1, "successfulReplications": 5, "uniqueCounterparties": 12, "serviceLongevityDays": 90}},
    },
    "dataAvailability": {
        "transactionHistory": "full",
        "walletAge": "full",
        "economicData": "full",
        "identityData": "partial",
        "communityData": "none",
    },
    "scoreHistory": [
        {"score": 70, "calculatedAt": "2026-02-15T12:00:00.000Z"},
        {"score": 72, "calculatedAt": "2026-03-01T12:00:00.000Z"},
    ],
}

MOCK_REGISTRATION = {
    "wallet": "0x1234567890abcdef1234567890abcdef12345678",
    "status": "registered",
    "registeredAt": "2026-03-01T12:00:00.000Z",
    "name": "TestAgent",
    "description": "A test agent",
    "github_url": "https://github.com/test/agent",
    "website_url": None,
    "github_verified": False,
    "github_stars": None,
    "github_pushed_at": None,
}

MOCK_LEADERBOARD = {
    "leaderboard": [
        {
            "rank": 1,
            "wallet": "0xaaaa567890abcdef1234567890abcdef12345678",
            "score": 95,
            "tier": "Elite",
            "daysAlive": 365,
            "isRegistered": True,
            "githubVerified": True,
        },
        {
            "rank": 2,
            "wallet": "0xbbbb567890abcdef1234567890abcdef12345678",
            "score": 88,
            "tier": "Trusted",
            "daysAlive": 200,
            "isRegistered": True,
            "githubVerified": False,
        },
    ],
    "totalAgentsScored": 321,
    "totalAgentsRegistered": 15,
    "lastUpdated": "2026-03-01T12:00:00.000Z",
}


# ---------------------------------------------------------------------------
# Mock transport
# ---------------------------------------------------------------------------

class MockTransport(httpx.AsyncBaseTransport):
    """Return canned responses for known API paths."""

    def __init__(self, responses: dict[str, tuple[int, Any]]):
        self._responses = responses

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path in self._responses:
            status, body = self._responses[path]
            return httpx.Response(status, json=body)
        return httpx.Response(404, json={"error": "not found"})


def _make_mock_client(responses: dict[str, tuple[int, Any]]) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=MockTransport(responses),
        base_url="https://mock.test",
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

WALLET = "0x1234567890abcdef1234567890abcdef12345678"


# ---------------------------------------------------------------------------
# Tests: AgentScoreTool
# ---------------------------------------------------------------------------

class TestAgentScoreTool:
    @pytest.mark.asyncio
    async def test_basic_score_success(self, monkeypatch):
        """Tool returns formatted JSON for a valid wallet."""
        tool = AgentScoreTool(base_url="https://mock.test")

        async def mock_request(*args, **kwargs):
            return MOCK_BASIC_SCORE

        monkeypatch.setattr(
            "integrations.langchain.djd_agent_score_tool._api_request",
            mock_request,
        )

        result = await tool._arun(WALLET)
        parsed = json.loads(result)
        assert parsed["score"] == 72
        assert parsed["tier"] == "Established"
        assert parsed["wallet"] == WALLET

    @pytest.mark.asyncio
    async def test_basic_score_api_error(self, monkeypatch):
        """Tool gracefully returns error message on HTTP error."""
        tool = AgentScoreTool(base_url="https://mock.test")

        async def mock_request(*args, **kwargs):
            resp = httpx.Response(400, json={"error": "Invalid wallet"})
            raise httpx.HTTPStatusError("Bad Request", request=httpx.Request("GET", "https://mock.test"), response=resp)

        monkeypatch.setattr(
            "integrations.langchain.djd_agent_score_tool._api_request",
            mock_request,
        )

        result = await tool._arun("invalid")
        assert "API error 400" in result

    def test_tool_metadata(self):
        """Tool has correct name, description, and schema."""
        tool = AgentScoreTool()
        assert tool.name == "agent_score"
        assert "reputation" in tool.description.lower() or "score" in tool.description.lower()
        assert tool.args_schema is not None


# ---------------------------------------------------------------------------
# Tests: AgentScoreDetailTool
# ---------------------------------------------------------------------------

class TestAgentScoreDetailTool:
    @pytest.mark.asyncio
    async def test_full_score_success(self, monkeypatch):
        """Tool returns full score with dimensions."""
        tool = AgentScoreDetailTool(base_url="https://mock.test", api_key="djd_test_key")

        async def mock_request(*args, **kwargs):
            return MOCK_FULL_SCORE

        monkeypatch.setattr(
            "integrations.langchain.djd_agent_score_tool._api_request",
            mock_request,
        )

        result = await tool._arun(WALLET)
        parsed = json.loads(result)
        assert "dimensions" in parsed
        assert parsed["dimensions"]["reliability"]["score"] == 80
        assert parsed["sybilFlag"] is False

    def test_tool_metadata(self):
        """Detail tool describes paid nature."""
        tool = AgentScoreDetailTool()
        assert tool.name == "agent_score_detail"
        assert "api key" in tool.description.lower() or "$0.10" in tool.description


# ---------------------------------------------------------------------------
# Tests: AgentRegistrationTool
# ---------------------------------------------------------------------------

class TestAgentRegistrationTool:
    @pytest.mark.asyncio
    async def test_registration_success(self, monkeypatch):
        """Tool registers a wallet and returns status."""
        tool = AgentRegistrationTool(base_url="https://mock.test")

        async def mock_request(method, path, *, json_body=None, **kwargs):
            assert method == "POST"
            assert json_body["wallet"] == WALLET
            assert json_body["name"] == "TestAgent"
            return MOCK_REGISTRATION

        monkeypatch.setattr(
            "integrations.langchain.djd_agent_score_tool._api_request",
            mock_request,
        )

        result = await tool._arun(WALLET, name="TestAgent", description="A test agent")
        parsed = json.loads(result)
        assert parsed["status"] == "registered"
        assert parsed["name"] == "TestAgent"

    @pytest.mark.asyncio
    async def test_registration_minimal(self, monkeypatch):
        """Tool works with only wallet (no optional fields)."""
        tool = AgentRegistrationTool(base_url="https://mock.test")

        async def mock_request(method, path, *, json_body=None, **kwargs):
            assert "name" not in json_body
            return MOCK_REGISTRATION

        monkeypatch.setattr(
            "integrations.langchain.djd_agent_score_tool._api_request",
            mock_request,
        )

        result = await tool._arun(WALLET)
        parsed = json.loads(result)
        assert parsed["wallet"] == WALLET


# ---------------------------------------------------------------------------
# Tests: AgentLeaderboardTool
# ---------------------------------------------------------------------------

class TestAgentLeaderboardTool:
    @pytest.mark.asyncio
    async def test_leaderboard_success(self, monkeypatch):
        """Tool returns ranked leaderboard."""
        tool = AgentLeaderboardTool(base_url="https://mock.test")

        async def mock_request(*args, **kwargs):
            return MOCK_LEADERBOARD

        monkeypatch.setattr(
            "integrations.langchain.djd_agent_score_tool._api_request",
            mock_request,
        )

        result = await tool._arun()
        parsed = json.loads(result)
        assert len(parsed["leaderboard"]) == 2
        assert parsed["leaderboard"][0]["rank"] == 1
        assert parsed["totalAgentsScored"] == 321


# ---------------------------------------------------------------------------
# Tests: AgentScoreToolkit
# ---------------------------------------------------------------------------

class TestAgentScoreToolkit:
    def test_toolkit_returns_all_tools(self):
        """Toolkit includes all 4 tools by default."""
        toolkit = AgentScoreToolkit(api_key="djd_test_key")
        tools = toolkit.get_tools()
        names = {t.name for t in tools}
        assert names == {"agent_score", "agent_score_detail", "agent_register", "agent_leaderboard"}

    def test_toolkit_excludes_paid(self):
        """Setting include_paid=False omits the detail tool."""
        toolkit = AgentScoreToolkit(include_paid=False)
        tools = toolkit.get_tools()
        names = {t.name for t in tools}
        assert "agent_score_detail" not in names
        assert "agent_score" in names

    def test_toolkit_propagates_config(self):
        """API key and base URL are propagated to all tools."""
        toolkit = AgentScoreToolkit(
            api_key="djd_live_test123",
            base_url="https://custom.api",
            request_timeout=60.0,
        )
        for tool in toolkit.get_tools():
            assert tool.api_key == "djd_live_test123"
            assert tool.base_url == "https://custom.api"
            assert tool.request_timeout == 60.0

    def test_toolkit_is_langchain_compatible(self):
        """Toolkit is a proper BaseToolkit subclass."""
        toolkit = AgentScoreToolkit()
        assert hasattr(toolkit, "get_tools")
        tools = toolkit.get_tools()
        assert all(isinstance(t, BaseTool) for t in tools)
