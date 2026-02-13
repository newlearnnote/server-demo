"""
Chat Model

채팅 테이블 ORM 모델
"""

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, TYPE_CHECKING

from app.models import BaseModel, DB_SCHEMA

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.message import Message
    from app.models.chat_document import ChatDocument


class Chat(BaseModel):
    """
    채팅 모델

    문서 기반 대화 세션
    """
    __tablename__ = "chats"

    # Fields
    userId: Mapped[Optional[str]] = mapped_column(String(26), nullable=True)
    categoryId: Mapped[Optional[str]] = mapped_column(String(26), ForeignKey(f"{DB_SCHEMA}.categories.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(100))

    # Relationships
    category: Mapped[Optional["Category"]] = relationship(back_populates="chats", lazy="selectin")
    messages: Mapped[list["Message"]] = relationship(back_populates="chat", lazy="selectin", cascade="all, delete-orphan")
    chatDocuments: Mapped[list["ChatDocument"]] = relationship(back_populates="chat", lazy="selectin", cascade="all, delete-orphan")
