#!/usr/bin/env python3
"""Example: LangChain agent that checks wallet reputation before transacting.

This demonstrates how an AI agent can use DJD AgentScore to make
trust-aware decisions about counterparty wallets.

Prerequisites::

    pip install langchain langchain-openai httpx

Usage::

    export OPENAI_API_KEY="sk-..."
    export DJD_API_KEY="djd_live_..."   # optional — needed for detailed scores
    python integrations/langchain/example_agent.py
"""

from __future__ import annotations

import os

from langchain.agents import AgentType, initialize_agent
from langchain_openai import ChatOpenAI

# Import the toolkit
from integrations.langchain.toolkit import AgentScoreToolkit


def main():
    # 1. Initialize the LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # 2. Create the AgentScore toolkit
    toolkit = AgentScoreToolkit(
        api_key=os.getenv("DJD_API_KEY"),  # None = free endpoints only
        # include_paid=False,               # Uncomment to restrict to free tools
    )

    # 3. Get the tools and create a LangChain agent
    tools = toolkit.get_tools()
    agent = initialize_agent(
        tools,
        llm,
        agent=AgentType.OPENAI_FUNCTIONS,
        verbose=True,
    )

    # 4. Run the agent with a trust-checking scenario
    print("\n" + "=" * 60)
    print("SCENARIO: Check wallet reputation before a transaction")
    print("=" * 60 + "\n")

    result = agent.run(
        "I'm about to send 500 USDC to wallet "
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045. "
        "Check their AgentScore reputation first and tell me "
        "if this is a safe transaction."
    )
    print(f"\nAgent decision: {result}")

    # 5. Another scenario: check the leaderboard
    print("\n" + "=" * 60)
    print("SCENARIO: Find the most trusted agents")
    print("=" * 60 + "\n")

    result = agent.run(
        "Show me the top 5 AI agents on the AgentScore leaderboard. "
        "Which ones are GitHub-verified?"
    )
    print(f"\nAgent response: {result}")


if __name__ == "__main__":
    main()
