"""
RAG chat endpoint: POST /chat
"""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import get_current_user
from app.db.models import User
from app.rag_engine import chat

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    query: str
    run_id: Optional[int] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]


@router.post("", response_model=ChatResponse)
def ask(body: ChatRequest, current_user: User = Depends(get_current_user)):
    result = chat(query=body.query, run_id=body.run_id)
    return ChatResponse(**result)
