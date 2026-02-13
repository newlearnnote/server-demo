"""
Document Schemas

문서 관련 요청/응답 스키마
"""

from pydantic import Field
from typing import Optional
from datetime import datetime
from app.schemas.common import CamelCaseModel


class DocumentUploadResponse(CamelCaseModel):
    """
    문서 업로드 응답 스키마
    """
    id: str
    filename: str
    file_path: str
    file_type: str
    file_size: int
    status: str
    created_at: datetime


class DocumentResponse(CamelCaseModel):
    """
    문서 응답 스키마 (목록용)
    """
    id: str
    filename: str
    file_type: str
    file_size: int
    status: str
    chat_count: int
    created_at: datetime
    updated_at: datetime


class ChatSimpleInfo(CamelCaseModel):
    """
    채팅 간단 정보 (Document 상세용)
    """
    id: str
    title: str
    added_at: datetime


class DocumentDetail(CamelCaseModel):
    """
    문서 상세 응답 스키마
    """
    id: str
    filename: str
    file_path: str
    file_type: str
    file_size: int
    status: str
    chunk_count: Optional[int] = None
    chats: list[ChatSimpleInfo] = []
    created_at: datetime
    updated_at: datetime


class DocumentStatusResponse(CamelCaseModel):
    """
    문서 처리 상태 응답 스키마
    """
    id: str
    status: str
    progress: Optional[int] = None
    current_step: Optional[str] = None
    estimated_time_remaining: Optional[int] = None
