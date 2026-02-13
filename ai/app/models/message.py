"""
Message Model

메시지 테이블 ORM 모델
"""

from sqlalchemy import String, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, TYPE_CHECKING
import enum

from app.models import BaseModel, DB_SCHEMA

if TYPE_CHECKING:
    from app.models.chat import Chat
    from app.models.message_document import MessageDocument


class MessageRole(str, enum.Enum):
    """메시지 역할 Enum"""
    USER = "user"
    ASSISTANT = "assistant"


class Message(BaseModel):
    """
    메시지 모델

    채팅의 대화 메시지 (사용자 질문 + AI 응답)
    """
    __tablename__ = "messages"

    # Fields
    chatId: Mapped[str] = mapped_column(String(26), ForeignKey(f"{DB_SCHEMA}.chats.id", ondelete="CASCADE"))
    role: Mapped[MessageRole] = mapped_column(SQLEnum(MessageRole, name="message_role_enum", schema=DB_SCHEMA))
    content: Mapped[str] = mapped_column(Text)
    sources: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Relationships
    chat: Mapped["Chat"] = relationship(back_populates="messages")
    messageDocuments: Mapped[list["MessageDocument"]] = relationship(back_populates="message", cascade="all, delete-orphan")
