#!/usr/bin/env python3
"""Script to update the parsing agent with smarter classification logic."""

import re

# Read the current parsing.py file
with open('/workspaces/agentic_storekeeper_backend/app/agents/parsing.py', 'r') as f:
    content = f.read()

# 1. Add classification_reasoning to ParsedTransaction model
old_model = '''class ParsedTransaction(BaseModel):
    date: Optional[str]
    description: str
    amount: Optional[float]
    type: Optional[str] # income or expense
    currency: str = "NGN"
    vendor: Optional[str]
    category: Optional[str]
    reference: Optional[str]
    line_items: Optional[List[Dict[str, Any]]]
    total_amount: Optional[float]
    confidence: float'''

new_model = '''class ParsedTransaction(BaseModel):
    date: Optional[str]
    description: str
    amount: Optional[float]
    type: Optional[str]  # income or expense
    currency: str = "NGN"
    vendor: Optional[str]
    category: Optional[str]
    reference: Optional[str]
    line_items: Optional[List[Dict[str, Any]]]
    total_amount: Optional[float]
    confidence: float
    classification_reasoning: Optional[str] = None'''

content = content.replace(old_model, new_model)

# 2. Update the system prompt with smarter classification logic
old_prompt = '''"""You are a financial document parsing expert. Extract structured transaction data from the OCR text of a {document_type}.

Extract the following information:
1. Date(s) of transaction(s) in YYYY-MM-DD format
2. Description of each transaction
3. Amount(s) as positive numbers (money amount without signs)
4. Transaction type (income or expense) based on context and description
5. Vendor/merchant name
6. Category (e.g., rent, fuel, office_supplies, payroll, utilities, client_payment, service_revenue)
7. Reference/invoice numbers
8. Individual line items if present
9. Total amount

CRITICAL: Determine transaction type by analyzing context:
- **income**: client payments, revenue, sales, money coming IN, deposits (e.g., "Client Payment - DataPro Ltd")
- **expense**: purchases, payments to vendors, money going OUT, withdrawals (e.g., "Office Supplies Purchase")'''

new_prompt = f"""You are a financial document parsing expert. Extract structured transaction data from the OCR text of a {{document_type}}.

Extract the following information:
1. Date(s) of transaction(s) in YYYY-MM-DD format
2. Description of each transaction
3. Amount(s) as positive numbers (money amount without signs)
4. Transaction type (income or expense) - use INTELLIGENT ANALYSIS
5. Vendor/merchant name
6. Category (e.g., rent, fuel, office_supplies, payroll, utilities, client_payment, service_revenue)
7. Reference/invoice numbers
8. Individual line items if present
9. Total amount

CRITICAL: Determine transaction type by INTELLIGENT ANALYSIS, not simple keyword matching:

1. **USE DOCUMENT TYPE CONTEXT**: This is a {{document_type}} document, which provides crucial baseline information:
   - Receipts are typically EXPENSES (money the document owner spent)
   - Sales invoices are typically INCOME (money the document owner received)
   - Supplier invoices are typically EXPENSES (money the document owner owes/paid)
   - Bank statements are MIXED (require structure analysis)
   - Mixed documents require analysis of each transaction individually

2. **ANALYZE DOCUMENT STRUCTURE**: Look for column headers and patterns that indicate money direction:
   - Debit/Credit columns: Debit = money going OUT (expense), Credit = money coming IN (income)
   - Dr/Cr notation: Dr = expense, Cr = income
   - Withdrawal/Deposit columns: Withdrawal = expense, Deposit = income
   - +/- signs: Typically - means expense/withdrawal, + means income/deposit
   - In/Out columns: Out = expense, In = income
   - Payment/Receipt columns: Payment = expense, Receipt = income

3. **UNDERSTAND PERSPECTIVE**: Identify who is the DOCUMENT OWNER (who this document belongs to):
   - Money flowing OUT from the document owner = EXPENSE
   - Money flowing IN to the document owner = INCOME
   - Look for "Bill To:" or "Invoice To:" - if it shows your company's name, you're paying = EXPENSE
   - Look for "From:" or "Received From:" - if it shows your company's name, you're receiving = INCOME
   - Example: "Bill To: Frenzy Digital Agency" means Frenzy is paying = EXPENSE for Frenzy
   - Example: "From: ABC Corp" with payment to you = INCOME for your company

4. **HANDLE EDGE CASES INTELLIGENTLY**:
   - **Refunds**: Money received back for a previous expense = INCOME (even though it references a past expense)
   - **Reversals**: Cancelled transactions - analyze the net effect on your cash flow
   - **Chargebacks**: Money returned to customer = EXPENSE (money leaving your account)
   - **VAT Credits**: Tax refunds = INCOME
   - **Discounts Received**: Reduces expense amount but doesn't change the transaction type
   - **Discounts Given**: Reduces income amount but doesn't change the transaction type

5. **COMPLEX SCENARIOS - MULTIPLE INDICATORS**:
   - Use the DOCUMENT TYPE as the baseline assumption
   - Override based on STRUCTURAL evidence (Debit/Credit columns are highly reliable)
   - Override based on PERSPECTIVE indicators if clear
   - If evidence is contradictory or ambiguous, lower confidence (see below)

6. **CONFIDENCE SCORING**:
   - 0.9-1.0: High confidence - document type + structure + perspective all align
   - 0.7-0.89: Good confidence - clear indicators from at least two sources
   - 0.5-0.69: Moderate confidence - based on single strong indicator or multiple weak indicators
   - Below 0.7: When indicators contradict or are ambiguous

7. **FLAGGING FOR REVIEW**:
   - When confidence is below 0.7, add "[REVIEW NEEDED]" to the description
   - Set confidence below 0.5 for highly uncertain classifications
   - Do this when: document structure is unclear, perspective is ambiguous, or edge cases are detected without clear context

MOST IMPORTANT: In your response, include a "classification_reasoning" field that explains WHY you classified each transaction as income or expense. Your reasoning should reference the specific evidence you used (document type, structural indicators, perspective clues, or edge case handling).

Example reasoning: "Classified as expense because this is a receipt document showing payment to a vendor, with 'Bill To' showing our company name, and the amount in a 'Debit' column."

Respond with a JSON object in this format:
{{
  "transactions": [{{
    "date": "YYYY-MM-DD",
    "description": "string",
    "amount": 0.0,
    "type": "income|expense",
    "currency": "NGN",
    "vendor": "string",
    "category": "string",
    "reference": "string",
    "line_items": [{{"item": "string", "quantity": 1, "price": 0.0}}],
    "total_amount": 0.0,
    "confidence": 0.0,
    "classification_reasoning": "string"
  }}],
  "document_summary": {{
    "total_transactions": 0,
    "total_amount": 0.0,
    "vendor": "string",
    "date_range": {{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}}
  }}
}}"""

content = content.replace(old_prompt, new_prompt)

# 3. Fix the hardcoded transaction type in the return statement
content = re.sub(
    r'"type": "income\|expense",',
    '"type": transaction.type,',
    content
)

# Write the updated content
with open('/workspaces/agentic_storekeeper_backend/app/agents/parsing.py', 'w') as f:
    f.write(content)

print("Successfully updated parsing.py")
