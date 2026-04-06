from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
import os
import re

from app.database import get_db
from app.agents import get_insight
from app.models.conversation import Conversation

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

# TODO: Add authentication and get tenant_id from token
CURRENT_TENANT_ID = 1


class ChatMessage(BaseModel):
    role: str # user or assistant or system
    content: str
    timestamp: Optional[datetime] = None


class ChatRequest(BaseModel):
    message: str
    tenant_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    data: dict


@router.post("/", response_model=ChatResponse)
async def chat_with_ai(
    request: ChatRequest,
    db: Session = Depends(get_db)
):
    """Chat with AI assistant about financial data using natural language."""
    # TODO: Get tenant_id from authenticated user
    tenant_id = int(request.tenant_id) if request.tenant_id else CURRENT_TENANT_ID

    # Use InsightAgent to process the question
    insight_response = await get_insight(
        question=request.message,
        db=db,
        tenant_id=tenant_id
    )

    # Store the conversation in database
    try:
        conversation = Conversation(
            tenant_id=tenant_id,
            user_message=request.message,
            assistant_message=insight_response.answer
        )
        db.add(conversation)
        db.commit()

        # Optional: Enforce size-based limit (keep last 5000 messages)
        # This could be done here or via scheduled job
        # prune_old_conversations(db, tenant_id, max_messages=5000)

    except Exception as e:
        # Log error but don't fail the request
        print(f"Error storing conversation: {e}")

    return ChatResponse(
        answer=insight_response.answer,
        data=insight_response.data
    )


# Additional endpoints preserved for future use
class AskDocumentRequest(BaseModel):
    document_id: int
    question: str
    tenant_id: Optional[str] = None


@router.post("/ask-about-document")
async def ask_about_document(
    request: AskDocumentRequest,
    db: Session = Depends(get_db)
):
    """Ask specific questions about a document using AI."""
    from app.mcp_tools.ocr import OCRTool
    from app.models.document import Document

    # Get tenant_id
    tenant_id = int(request.tenant_id) if request.tenant_id else CURRENT_TENANT_ID

    # Retrieve the document
    document = db.query(Document).filter(
        Document.id == request.document_id,
        Document.tenant_id == tenant_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail=f"Document {request.document_id} not found for tenant {tenant_id}"
        )

    if not os.path.exists(document.file_path):
        raise HTTPException(
            status_code=404,
            detail=f"Document file not found at path: {document.file_path}"
        )

    try:
        # Step 1: Extract text from document using OCR
        ocr_result = OCRTool.run({
            "file_path": document.file_path,
            "file_type": document.file_type
        })

        if not ocr_result or not ocr_result.get("text"):
            raise HTTPException(
                status_code=500,
                detail="Failed to extract text from document"
            )

        extracted_text = ocr_result["text"]
        confidence = ocr_result.get("confidence", 0.0)

        # Step 2: Use insight agent to analyze the document and answer the question
        # Create a combined prompt with the extracted text and the user's question
        analysis_prompt = f"""
You are analyzing a document for a user. Here is the extracted text from the document:

--- DOCUMENT CONTENT ---
{extracted_text[:4000]}  # Limit to first 4000 chars to avoid token limits
--- END DOCUMENT CONTENT ---

The user asks: "{request.question}"

Please analyze the document content and provide a clear, specific answer to the user's question.
If the document contains financial information (amounts, dates, vendors, etc.), identify and extract the relevant details.
If the information is not found in the document, state that clearly.

Your response should be factual and based only on the document content provided.
"""

        # Get insight from the document analysis
        insight_response = await get_insight(
            question=analysis_prompt,
            db=db,
            tenant_id=tenant_id
        )

        # Extract relevant text snippets (approximate approach)
        # For simplicity, we'll use text segments containing keywords from the question
        import re
        question_keywords = re.findall(r'\b\w{3,}\b', request.question.lower())
        relevant_text = []

        # Find text segments containing question keywords
        text_lines = extracted_text.split('\n')
        for line in text_lines:
            line_lower = line.lower()
            if any(keyword in line_lower for keyword in question_keywords[:5]):  # Top 5 keywords
                stripped = line.strip()
                if stripped and len(stripped) > 10:  # Filter out empty or very short lines
                    relevant_text.append(stripped)

        # Limit to top 5 most relevant snippets
        relevant_text = relevant_text[:5]

        return {
            "answer": insight_response.answer,
            "confidence": round(confidence, 2),
            "relevant_text": relevant_text,
            "document_id": request.document_id,
            "document_type": document.document_type,
            "document_status": document.status
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing document: {str(e)}"
        )


@router.post("/analyze-trends")
async def analyze_trends(
    timeframe: str = "month",
    focus: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Ask AI to analyze spending trends and patterns."""
    from datetime import datetime, timedelta

    tenant_id = CURRENT_TENANT_ID

    # Calculate date range based on timeframe
    today = datetime.now().date()

    if timeframe == "week":
        start_date = today - timedelta(weeks=1)
        date_description = "past week"
    elif timeframe == "year":
        start_date = today.replace(day=1, month=1)
        date_description = "year to date"
    else:  # month
        start_date = today.replace(day=1)
        date_description = "this month"

# Build natural language prompt for insight agent
    trend_analysis_prompt = f"""
Analyze the financial trends and spending patterns for the {date_description}.

Focus area: {focus if focus else "all categories"}

Please provide:
1. Key insights about spending trends (increases, decreases, patterns)
2. Notable changes compared to previous periods
3. Category analysis - which categories had unusual patterns
4. Specific vendor recommendations if applicable
5. Actionable recommendations

Format your response as a clear analysis with bullet points.
Make specific claims with data rather than generic statements.
"""

    # Get insight from the AI agent with database context
    insight_response = await get_insight(
        question=trend_analysis_prompt,
        db=db,
        tenant_id=tenant_id
    )

    # Determine appropriate visualization based on focus and timeframe
    visualization_suggestion = "line_chart"  # default

    if focus and ("category" in focus.lower() or "vendor" in focus.lower()):
        visualization_suggestion = "bar_chart"
    elif timeframe == "week":
        visualization_suggestion = "daily_bar_chart"
    elif "compare" in insight_response.answer.lower() or "vs" in insight_response.answer.lower():
        visualization_suggestion = "comparison_chart"

    return {
        "analysis": f"Trend analysis for {date_description}",
        "insights": insight_response.answer,
        "focus": focus,
        "timeframe": timeframe,
        "date_range": {
            "start": start_date.isoformat(),
            "end": today.isoformat()
        },
        "visualization_suggestion": visualization_suggestion
    }


@router.get("/conversation-history")
async def get_conversation_history(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get recent chat conversation history."""
    tenant_id = CURRENT_TENANT_ID

    # Query conversations from database ordered by timestamp
    conversations = db.query(Conversation).filter(
        Conversation.tenant_id == tenant_id
    ).order_by(Conversation.created_at.desc()).limit(limit).all()

    # Return actual data from database
    return {
        "conversations": [
            {
                "id": conv.id,
                "messages": [
                    {
                        "role": "user",
                        "content": conv.user_message,
                        "timestamp": conv.created_at
                    },
                    {
                        "role": "assistant",
                        "content": conv.assistant_message,
                        "timestamp": conv.created_at
                    }
                ]
            }
            for conv in reversed(conversations)  # Chronological order
        ]
    }
