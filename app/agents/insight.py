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
def query_transactions(
    query_type: str,
    start_date: str = "",
    end_date: str = "",
    category: str = "",
    vendor: str = "",
    transaction_type: str = "",
    search_description: str = "",
    min_amount: float = 0,
    max_amount: float = 0,
    limit: int = 100,
    offset: int = 0
) -> str:
    """
    Query the financial database for transactions, summaries, and analytics.

    Args:
        query_type: One of: list_transactions, sum_by_category, monthly_totals, vendor_breakdown, pending_invoices
        start_date: Filter start date in YYYY-MM-DD format (optional)
        end_date: Filter end date in YYYY-MM-DD format (optional)
        category: Filter by category like payroll, fuel, rent, office_supplies, utilities, subscriptions, insurance, travel, marketing, equipment, etc. (optional)
        vendor: Filter by vendor name (optional)
        transaction_type: Filter by "income" or "expense" (optional)
        search_description: Search keyword to filter transactions by description content, e.g. "salary", "fuel", "rent" (optional)
        min_amount: Minimum transaction amount (optional, 0 means no filter)
        max_amount: Maximum transaction amount (optional, 0 means no filter)
        limit: Maximum results to return (default 100)
        offset: Number of results to skip for pagination (default 0)

    Returns:
        JSON string with query results

    IMPORTANT GUIDELINES FOR CHOOSING PARAMETERS:
    - For salary questions: use category="payroll" OR search_description="salary"
    - For fuel questions: use category="fuel"
    - For rent questions: use category="rent"
    - For "this month" questions: set start_date to first day of current month, end_date to today
    - For "last month" questions: set appropriate date range
    - For "how much spent on X": use query_type="sum_by_category" with relevant category
    - For "list all X transactions": use query_type="list_transactions" with filters
    - For "monthly trends": use query_type="monthly_totals"
    - For "top vendors": use query_type="vendor_breakdown"
    - If unsure about category name, use search_description to search by keyword instead
    """
    try:
        filters = {}

        if start_date:
            filters["start_date"] = start_date
        if end_date:
            filters["end_date"] = end_date
        if category:
            filters["category"] = category
        if vendor:
            filters["vendor"] = vendor
        if transaction_type:
            filters["transaction_type"] = transaction_type
        if search_description:
            filters["search_description"] = search_description
        if min_amount > 0:
            filters["min_amount"] = min_amount
        if max_amount > 0:
            filters["max_amount"] = max_amount

        return database_query_tool_wrapper(query_type, filters, limit, offset)

    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Query failed: {str(e)}"
        })


# Create the Insight Agent
insight_agent = Agent(
    name="insight_agent",
    instructions="""You are a financial data analyst assistant for the Agentic Storekeeper platform. Help users understand their financial data by querying the database and providing clear answers.

HOW TO ANSWER QUESTIONS:

1. Determine what data is needed from the question
2. Use the query_transactions tool with appropriate parameters
3. Analyze the results and provide a clear, specific answer with numbers

MAPPING COMMON QUESTIONS TO QUERIES:

- "How much did we spend on salaries/payroll?" → query_type="sum_by_category", category="payroll"
- "Show me salary transactions" → query_type="list_transactions", category="payroll"
- "How much did we spend on fuel?" → query_type="sum_by_category", category="fuel"
- "What's our total income this month?" → query_type="list_transactions", transaction_type="income", with date range
- "Vendor breakdown" → query_type="vendor_breakdown"
- "Monthly spending trends" → query_type="monthly_totals"
- "Pending invoices" → query_type="pending_invoices"

CATEGORY NAMES IN THE DATABASE:
payroll, fuel, rent, office_supplies, utilities, subscriptions, insurance, travel, meals, maintenance, marketing, professional_services, equipment, shipping, training, client_payment, refund, miscellaneous

IMPORTANT:
- If a category filter returns no results, try using search_description with a keyword instead
- Always include specific numbers (amounts, counts) in your answer
- Format currency as NGN with commas (e.g., N1,250,000)
- If no results found, say so clearly and suggest alternative queries
- When asked about "this month", use the current month's date range
- When asked about "salary" or "salaries", use category="payroll"
""",
    model=model,
    tools=[query_transactions],
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
        from datetime import datetime, timedelta

        today = datetime.now().date()
        start_of_month = today.replace(day=1)

        runner_prompt = f"""Answer this question: {question}

Context:
- Tenant ID: {tenant_id}
- Today's date: {today.isoformat()}
- Current month started: {start_of_month.isoformat()}
- When the user says "this month", use start_date="{start_of_month.isoformat()}" and end_date="{today.isoformat()}"

Use the query_transactions tool to get the data you need, then provide a clear answer with specific numbers.
"""

        # Run the agent
        result = await Runner.run(
            insight_agent,
            runner_prompt,
            max_turns=5
        )

        # Extract final answer
        answer = result.final_output or "I couldn't find an answer to your question."

        data = {
            "question": question,
            "tenant_id": tenant_id,
            "answered_at": datetime.now().isoformat()
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