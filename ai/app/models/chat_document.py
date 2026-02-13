"""
ChatDocument Model

채팅-문서 연결 테이블 ORM 모델 (M:N 관계)
"""

from sqlalchemy import String, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import TYPE_CHECKING

from app.models import BaseModel, DB_SCHEMA

if TYPE_CHECKING:
    from app.models.chat import Chat
    from app.models.document import Document


class ChatDocument(BaseModel):
    """
    채팅-문서 연결 모델
    
    채팅과 문서의 M:N 관계를 관리
    """
    __tablename__ = "chat_documents"
    
    # Fields
    chatId: Mapped[str] = mapped_column(String(26), ForeignKey(f"{DB_SCHEMA}.chats.id", ondelete="CASCADE"))
    documentId: Mapped[str] = mapped_column(String(26), ForeignKey(f"{DB_SCHEMA}.documents.id", ondelete="CASCADE"))
    addedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    chat: Mapped["Chat"] = relationship(back_populates="chatDocuments")
    document: Mapped["Document"] = relationship(back_populates="chatDocuments")