from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict


class TransactionBase(BaseModel):
    date: date
    description: str
    amount: Decimal
    currency: str = "NGN"
    type: str  # income/expense
    category: Optional[str] = None
    vendor: Optional[str] = None
    reference: Optional[str] = None
    confidence: Optional[float] = None
    classification_reasoning: Optional[str] = None


class TransactionCreate(TransactionBase):
    tenant_id: int
    document_id: Optional[int] = None


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    vendor: Optional[str] = None
    reference: Optional[str] = None
    classification_reasoning: Optional[str] = None
    confidence: Optional[float] = None


class TransactionResponse(TransactionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    document_id: Optional[int] = None
    created_at: datetime


class TransactionSummary(BaseModel):
    total_income: Decimal
    total_expense: Decimal
    net_flow: Decimal
    count: int
