"""
Category Service

카테고리 관련 비즈니스 로직
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import String, select, func, and_
from fastapi import HTTPException, status

from app.models.category import Category
from app.models.chat import Chat
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryDetail,
    ChatSummary
)
class CategoryService:
    """
    카테고리 비즈니스 로직 처리 서비스
    """

    @staticmethod
    async def validate_category_ownership(
        db: AsyncSession,
        category_id: str,
        user_id: str
    ) -> Category:
        """
        카테고리 소유권 검증 (유틸리티 메서드)

        Args:
            db: 데이터베이스 세션
            category_id: 카테고리 ID
            user_id: 사용자 ID

        Returns:
            Category: 검증된 카테고리 객체

        Raises:
            HTTPException: 카테고리를 찾을 수 없거나 소유자가 아닌 경우 (404)
        """
        query = select(Category).where(
            and_(
                Category.id == category_id,
                Category.deletedAt.is_(None)
            )
        )
        result = await db.execute(query)
        category = result.scalar_one_or_none()

        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found."
            )

        if category.userId != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found._."
            )

        return category

    @staticmethod
    async def get_categories(
        db: AsyncSession,
        page: int,
        limit: int,
        user_id: str
    ) -> list[CategoryResponse]:
        """
        카테고리 목록 조회

        Args:
            db: 데이터베이스 세션
            page: 페이지 번호
            limit: 페이지당 개수

        Returns:
            list[CategoryResponse]: 카테고리 목록
        """

        # 페이지네이션 계산
        offset = (page - 1) * limit

        # 카테고리 목록 조회 (채팅 개수 포함)
        query = (
            select(
                Category,
                func.count(func.distinct(Category.chats)).label("chatCount")
            )
            .outerjoin(Category.chats)
            .where(
                and_(
                    Category.deletedAt.is_(None),
                    Category.userId == user_id
                )
            )
            .group_by(Category.id)
            .order_by(Category.createdAt.desc())
            .offset(offset)
            .limit(limit)
        )

        result = await db.execute(query)
        rows = result.all()

        # 응답 생성
        return [
            CategoryResponse(
                id=category.id,
                name=category.name,
                user_id=category.userId,
                description=category.description,
                chat_count=chat_count,
                created_at=category.createdAt,
                updated_at=category.updatedAt
            )
            for category, chat_count in rows
        ]

    @staticmethod
    async def create_category(
        db: AsyncSession,
        category_data: CategoryCreate,
        user_id: str
    ) -> CategoryResponse:
        """
        카테고리 생성

        Args:
            db: 데이터베이스 세션
            category_data: 카테고리 생성 데이터

        Returns:
            CategoryResponse: 생성된 카테고리 정보

        Raises:
            HTTPException: 중복된 이름이 존재하는 경우
        """
        # 중복 확인
        existing_query = select(Category).where(
            and_(
                Category.name == category_data.name,
                Category.deletedAt.is_(None),
                Category.userId == user_id,
            )
        )
        result = await db.execute(existing_query)
        existing = result.scalar_one_or_none()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Category '{category_data.name}' already exists."
            )

        # 카테고리 생성
        new_category = Category(
            name=category_data.name,
            userId=user_id,
            description=category_data.description
        )

        db.add(new_category)
        await db.commit()
        await db.refresh(new_category)

        # 응답 생성
        return CategoryResponse(
            id=new_category.id,
            name=new_category.name,
            user_id=new_category.userId,
            description=new_category.description,
            chat_count=0,
            created_at=new_category.createdAt,
            updated_at=new_category.updatedAt
        )

    @staticmethod
    async def get_category_by_id(
        db: AsyncSession,
        category_id: str,
        user_id: str
    ) -> CategoryDetail:
        """
        카테고리 상세 조회

        Args:
            db: 데이터베이스 세션
            category_id: 카테고리 ID

        Returns:
            CategoryDetail: 카테고리 상세 정보 (채팅 목록 포함)

        Raises:
            HTTPException: 카테고리를 찾을 수 없는 경우
        """
        # 카테고리 소유권 검증
        category = await CategoryService.validate_category_ownership(db, category_id, user_id)

        # 채팅 목록 조회 (삭제되지 않은 것만)
        chats = [
            ChatSummary(
                id=chat.id,
                title=chat.title,
                created_at=chat.createdAt
            )
            for chat in category.chats
            if chat.deletedAt is None
        ]

        # 응답 생성
        return CategoryDetail(
            id=category.id,
            name=category.name,
            user_id=category.userId,
            description=category.description,
            chat_count=len(chats),
            chats=chats,
            created_at=category.createdAt,
            updated_at=category.updatedAt
        )

    @staticmethod
    async def update_category(
        db: AsyncSession,
        category_id: str,
        category_data: CategoryUpdate,
        user_id: str
    ) -> CategoryResponse:
        """
        카테고리 수정

        Args:
            db: 데이터베이스 세션
            category_id: 카테고리 ID
            category_data: 수정할 데이터

        Returns:
            CategoryResponse: 수정된 카테고리 정보

        Raises:
            HTTPException: 카테고리를 찾을 수 없거나 중복된 이름인 경우
        """
        # 카테고리 소유권 검증
        category = await CategoryService.validate_category_ownership(db, category_id, user_id)

        # 이름 중복 확인 (수정하려는 이름이 있을 경우)
        if category_data.name:
            existing_query = select(Category).where(
                and_(
                    Category.name == category_data.name,
                    Category.id != category_id, # 자기 자신 제외(자기 자신과 이름이 같을 수 있음)
                    Category.userId == user_id,
                    Category.deletedAt.is_(None)
                )
            )
            existing_result = await db.execute(existing_query)
            existing = existing_result.scalar_one_or_none()

            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Category name '{category_data.name}' already exists."
                )

        # .model_dump(exclude_unset=True)로 Pydantic 모델에서 설정된 필드만 딕셔너리로 반환
        update_data = category_data.model_dump(exclude_unset=True)

        # 수정할 데이터만 업데이트
        if update_data:
            for field, value in update_data.items():
                # category 인스턴스의 field를 value로 설정
                setattr(category, field, value)

            category.updatedAt = datetime.utcnow()
            await db.commit()
            await db.refresh(category)

        # 채팅 개수 조회 (쿼리 최적화)
        chat_count_query = select(func.count(Chat.id)).where(
            and_(
                Chat.categoryId == category_id,
                Chat.deletedAt.is_(None)
            )
        )
        chat_count_result = await db.execute(chat_count_query)
        chat_count = chat_count_result.scalar() or 0

        # 응답 생성
        return CategoryResponse(
            id=category.id,
            name=category.name,
            user_id=category.userId,
            description=category.description,
            chat_count=chat_count,
            created_at=category.createdAt,
            updated_at=category.updatedAt
        )

    @staticmethod
    async def delete_category(
        db: AsyncSession,
        category_id: str,
        user_id: str
    ) -> dict:
        """
        카테고리 삭제 (Soft Delete) - 해당 카테고리의 모든 채팅도 함께 삭제

        Args:
            db: 데이터베이스 세션
            category_id: 카테고리 ID
            user_id: 사용자 ID

        Returns:
            dict: 삭제 결과

        Raises:
            HTTPException: 카테고리를 찾을 수 없는 경우
        """
        # 카테고리 소유권 검증
        category = await CategoryService.validate_category_ownership(db, category_id, user_id)

        now = datetime.utcnow()

        # 트랜잭션으로 카테고리와 해당 카테고리의 모든 채팅 삭제
        # Soft Delete: 카테고리
        category.deletedAt = now

        # Soft Delete: 카테고리에 속한 모든 채팅 (삭제되지 않은 채팅만)
        deleted_chat_count = 0
        for chat in category.chats:
            if chat.deletedAt is None:
                chat.deletedAt = now
                deleted_chat_count += 1

        await db.commit()

        # 응답 생성
        return {
            "id": str(category_id),
            "message": "Successfully deleted.",
            "deleted_at": category.deletedAt.isoformat(),
            "deleted_chat_count": deleted_chat_count
        }
