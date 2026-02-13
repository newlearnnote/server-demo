"""
Chat Schemas

채팅 관련 요청/응답 스키마
"""

from pydantic import Field
from typing import Optional
from datetime import datetime
from app.schemas.common import CamelCaseModel


class ChatUpdate(CamelCaseModel):
    """
    채팅 수정 요청 스키마
    """
    title: Optional[str] = Field(None, min_length=1, max_length=100, description="채팅 제목")
    category_id: Optional[str] = Field(None, description="카테고리 ID")


class CategorySimple(CamelCaseModel):
    """
    카테고리 간단 정보 (Chat 응답용)
    """
    id: str
    name: str


class DocumentSimple(CamelCaseModel):
    """
    문서 간단 정보 (Chat 상세 응답용)
    """
    id: str
    filename: str
    file_type: str
    file_size: int
    status: str
    added_at: datetime


class ChatResponse(CamelCaseModel):
    """
    채팅 응답 스키마 (목록용)
    """
    id: str
    title: str
    user_id: str
    category: Optional[CategorySimple]
    document_count: int
    last_message_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ChatDetail(CamelCaseModel):
    """
    채팅 상세 응답 스키마 (문서 목록 포함)
    """
    id: str
    title: str
    user_id: str
    category: Optional[CategorySimple]
    documents: list[DocumentSimple]
    last_message_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
