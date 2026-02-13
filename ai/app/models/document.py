"""
Document Model

문서 테이블 ORM 모델
"""

from sqlalchemy import String, Integer, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, TYPE_CHECKING
import enum

from app.models import BaseModel, DB_SCHEMA

if TYPE_CHECKING:
    from app.models.chat_document import ChatDocument
    from app.models.message_document import MessageDocument


class FileType(str, enum.Enum):
    """파일 타입 Enum"""
    PDF = "pdf"
    MARKDOWN = "md"
    TEXT = "txt"


class DocumentStatus(str, enum.Enum):
    """문서 처리 상태 Enum"""
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Document(BaseModel):
    """
    문서 모델

    업로드된 파일 메타데이터
    """
    __tablename__ = "documents"

    # Fields
    userId: Mapped[Optional[str]] = mapped_column(String(26), nullable=True)
    filename: Mapped[str] = mapped_column(String(255))
    filePath: Mapped[str] = mapped_column(String(500))
    fileType: Mapped[FileType] = mapped_column(SQLEnum(FileType, name="file_type_enum", schema=DB_SCHEMA))
    fileSize: Mapped[int] = mapped_column(Integer)
    status: Mapped[DocumentStatus] = mapped_column(SQLEnum(DocumentStatus, name="document_status_enum", schema=DB_SCHEMA), default=DocumentStatus.PROCESSING)
    chunkCount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)

    # Relationships
    chatDocuments: Mapped[list["ChatDocument"]] = relationship(back_populates="document", lazy="selectin", cascade="all, delete-orphan")
    messageDocuments: Mapped[list["MessageDocument"]] = relationship(back_populates="document", cascade="all, delete-orphan")
