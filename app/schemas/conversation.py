from datetime import datetime
from typing import List
from pydantic import BaseModel, ConfigDict


class ConversationBase(BaseModel):
    user_message: str
    assistant_message: str


class ConversationCreate(ConversationBase):
    tenant_id: int


class ConversationResponse(ConversationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    created_at: datetime


class ConversationList(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: List[ConversationResponse]
    total: int
    limit: int
