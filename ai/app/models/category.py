"""
Category Model

카테고리 테이블 ORM 모델
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, TYPE_CHECKING

from app.models import BaseModel

if TYPE_CHECKING:
    from app.models.chat import Chat


class Category(BaseModel):
    """
    카테고리 모델

    채팅을 분류하기 위한 카테고리
    """
    __tablename__ = "categories"

    # Fields
    userId: Mapped[Optional[str]] = mapped_column(String(26), nullable=True)
    name: Mapped[str] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Relationships
    chats: Mapped[list["Chat"]] = relationship(back_populates="category", lazy="selectin")
