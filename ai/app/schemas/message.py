"""
Message Schemas

메시지 관련 요청/응답 스키마
"""

from pydantic import Field
from typing import Optional
from datetime import datetime
from app.schemas.common import CamelCaseModel


class SourceInfo(CamelCaseModel):
    """
    출처 정보 스키마 (RAG 소스)
    """
    document_id: str
    document_name: str
    chunk_id: str
    page: Optional[int] = None
    similarity: float
    content_preview: str


class DocumentAttachment(CamelCaseModel):
    """
    문서 첨부 정보
    """
    id: str
    filename: str


class MessageCreate(CamelCaseModel):
    """
    메시지 생성 요청 스키마
    """
    content: str = Field(..., min_length=1, max_length=2000, description="메시지 내용")
    chat_id: Optional[str] = Field(None, description="채팅 ID (null이면 새 채팅 생성)")
    document_ids: Optional[list[str]] = Field(None, description="문서 ID 리스트 (모든 메시지에서 사용 가능)")
    category_id: Optional[str] = Field(None, description="카테고리 ID (새 채팅 생성 시에만 사용)")
    user_id: str = Field(default="default-user", description="사용자 ID")


class MessageResponse(CamelCaseModel):
    """
    메시지 응답 스키마
    """
    id: str
    chat_id: str
    role: str
    content: str
    attached_documents: list[DocumentAttachment] = []
    sources: Optional[list[SourceInfo]] = None
    created_at: datetime


class ChatCreateInfo(CamelCaseModel):
    """
    채팅 생성 정보 (메시지 생성 시 반환)
    """
    id: str
    title: str
    category: Optional[dict] = None  # {"id": str, "name": str}
    documents: list[dict] = []  # [{"id": str, "filename": str}]
    created_at: datetime


class MessageCreateResponse(CamelCaseModel):
    """
    메시지 생성 응답 스키마 (새 채팅 생성 시)
    """
    chat: Optional[ChatCreateInfo] = None
    user_message: MessageResponse
    assistant_message: MessageResponse
