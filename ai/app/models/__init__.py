"""
Models Package

SQLAlchemy ORM 모델을 포함합니다.
"""

from datetime import datetime
from ulid import ULID
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional

from app.database import Base
from app.config import Settings

# 환경변수에서 스키마 로드
_settings = Settings()
DB_SCHEMA = _settings.DB_SCHEMA


def generate_ulid() -> str:
    """ULID 생성 함수"""
    return str(ULID())


class TimestampMixin:
    """
    타임스탬프 믹스인

    createdAt, updatedAt, deletedAt 필드를 제공합니다.
    """
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ULIDMixin:
    """
    ULID 믹스인

    ULID 기본 키를 제공합니다.
    """
    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)


class BaseModel(Base, ULIDMixin, TimestampMixin):
    """
    공통 Base 모델

    모든 ORM 모델의 기본 클래스입니다.
    ULID 기본 키와 타임스탬프 필드를 포함합니다.
    """
    __abstract__ = True
    __table_args__ = {"schema": DB_SCHEMA}


# 모든 모델을 import (테이블 생성 시 필요)
from app.models.category import Category
from app.models.chat import Chat
from app.models.document import Document
from app.models.chat_document import ChatDocument
from app.models.message import Message


__all__ = [
    "Base",
    "BaseModel",
    "ULIDMixin",
    "TimestampMixin",
    "generate_ulid",
    "Category",
    "Chat",
    "Document",
    "ChatDocument",
    "Message",
]
