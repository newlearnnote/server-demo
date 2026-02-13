"""
MessageDocument Model

메시지-문서 연결 테이블 ORM 모델
"""

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from app.models import BaseModel, DB_SCHEMA

if TYPE_CHECKING:
    from app.models.message import Message
    from app.models.document import Document


class MessageDocument(BaseModel):
    """
    메시지-문서 연결 모델

    각 메시지에 첨부된 문서를 추적
    """
    __tablename__ = "message_documents"

    # Fields
    messageId: Mapped[str] = mapped_column(String(26), ForeignKey(f"{DB_SCHEMA}.messages.id", ondelete="CASCADE"))
    documentId: Mapped[str] = mapped_column(String(26), ForeignKey(f"{DB_SCHEMA}.documents.id", ondelete="CASCADE"))

    # Relationships
    message: Mapped["Message"] = relationship(back_populates="messageDocuments")
    document: Mapped["Document"] = relationship(back_populates="messageDocuments")
