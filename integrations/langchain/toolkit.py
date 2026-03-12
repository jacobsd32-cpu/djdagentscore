"""AgentScoreToolkit — bundles all DJD AgentScore tools for LangChain agents.

Usage::

    from integrations.langchain.toolkit import AgentScoreToolkit

    toolkit = AgentScoreToolkit(api_key="djd_live_...")
    tools = toolkit.get_tools()

    # Pass `tools` to any LangChain agent:
    from langchain.agents import initialize_agent, AgentType
    agent = initialize_agent(tools, llm, agent=AgentType.OPENAI_FUNCTIONS)
"""

from __future__ import annotations

from typing import List, Optional

from langchain_core.tools import BaseTool, BaseToolkit

from integrations.langchain.djd_agent_score_tool import (
    DEFAULT_BASE_URL,
    DEFAULT_TIMEOUT,
    AgentLeaderboardTool,
    AgentRegistrationTool,
    AgentScoreDetailTool,
    AgentScoreTool,
)


class AgentScoreToolkit(BaseToolkit):
    """A LangChain toolkit that provides all DJD AgentScore tools.

    Parameters
    ----------
    api_key : str, optional
        API key for paid endpoints (``/v1/score/full``).  Free endpoints
        work without a key.  Get one at https://djdagentscore.dev/billing/plans.
    base_url : str
        Override the API base URL (useful for local dev or self-hosted instances).
    request_timeout : float
        HTTP request timeout in seconds (default 30).
    include_paid : bool
        If ``False``, only free tools (basic score, register, leaderboard)
        are included.  Useful for agents that shouldn't incur costs.
    """

    api_key: Optional[str] = None
    base_url: str = DEFAULT_BASE_URL
    request_timeout: float = DEFAULT_TIMEOUT
    include_paid: bool = True

    def get_tools(self) -> List[BaseTool]:
        """Return the list of available AgentScore tools."""
        shared = dict(
            base_url=self.base_url,
            api_key=self.api_key,
            request_timeout=self.request_timeout,
        )

        tools: List[BaseTool] = [
            AgentScoreTool(**shared),
            AgentRegistrationTool(**shared),
            AgentLeaderboardTool(**shared),
        ]

        if self.include_paid:
            tools.append(AgentScoreDetailTool(**shared))

        return tools
