from decimal import Decimal
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Float, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    date = Column(Date, nullable=False)
    description = Column(String(500), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="NGN")
    type = Column(String(10), nullable=False)  # income/expense
    category = Column(String(100), nullable=True)
    vendor = Column(String(200), nullable=True)
    reference = Column(String(200), nullable=True)
    confidence = Column(Float, nullable=True)  # AI extraction confidence score
    classification_reasoning = Column(String(1000), nullable=True)  # Explanation of income/expense classification
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    document = relationship("Document", back_populates="transactions")

    def __repr__(self):
        return f"<Transaction(id={self.id}, type='{self.type}', amount={self.amount}, date='{self.date}')>"
