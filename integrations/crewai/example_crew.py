#!/usr/bin/env python3
"""Example: CrewAI crew that evaluates agent wallet trustworthiness.

This demonstrates a two-agent crew where a Trust Analyst checks wallet
reputation and a Risk Advisor makes a go/no-go recommendation.

Prerequisites::

    pip install crewai httpx

Usage::

    export OPENAI_API_KEY="sk-..."
    export DJD_API_KEY="djd_live_..."   # optional — for detailed scores
    python integrations/crewai/example_crew.py
"""

from __future__ import annotations

import os

from crewai import Agent, Crew, Task

from integrations.crewai.tools import (
    check_agent_score,
    get_agent_leaderboard,
    get_detailed_agent_score,
    register_agent,
)


def main():
    # Agent 1: Trust Analyst — looks up scores
    trust_analyst = Agent(
        role="Trust Analyst",
        goal="Research wallet reputation scores and identify trust signals",
        backstory=(
            "You are an expert in on-chain reputation analysis. You use the "
            "DJD AgentScore API to evaluate AI agent wallets on Base L2, "
            "checking their reliability, viability, identity, and capability."
        ),
        tools=[check_agent_score, get_detailed_agent_score, get_agent_leaderboard],
        verbose=True,
    )

    # Agent 2: Risk Advisor — makes recommendations
    risk_advisor = Agent(
        role="Risk Advisor",
        goal="Provide actionable trust recommendations based on score analysis",
        backstory=(
            "You are a risk management specialist who interprets AgentScore "
            "data and provides clear go/no-go recommendations for transactions "
            "with AI agent wallets."
        ),
        verbose=True,
    )

    # Task 1: Check a wallet's reputation
    wallet = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    research_task = Task(
        description=(
            f"Look up the AgentScore for wallet {wallet}. "
            "Get both the basic score and detailed breakdown if possible. "
            "Also check where they rank on the leaderboard."
        ),
        expected_output="A comprehensive reputation report with score, tier, dimensions, and leaderboard ranking.",
        agent=trust_analyst,
    )

    # Task 2: Make a recommendation
    recommendation_task = Task(
        description=(
            f"Based on the Trust Analyst's research on wallet {wallet}, "
            "provide a clear recommendation: should we proceed with a "
            "500 USDC transaction with this wallet? Consider the score, "
            "tier, confidence level, and any red flags."
        ),
        expected_output="A go/no-go recommendation with supporting reasoning.",
        agent=risk_advisor,
    )

    # Create and run the crew
    crew = Crew(
        agents=[trust_analyst, risk_advisor],
        tasks=[research_task, recommendation_task],
        verbose=True,
    )

    print("\n" + "=" * 60)
    print("CREW: Wallet Trust Assessment")
    print("=" * 60 + "\n")

    result = crew.kickoff()
    print(f"\nFinal Output:\n{result}")


if __name__ == "__main__":
    main()
