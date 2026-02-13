"""
Chat Service

채팅 관련 비즈니스 로직
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from fastapi import HTTPException, status

from app.models.chat import Chat
from app.models.category import Category
from app.models.message import Message
from app.models.chat_document import ChatDocument
from app.schemas.chat import (
    ChatUpdate,
    ChatResponse,
    ChatDetail,
    CategorySimple,
    DocumentSimple
)
from app.services.category_service import CategoryService


class ChatService:
    """
    채팅 비즈니스 로직 처리 서비스
    채팅이 없어도 빈 배열을 반환
    + 사용자 존재 여부는 NestJS API 레이어에서 처리
    """

    @staticmethod
    async def validate_chat_ownership(
        db: AsyncSession,
        chat_id: str,
        user_id: str
    ) -> Chat:
        """
        채팅 소유권 검증 (유틸리티 메서드)

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID
            user_id: 사용자 ID

        Returns:
            Chat: 검증된 채팅 객체

        Raises:
            HTTPException: 채팅을 찾을 수 없거나 소유자가 아닌 경우 (404)
        """
        query = select(Chat).where(
            and_(
                Chat.id == chat_id,
                Chat.deletedAt.is_(None)
            )
        )
        result = await db.execute(query)
        chat = result.scalar_one_or_none()

        if not chat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found."
            )

        if chat.userId != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found._."
            )

        return chat

    @staticmethod
    async def get_chats(
        db: AsyncSession,
        user_id: str,
        page: int,
        limit: int,
        category_id: Optional[str] = None
    ) -> list[ChatResponse]:
        """
        채팅 목록 조회
        - 본인 채팅만 조회 가능: 본인 여부는 NestJS API 레이어에서 처리

        Args:
            db: 데이터베이스 세션
            user_id: 사용자 ID
            page: 페이지 번호
            limit: 페이지당 개수
            category_id: 카테고리 ID (선택)

        Returns:
            list[ChatResponse]: 채팅 목록
        """
        # 페이지네이션 계산
        offset = (page - 1) * limit

        # 카테고리 필터링이 있다면 소유권 검증
        if category_id:
            await CategoryService.validate_category_ownership(db, category_id, user_id)

        # 서브쿼리: document_count
        document_count_subquery = (
            select(func.count(ChatDocument.id))
            .where(
                and_(
                    ChatDocument.chatId == Chat.id,
                    ChatDocument.deletedAt.is_(None)
                )
            )
            .correlate(Chat)
            .scalar_subquery()
        )

        # 서브쿼리: last_message_at
        last_message_at_subquery = (
            select(func.max(Message.createdAt))
            .where(
                and_(
                    Message.chatId == Chat.id,
                    Message.deletedAt.is_(None)
                )
            )
            .correlate(Chat)
            .scalar_subquery()
        )

        # 메인 쿼리
        query = (
            select(
                Chat,
                document_count_subquery.label("document_count"),
                last_message_at_subquery.label("last_message_at")
            )
            .where(
                and_(
                    Chat.deletedAt.is_(None),
                    Chat.userId == user_id,
                    # category_id가 주어지면 필터링
                    Chat.categoryId == category_id if category_id else True
                )
            )
            .order_by(Chat.updatedAt.desc())
            .offset(offset)
            .limit(limit)
        )



        result = await db.execute(query)
        rows = result.all()

        # 응답 생성
        return [
            ChatResponse(
                id=chat.id,
                title=chat.title,
                user_id=chat.userId,
                category=CategorySimple(
                    id=chat.category.id,
                    name=chat.category.name,
                ) if chat.category else None,
                document_count=document_count or 0,
                last_message_at=last_message_at,
                created_at=chat.createdAt,
                updated_at=chat.updatedAt
            )
            for chat, document_count, last_message_at in rows
        ]

    @staticmethod
    async def get_chat_by_id(
        db: AsyncSession,
        chat_id: str,
        user_id: str
    ) -> ChatDetail:
        """
        채팅 상세 조회
        없거나 권한이 없으면 HTTPException 404 발생

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID
            user_id: 사용자 ID

        Returns:
            ChatDetail: 채팅 상세 정보

        Raises:
            HTTPException: 채팅을 찾을 수 없거나 권한이 없는 경우
        """
        # 채팅 소유권 검증
        chat = await ChatService.validate_chat_ownership(db, chat_id, user_id)

        # 문서 목록 조회 (ChatDocument의 addedAt 포함)
        documents = []
        for chat_doc in chat.chatDocuments:
            if chat_doc.deletedAt is None and chat_doc.document.deletedAt is None:
                documents.append(
                    DocumentSimple(
                        id=chat_doc.document.id,
                        filename=chat_doc.document.filename,
                        file_type=chat_doc.document.fileType.value,
                        file_size=chat_doc.document.fileSize,
                        status=chat_doc.document.status.value,
                        added_at=chat_doc.addedAt
                    )
                )

        # 마지막 메시지 시간
        last_message_at_query = select(func.max(Message.createdAt)).where(
            and_(
                Message.chatId == chat_id,
                Message.deletedAt.is_(None)
            )
        )
        last_message_at_result = await db.execute(last_message_at_query)
        last_message_at = last_message_at_result.scalar()

        # 응답 생성
        return ChatDetail(
            id=chat.id,
            title=chat.title,
            user_id=chat.userId,
            category=CategorySimple(
                id=chat.category.id,
                name=chat.category.name
            ) if chat.category else None,
            documents=documents,
            last_message_at=last_message_at,
            created_at=chat.createdAt,
            updated_at=chat.updatedAt
        )

    @staticmethod
    async def update_chat(
        db: AsyncSession,
        chat_id: str,
        chat_data: ChatUpdate,
        user_id: str
    ) -> ChatResponse:
        """
        채팅 수정
        채팅이 카테고리 소속이 아니더라도 update를 통해서 카테고리 지정 가능

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID
            chat_data: 수정할 데이터
            user_id: 사용자 ID

        Returns:
            ChatResponse: 수정된 채팅 정보

        Raises:
            HTTPException: 채팅을 찾을 수 없거나 권한이 없는 경우, 카테고리를 찾을 수 없는 경우
        """
        # 채팅 소유권 검증
        chat = await ChatService.validate_chat_ownership(db, chat_id, user_id)

        # category_id가 있다면 카테고리 소유권 검증
        if chat_data.category_id is not None:
            await CategoryService.validate_category_ownership(db, chat_data.category_id, user_id)

        # .model_dump(exclude_unset=True)로 Pydantic 모델에서 설정된 필드만 딕셔너리로 반환
        update_data = chat_data.model_dump(exclude_unset=True)

        # 필드명 매핑 (Pydantic snake_case -> SQLAlchemy camelCase)
        field_mapping = {
            "category_id": "categoryId"
        }

        # 수정할 데이터만 업데이트
        if update_data:
            for field, value in update_data.items():
                # 필드명 매핑 적용
                model_field = field_mapping.get(field, field)
                setattr(chat, model_field, value)

            chat.updatedAt = datetime.utcnow()
            await db.commit()
            await db.refresh(chat)

        # document_count, message_count, last_message_at 조회
        document_count_query = select(func.count(ChatDocument.id)).where(
            and_(
                ChatDocument.chatId == chat_id,
                ChatDocument.deletedAt.is_(None)
            )
        )
        document_count_result = await db.execute(document_count_query)
        document_count = document_count_result.scalar() or 0

        message_count_query = select(func.count(Message.id)).where(
            and_(
                Message.chatId == chat_id,
                Message.deletedAt.is_(None)
            )
        )
        message_count_result = await db.execute(message_count_query)
        message_count = message_count_result.scalar() or 0

        last_message_at_query = select(func.max(Message.createdAt)).where(
            and_(
                Message.chatId == chat_id,
                Message.deletedAt.is_(None)
            )
        )
        last_message_at_result = await db.execute(last_message_at_query)
        last_message_at = last_message_at_result.scalar()

        # 응답 생성
        return ChatResponse(
            id=chat.id,
            title=chat.title,
            user_id=chat.userId,
            category=CategorySimple(
                id=chat.category.id,
                name=chat.category.name
            ) if chat.category else None,
            document_count=document_count,
            message_count=message_count,
            last_message_at=last_message_at,
            created_at=chat.createdAt,
            updated_at=chat.updatedAt
        )

    @staticmethod
    async def remove_category_from_chat(
        db: AsyncSession,
        chat_id: str,
        user_id: str
    ) -> ChatResponse:
        """
        채팅에서 카테고리 해제

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID
            user_id: 사용자 ID

        Returns:
            ChatResponse: 카테고리가 해제된 채팅 정보

        Raises:
            HTTPException: 채팅을 찾을 수 없거나 권한이 없는 경우
        """
        # 채팅 소유권 검증
        chat = await ChatService.validate_chat_ownership(db, chat_id, user_id)

        # 카테고리 해제
        chat.categoryId = None
        chat.updatedAt = datetime.utcnow()
        await db.commit()
        await db.refresh(chat)

        # document_count, message_count, last_message_at 조회
        document_count_query = select(func.count(ChatDocument.id)).where(
            and_(
                ChatDocument.chatId == chat_id,
                ChatDocument.deletedAt.is_(None)
            )
        )
        document_count_result = await db.execute(document_count_query)
        document_count = document_count_result.scalar() or 0

        message_count_query = select(func.count(Message.id)).where(
            and_(
                Message.chatId == chat_id,
                Message.deletedAt.is_(None)
            )
        )
        message_count_result = await db.execute(message_count_query)
        message_count = message_count_result.scalar() or 0

        last_message_at_query = select(func.max(Message.createdAt)).where(
            and_(
                Message.chatId == chat_id,
                Message.deletedAt.is_(None)
            )
        )
        last_message_at_result = await db.execute(last_message_at_query)
        last_message_at = last_message_at_result.scalar()

        # 응답 생성
        return ChatResponse(
            id=chat.id,
            title=chat.title,
            user_id=chat.userId,
            category=None,
            document_count=document_count,
            message_count=message_count,
            last_message_at=last_message_at,
            created_at=chat.createdAt,
            updated_at=chat.updatedAt
        )

    @staticmethod
    async def delete_chat(
        db: AsyncSession,
        chat_id: str,
        user_id: str
    ) -> dict:
        """
        채팅 삭제 (Soft Delete)

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID
            user_id: 사용자 ID

        Returns:
            dict: 삭제 결과

        Raises:
            HTTPException: 채팅을 찾을 수 없거나 권한이 없는 경우
        """
        # 채팅 소유권 검증
        chat = await ChatService.validate_chat_ownership(db, chat_id, user_id)

        # 삭제 전 개수 확인
        message_count_query = select(func.count(Message.id)).where(
            and_(
                Message.chatId == chat_id,
                Message.deletedAt.is_(None)
            )
        )
        message_count_result = await db.execute(message_count_query)
        deleted_messages = message_count_result.scalar() or 0

        document_count_query = select(func.count(ChatDocument.id)).where(
            and_(
                ChatDocument.chatId == chat_id,
                ChatDocument.deletedAt.is_(None)
            )
        )
        document_count_result = await db.execute(document_count_query)
        affected_documents = document_count_result.scalar() or 0

        now = datetime.utcnow()

        # Soft Delete (CASCADE로 Message, ChatDocument도 자동 처리됨)
        chat.deletedAt = now

        # 관련 메시지 soft delete
        for message in chat.messages:
            if message.deletedAt is None:
                message.deletedAt = now

        # 관련 ChatDocument soft delete
        for chat_doc in chat.chatDocuments:
            if chat_doc.deletedAt is None:
                chat_doc.deletedAt = now

        # 카테고리가 있다면 updatedAt 업데이트
        if chat.categoryId and chat.category:
            chat.category.updatedAt = now

        await db.commit()

        # 응답 생성
        return {
            "id": str(chat_id),
            "message": "Successfully deleted.",
            "deleted_at": chat.deletedAt.isoformat(),
            "deleted_messages": deleted_messages,
            "affected_documents": affected_documents
        }

    @staticmethod
    async def delete_multiple_chats(
        db: AsyncSession,
        chat_ids: list[str],
        user_id: str
    ) -> dict:
        """
        여러 채팅 일괄 삭제 (Soft Delete)

        Args:
            db: 데이터베이스 세션
            chat_ids: 삭제할 채팅 ID 목록
            user_id: 사용자 ID

        Returns:
            dict: 삭제 결과

        Raises:
            HTTPException: 채팅을 찾을 수 없거나 권한이 없는 경우
        """
        if not chat_ids:
            return {
                "deleted_count": 0,
                "deleted_chat_ids": [],
                "deleted_at": datetime.utcnow().isoformat(),
                "total_deleted_messages": 0,
                "total_affected_documents": 0
            }

        now = datetime.utcnow()
        deleted_chat_ids = []
        total_deleted_messages = 0
        total_affected_documents = 0
        updated_category_ids = set()

        # 각 채팅에 대해 소유권 검증 및 삭제
        for chat_id in chat_ids:
            try:
                # 채팅 소유권 검증
                chat = await ChatService.validate_chat_ownership(db, chat_id, user_id)

                # 삭제 전 개수 확인
                message_count_query = select(func.count(Message.id)).where(
                    and_(
                        Message.chatId == chat_id,
                        Message.deletedAt.is_(None)
                    )
                )
                message_count_result = await db.execute(message_count_query)
                deleted_messages = message_count_result.scalar() or 0
                total_deleted_messages += deleted_messages

                document_count_query = select(func.count(ChatDocument.id)).where(
                    and_(
                        ChatDocument.chatId == chat_id,
                        ChatDocument.deletedAt.is_(None)
                    )
                )
                document_count_result = await db.execute(document_count_query)
                affected_documents = document_count_result.scalar() or 0
                total_affected_documents += affected_documents

                # Soft Delete
                chat.deletedAt = now

                # 관련 메시지 soft delete
                for message in chat.messages:
                    if message.deletedAt is None:
                        message.deletedAt = now

                # 관련 ChatDocument soft delete
                for chat_doc in chat.chatDocuments:
                    if chat_doc.deletedAt is None:
                        chat_doc.deletedAt = now

                # 카테고리가 있다면 updatedAt 업데이트 (중복 방지)
                if chat.categoryId and chat.category:
                    if chat.categoryId not in updated_category_ids:
                        chat.category.updatedAt = now
                        updated_category_ids.add(chat.categoryId)

                deleted_chat_ids.append(str(chat_id))

            except HTTPException:
                # 권한이 없거나 존재하지 않는 채팅은 무시
                continue

        await db.commit()

        # 응답 생성
        return {
            "deleted_count": len(deleted_chat_ids),
            "deleted_chat_ids": deleted_chat_ids,
            "deleted_at": now.isoformat(),
            "total_deleted_messages": total_deleted_messages,
            "total_affected_documents": total_affected_documents
        }
