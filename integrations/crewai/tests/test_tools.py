"""Tests for DJD AgentScore CrewAI tools.

Uses monkeypatching to mock HTTP calls.
Run with: pytest integrations/crewai/tests/test_tools.py -v
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from integrations.crewai.tools import (
    check_agent_score,
    get_agent_leaderboard,
    get_detailed_agent_score,
    register_agent,
)

# ---------------------------------------------------------------------------
# Mock responses
# ---------------------------------------------------------------------------

WALLET = "0x1234567890abcdef1234567890abcdef12345678"

MOCK_BASIC_SCORE = {
    "wallet": WALLET,
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
        "reliability": {"score": 80, "data": {}},
        "viability": {"score": 65, "data": {}},
        "identity": {"score": 70, "data": {}},
        "capability": {"score": 75, "data": {}},
    },
    "dataAvailability": {},
    "scoreHistory": [],
}

MOCK_REGISTRATION = {
    "wallet": WALLET,
    "status": "registered",
    "registeredAt": "2026-03-01T12:00:00.000Z",
    "name": "TestAgent",
    "description": "A test agent",
    "github_url": None,
    "website_url": None,
    "github_verified": False,
    "github_stars": None,
    "github_pushed_at": None,
}

MOCK_LEADERBOARD = {
    "leaderboard": [
        {"rank": 1, "wallet": "0xaaaa...", "score": 95, "tier": "Elite", "daysAlive": 365, "isRegistered": True, "githubVerified": True},
    ],
    "totalAgentsScored": 321,
    "totalAgentsRegistered": 15,
    "lastUpdated": "2026-03-01T12:00:00.000Z",
}


# ---------------------------------------------------------------------------
# Tests: check_agent_score
# ---------------------------------------------------------------------------

class TestCheckAgentScore:
    def test_returns_score_json(self, monkeypatch):
        """Tool returns valid JSON with score data."""
        monkeypatch.setattr(
            "integrations.crewai.tools._api_get",
            lambda path, params=None: MOCK_BASIC_SCORE,
        )
        result = check_agent_score.run(WALLET)
        parsed = json.loads(result)
        assert parsed["score"] == 72
        assert parsed["tier"] == "Established"

    def test_handles_http_error(self, monkeypatch):
        """Tool returns error message on HTTP failure."""
        def mock_fail(*args, **kwargs):
            resp = httpx.Response(400, json={"error": "bad wallet"})
            raise httpx.HTTPStatusError("Bad", request=httpx.Request("GET", "https://test"), response=resp)

        monkeypatch.setattr("integrations.crewai.tools._api_get", mock_fail)
        result = check_agent_score.run("invalid")
        assert "API error 400" in result

    def test_has_tool_metadata(self):
        """Tool has name and description for CrewAI discovery."""
        assert check_agent_score.name == "Check Agent Reputation Score"
        assert check_agent_score.description is not None
        assert len(check_agent_score.description) > 20


# ---------------------------------------------------------------------------
# Tests: get_detailed_agent_score
# ---------------------------------------------------------------------------

class TestGetDetailedAgentScore:
    def test_returns_dimensions(self, monkeypatch):
        """Tool returns full score with dimensions."""
        monkeypatch.setattr(
            "integrations.crewai.tools._api_get",
            lambda path, params=None: MOCK_FULL_SCORE,
        )
        result = get_detailed_agent_score.run(WALLET)
        parsed = json.loads(result)
        assert "dimensions" in parsed
        assert parsed["dimensions"]["reliability"]["score"] == 80

    def test_has_paid_warning(self):
        """Tool description mentions it's a paid endpoint."""
        desc = get_detailed_agent_score.description
        assert "paid" in desc.lower() or "$0.10" in desc or "api_key" in desc.lower()


# ---------------------------------------------------------------------------
# Tests: register_agent
# ---------------------------------------------------------------------------

class TestRegisterAgent:
    def test_registers_wallet(self, monkeypatch):
        """Tool registers a wallet and returns status."""
        monkeypatch.setattr(
            "integrations.crewai.tools._api_post",
            lambda path, body: MOCK_REGISTRATION,
        )
        result = register_agent.run(WALLET)
        parsed = json.loads(result)
        assert parsed["status"] == "registered"

    def test_with_optional_fields(self, monkeypatch):
        """Tool passes optional fields to API."""
        captured_body = {}

        def mock_post(path, body):
            captured_body.update(body)
            return MOCK_REGISTRATION

        monkeypatch.setattr("integrations.crewai.tools._api_post", mock_post)
        register_agent.run(
            wallet=WALLET,
            name="MyAgent",
            github_url="https://github.com/test/repo",
        )
        assert captured_body["name"] == "MyAgent"
        assert captured_body["github_url"] == "https://github.com/test/repo"

    def test_minimal_registration(self, monkeypatch):
        """Tool works with only wallet address."""
        captured_body = {}

        def mock_post(path, body):
            captured_body.update(body)
            return MOCK_REGISTRATION

        monkeypatch.setattr("integrations.crewai.tools._api_post", mock_post)
        register_agent.run(wallet=WALLET)
        assert "name" not in captured_body
        assert captured_body["wallet"] == WALLET


# ---------------------------------------------------------------------------
# Tests: get_agent_leaderboard
# ---------------------------------------------------------------------------

class TestGetAgentLeaderboard:
    def test_returns_leaderboard(self, monkeypatch):
        """Tool returns ranked leaderboard data."""
        monkeypatch.setattr(
            "integrations.crewai.tools._api_get",
            lambda path, params=None: MOCK_LEADERBOARD,
        )
        result = get_agent_leaderboard.run()
        parsed = json.loads(result)
        assert len(parsed["leaderboard"]) == 1
        assert parsed["totalAgentsScored"] == 321

    def test_has_description(self):
        """Leaderboard tool has a useful description."""
        assert "leaderboard" in get_agent_leaderboard.description.lower()
