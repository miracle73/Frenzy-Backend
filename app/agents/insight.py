"""Insight Agent for natural language financial queries."""

import os
import json
from typing import Dict, Any
from agents import Agent, Runner, function_tool, set_default_openai_client, set_default_openai_api, OpenAIChatCompletionsModel
from agents.mcp import MCPServer, MCPServerStdio
from pydantic import BaseModel
from decimal import Decimal

from app.config import settings, async_client as openai_async_client

# Configure the agents framework to use OpenRouter
set_default_openai_client(openai_async_client)
set_default_openai_api("chat_completions")

# Create a Model object instead of using model string to avoid prefix errors
model = OpenAIChatCompletionsModel(
    model=settings.ai_model,
    openai_client=openai_async_client
)
from app.mcp_tools.database import DatabaseQueryTool
from sqlalchemy.orm import Session


class InsightResponse(BaseModel):
    answer: str
    data: Dict[str, Any]


class InsightContext:
    """Context containing database session and tenant information."""

    def __init__(self, db: Session, tenant_id: int):
        self.db = db
        self.tenant_id = tenant_id


# Global for storing the database context during tool execution
_db_context = None


def set_db_context(context: InsightContext):
    """Set the database context for tool execution."""
    global _db_context
    _db_context = context


def get_db_context() -> InsightContext:
    """Get the current database context."""
    return _db_context


def database_query_tool_wrapper(
    query_type: str,
    filters: Dict[str, Any],
    limit: int = 100,
    offset: int = 0
) -> str:
    """
    Wrapper for DatabaseQueryTool that uses the current database context.

    Args:
        query_type: Type of query (list_transactions, sum_by_category, etc.)
        filters: Dictionary of filters including tenant_id, dates, etc.
        limit: Maximum number of results
        offset: Number of results to skip

    Returns:
        JSON string result from DatabaseQueryTool
    """
    context = get_db_context()
    if not context:
        return json.dumps({"success": False, "error": "No database context available"})

    # Ensure tenant_id is in filters
    filters["tenant_id"] = context.tenant_id

    # Execute the database query
    result = DatabaseQueryTool.run({
        "query_type": query_type,
        "filters": filters,
        "limit": limit,
        "offset": offset
    }, context.db)

    return json.dumps(result, default=str)


@function_tool
def query_database(
    question: str,
    filters: str,
    page: int = 1,
    page_size: int = 100
) -> str:
    """
    Query the financial database to answer questions about transactions, expenses, income, and spending patterns.

    This tool is designed to handle natural language queries about financial data by executing appropriate database queries.

    Args:
        question: Natural language question about the financial data (e.g., "How much did we spend on fuel this month?")
        filters: JSON string of filters including date range, category, vendor, etc.
        page: Page number for pagination (default: 1)
        page_size: Number of results per page (default: 100)

    Returns:
        JSON formatted string with query results including success status and data

    Examples:
        Get expenses for this month:
        {
            "question": "How much spent on fuel",
            "filters": "{\"start_date\":\"2026-04-01\",\"end_date\":\"2026-04-30\",\"transaction_type\":\"expense\"}",
            "page": 1,
            "page_size": 100
        }

        Get income by month:
        {
            "question": "Income monthly totals",
            "filters": "{\"transaction_type\":\"income\"}",
            "page": 1,
            "page_size": 100
        }

        Get vendor breakdown:
        {
            "question": "Vendor breakdown for expenses",
            "filters": "{\"transaction_type\":\"expense\"}",
            "page": 1,
            "page_size": 10
        }
    """
    try:
        # Parse filters
        filter_dict = json.loads(filters) if isinstance(filters, str) else filters

        # Determine query type based on question
        question_lower = question.lower()

        if "monthly totals" in question_lower or "month by month" in question_lower:
            query_type = "monthly_totals"
        elif "vendor" in question_lower or "merchants" in question_lower:
            query_type = "vendor_breakdown"
        elif "category" in question_lower or "by category" in question_lower:
            query_type = "sum_by_category"
        elif "pending" in question_lower or "invoice" in question_lower:
            query_type = "pending_invoices"
        else:
            query_type = "list_transactions"

        # Parse limit and offset from page parameters
        limit = page_size
        offset = (page - 1) * page_size

        # Execute the database query
        return database_query_tool_wrapper(query_type, filter_dict, limit, offset)

    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Query failed: {str(e)}",
            "question": question,
            "filters": filters
        })


# Create the Insight Agent
insight_agent = Agent(
    name="insight_agent",
    instructions="""You are a financial data analyst assistant. Help users understand their financial data by:

1. Analyzing their questions about transactions, expenses, income, and spending patterns
2. Querying the database using the query_database tool
3. Interpreting the results and providing clear, actionable answers
4. Including relevant data and numbers in your responses
5. Being conversational while providing precise financial insights

Guidelines:
- For questions about specific spending: query expenses with filters
- For income questions: query with transaction_type="income"
- For comparisons over time: use monthly_totals or vendor_breakdown queries
- Always include amounts, dates, and relevant context in answers
- Calculate totals and percentages when helpful
- Identify patterns and trends
- Suggest follow-up questions

If a query fails or returns no results, explain what was attempted and suggest how the user might rephrase their question.
""",
    model=model,
    tools=[query_database],
    mcp_servers=[]
)


async def get_insight(question: str, db: Session, tenant_id: int) -> InsightResponse:
    """
    Get financial insight from natural language question.

    Args:
        question: User's question in natural language
        db: Database session
        tenant_id: Tenant ID for data isolation

    Returns:
        InsightResponse with answer and structured data
    """
    # Set the database context for tool execution
    set_db_context(InsightContext(db, tenant_id))

    try:
        # Set default filters for the past month if not specified elsewhere
        from datetime import datetime, timedelta

        today = datetime.now().date()
        start_of_month = today.replace(day=1)
        last_month = start_of_month - timedelta(days=1)
        start_of_last_month = last_month.replace(day=1)

        # This will be passed to the tool via user message
        runner_prompt = f"""Answer this question: {question}

The user has access to their financial transactions including expenses and income.
They can filter by date range, category, vendor, and transaction type.

Current period: past month (from {start_of_last_month} to {start_of_month})
Tenant: {tenant_id}

Include specific numbers, dates, and context in your response.
If querying the database, use appropriate filters based on the question.
"""

        # Run the agent
        result = await Runner.run(
            insight_agent,
            runner_prompt,
            max_turns=5
        )

        # Extract final answer
        answer = result.final_output or "I couldn't find an answer to your question."

        # Extract data from the agent's reasoning (simplified for now)
        # In a production environment, you might want to track the tool calls and results
        data = {
            "question": question,
            "tenant_id": tenant_id,
            "answered_at": datetime.utcnow().isoformat()
        }

        return InsightResponse(
            answer=answer,
            data=data
        )

    except Exception as e:
        return InsightResponse(
            answer=f"I encountered an error processing your question: {str(e)}",
            data={
                "original_question": question,
                "error": str(e)
            }
        )
