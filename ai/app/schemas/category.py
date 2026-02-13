"""
Category Schemas

카테고리 관련 요청/응답 스키마
"""

from pydantic import Field
from typing import Optional
from datetime import datetime

from app.schemas.common import CamelCaseModel


class CategoryCreate(CamelCaseModel):
    """
    카테고리 생성 요청 스키마
    """
    name: str = Field(..., min_length=1, max_length=50, description="카테고리 이름")
    description: Optional[str] = Field(None, max_length=200, description="카테고리 설명")


class CategoryUpdate(CamelCaseModel):
    """
    카테고리 수정 요청 스키마
    """
    name: Optional[str] = Field(None, min_length=1, max_length=50, description="카테고리 이름")
    description: Optional[str] = Field(None, max_length=200, description="카테고리 설명")


class CategoryResponse(CamelCaseModel):
    """
    카테고리 응답 스키마
    """
    id: str
    name: str
    user_id: str
    description: Optional[str]
    chat_count: int = 0
    created_at: datetime
    updated_at: datetime


class CategoryDetail(CamelCaseModel):
    """
    카테고리 상세 응답 스키마 (채팅 목록 포함)
    """
    id: str
    name: str
    user_id: str
    description: Optional[str]
    chat_count: int
    chats: list["ChatSummary"]
    created_at: datetime
    updated_at: datetime


class ChatSummary(CamelCaseModel):
    """
    채팅 요약 정보 (카테고리 상세에서 사용)
    """
    id: str
    title: str
    created_at: datetime
