"""Parsing Agent for extracting structured transaction data."""

import json
from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel
from decimal import Decimal
from app.config import client, settings


class ParsedTransaction(BaseModel):
    date: Optional[str]
    description: str
    amount: Optional[float]
    currency: str = "NGN"
    type: Literal["income", "expense"]
    vendor: Optional[str]
    category: Optional[str]
    reference: Optional[str]
    line_items: Optional[List[Dict[str, Any]]]
    total_amount: Optional[float]
    confidence: float
    classification_reasoning: Optional[str] = None


class ParsedTransactionResponse(BaseModel):
    transactions: List[ParsedTransaction]
    document_summary: Dict[str, Any]


def parse_transactions(ocr_text: str, document_type: str) -> Dict[str, Any]:
    """
    Parse structured transaction data from OCR text and document type.

    Args:
        ocr_text: Extracted text from OCR
        document_type: Type of document from classification

    Returns:
        Dict with parsed transaction(s) data
    """
    system_prompt = f"""You are a financial document parsing expert. Extract structured transaction data from the OCR text of a {document_type}.

Extract the following information:
1. Date(s) of transaction(s) in YYYY-MM-DD format
2. Description of each transaction
3. Amount(s) as positive numbers (never negative)
4. Type: "income" or "expense" (see classification rules below)
5. Vendor/merchant name
6. Category (rent, fuel, office_supplies, payroll, utilities, subscriptions, insurance, travel, meals, maintenance, marketing, professional_services, equipment, shipping, training, client_payment, refund, miscellaneous)
7. Reference/invoice numbers
8. Individual line items if present
9. Total amount
10. Classification reasoning: a brief explanation of why this transaction is income or expense

INCOME vs EXPENSE CLASSIFICATION RULES:

DOCUMENT TYPE BASELINE:
- receipt → always expense (you bought something)
- supplier invoice (billed TO you) → expense
- sales invoice (you billing a client) → income
- bank_statement / credit_card_statement → analyze each transaction individually

FOR BANK STATEMENTS, analyze the document structure:
- Look for column headers: Debit/Credit, Dr/Cr, Withdrawal/Deposit, +/-
- Amounts in Debit/Withdrawal/Dr column → expense
- Amounts in Credit/Deposit/Cr column → income
- Words like "payment received", "deposit", "inflow", "credit alert", "transfer in", "credit" → income
- Words like "purchase", "payment to", "debit", "withdrawal", "salary payment", "bill", "subscription" → expense

PERSPECTIVE: You are extracting from the account owner's perspective. Money flowing IN to the account = income. Money flowing OUT of the account = expense.

EDGE CASES:
- Refunds received → income (money coming back)
- Chargebacks → income
- Reversals → opposite of original transaction
- Bank charges → expense

If uncertain about income/expense classification, set confidence below 0.7 and add "[REVIEW NEEDED]" to the description.

Respond with a JSON object in this format:
{{
  "transactions": [{{
    "date": "YYYY-MM-DD",
    "description": "string",
    "amount": 0.0,
    "currency": "NGN",
    "type": "income or expense",
    "vendor": "string",
    "category": "string",
    "reference": "string",
    "line_items": [{{"item": "string", "quantity": 1, "price": 0.0}}],
    "total_amount": 0.0,
    "confidence": 0.0,
    "classification_reasoning": "string explaining why this is income or expense"
  }}],
  "document_summary": {{
    "total_transactions": 0,
    "total_amount": 0.0,
    "total_income": 0.0,
    "total_expenses": 0.0,
    "vendor": "string",
    "date_range": {{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}}
  }}
}}

Extract all transactions found in the document. Use 0.0-1.0 confidence scores based on text clarity and completeness.
"""

    try:
        response = client.chat.completions.create(
            model=settings.ai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": ocr_text}
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )

        result = json.loads(response.choices[0].message.content)
        validated = ParsedTransactionResponse(**result)

        return {
            "success": True,
            "transactions": [
                {
                    **transaction.model_dump(),
                    "amount": float(transaction.amount or 0),
                    "total_amount": float(transaction.total_amount or 0),
                }
                for transaction in validated.transactions
            ],
            "document_summary": validated.document_summary
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Parsing failed: {str(e)}"
        }