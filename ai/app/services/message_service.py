"""
Message Service

메시지 관련 비즈니스 로직
"""

from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import HTTPException, status

from app.models.message import Message, MessageRole
from app.models.chat import Chat
from app.models.document import Document, DocumentStatus
from app.models.chat_document import ChatDocument
from app.models.message_document import MessageDocument
from app.models.category import Category
from app.schemas.message import (
    MessageCreate,
    MessageResponse,
    MessageCreateResponse,
    ChatCreateInfo,
    SourceInfo,
    DocumentAttachment
)
from app.services.chat_service import ChatService
from app.services.category_service import CategoryService
from app.services.rag_service import RAGService


class MessageService:
    """
    메시지 비즈니스 로직 처리 서비스
    """

    @staticmethod
    async def _get_document(db: AsyncSession, doc_id: str) -> Document:
        """
        문서 조회 (삭제되지 않은 문서만)

        Args:
            db: 데이터베이스 세션
            doc_id: 문서 ID

        Returns:
            Document: 문서 객체

        Raises:
            HTTPException: 문서를 찾을 수 없는 경우
        """
        doc_query = select(Document).where(
            and_(
                Document.id == doc_id,
                Document.deletedAt.is_(None)
            )
        )
        doc_result = await db.execute(doc_query)
        document = doc_result.scalar_one_or_none()

        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document {doc_id} not found."
            )

        return document

    @staticmethod
    async def _update_chat_timestamp(db: AsyncSession, chat_id: str):
        """
        채팅 updatedAt 갱신

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID
        """
        chat_update_query = select(Chat).where(Chat.id == chat_id)
        chat_update_result = await db.execute(chat_update_query)
        chat_to_update = chat_update_result.scalar_one()
        chat_to_update.updatedAt = datetime.utcnow()

    @staticmethod
    async def _attach_documents_to_message(
        db: AsyncSession,
        message_id: str,
        document_ids: list[str]
    ) -> tuple[list[DocumentAttachment], list[Document]]:
        """
        메시지에 문서 첨부 및 RAG용 문서 수집

        Args:
            db: 데이터베이스 세션
            message_id: 메시지 ID
            document_ids: 첨부할 문서 ID 리스트

        Returns:
            tuple: (첨부된 문서 정보 리스트, RAG용 문서 리스트)

        Raises:
            HTTPException: 문서를 찾을 수 없는 경우
        """
        attached_documents = []
        documents_for_rag = []

        for doc_id in document_ids:
            document = await MessageService._get_document(db, doc_id)

            # MessageDocument 생성
            message_document = MessageDocument(
                messageId=message_id,
                documentId=document.id
            )
            db.add(message_document)

            attached_documents.append(DocumentAttachment(
                id=document.id,
                filename=document.filename
            ))

            # completed 문서만 RAG에 사용
            if document.status == DocumentStatus.COMPLETED:
                documents_for_rag.append(document)

        await db.commit()
        return attached_documents, documents_for_rag

    @staticmethod
    async def _get_chat_documents_for_rag(
        db: AsyncSession,
        chat_id: str
    ) -> list[Document]:
        """
        채팅에 연결된 completed 문서들 조회 (RAG용)

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID

        Returns:
            list[Document]: RAG에 사용 가능한 문서 리스트
        """
        documents_for_rag = []

        chat_docs_query = select(ChatDocument).where(
            and_(
                ChatDocument.chatId == chat_id,
                ChatDocument.deletedAt.is_(None)
            )
        )
        chat_docs_result = await db.execute(chat_docs_query)
        chat_documents = chat_docs_result.scalars().all()

        for chat_doc in chat_documents:
            doc_query = select(Document).where(
                and_(
                    Document.id == chat_doc.documentId,
                    Document.deletedAt.is_(None)
                )
            )
            doc_result = await db.execute(doc_query)
            doc = doc_result.scalar_one_or_none()
            if doc and doc.status == DocumentStatus.COMPLETED:
                documents_for_rag.append(doc)

        return documents_for_rag

    @staticmethod
    async def _get_conversation_history(
        db: AsyncSession,
        chat_id: str,
        limit: int
    ) -> list[dict]:
        """
        채팅의 최근 대화 히스토리 조회

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID
            limit: 조회할 최대 메시지 쌍 수 (user+assistant 쌍)

        Returns:
            list[dict]: 대화 히스토리 [{"role": "user", "content": "..."}, ...]
        """
        # 최근 limit*2개 메시지 조회 (user+assistant 쌍)
        query = (
            select(Message)
            .where(
                and_(
                    Message.chatId == chat_id,
                    Message.deletedAt.is_(None)
                )
            )
            .order_by(Message.createdAt.desc())  # 최신순
            .limit(limit * 2)
        )

        result = await db.execute(query)
        messages = result.scalars().all()

        # 시간 순서대로 뒤집기 (오래된 것부터)
        messages = list(reversed(messages))

        # role과 content만 추출
        return [
            {
                "role": msg.role.value,
                "content": msg.content
            }
            for msg in messages
        ]

    @staticmethod
    async def _generate_ai_response(
        db: AsyncSession,
        chat_id: str,
        user_query: str,
        documents_for_rag: list[Document]
    ) -> Message:
        """
        AI 응답 생성 및 저장

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID
            user_query: 사용자 질문
            documents_for_rag: RAG에 사용할 문서 리스트

        Returns:
            Message: 생성된 AI 메시지
        """
        try:
            # 대화 히스토리 조회
            from app.config import settings
            conversation_history = await MessageService._get_conversation_history(
                db,
                chat_id,
                limit=settings.MAX_CONVERSATION_HISTORY
            )

            # RAG 질의응답 처리
            if documents_for_rag:
                # 1. 문서 ID 추출
                document_ids = [doc.id for doc in documents_for_rag]

                # 2. 관련 청크 검색
                context_chunks = await RAGService.search_similar_chunks(
                    query=user_query,
                    document_ids=document_ids
                )

                # 3. LLM을 사용하여 응답 생성
                if context_chunks:
                    # Case A: 관련 청크를 찾은 경우 - 문서 기반 응답
                    assistant_content = await RAGService.generate_response(
                        query=user_query,
                        context_chunks=context_chunks,
                        conversation_history=conversation_history
                    )

                    # 소스 정보 생성 (SourceInfo 스키마에 맞게)
                    sources = []
                    for i, chunk in enumerate(context_chunks):
                        doc_id = chunk['metadata'].get('document_id')
                        filename = chunk['metadata'].get('filename', 'Unknown')
                        chunk_index = chunk['metadata'].get('chunk_index', i)
                        content = chunk['content'][:200]  # 미리보기 200자

                        sources.append({
                            "document_id": doc_id,
                            "document_name": filename,
                            "chunk_id": f"{doc_id}_{chunk_index}",
                            "page": None,
                            "similarity": 0.0,  # ChromaDB에서 거리 정보 없으면 기본값
                            "content_preview": content
                        })
                    assistant_sources = sources if sources else None
                else:
                    # 문서는 있지만 관련 청크를 찾지 못한 경우 → Case B로 폴백
                    assistant_content = await RAGService.generate_response(
                        query=user_query,
                        context_chunks=[],
                        conversation_history=conversation_history
                    )
                    assistant_sources = None
            else:
                # Case B: 문서가 없는 경우 - 일반 대화
                assistant_content = await RAGService.generate_response(
                    query=user_query,
                    context_chunks=[],
                    conversation_history=conversation_history
                )
                assistant_sources = None

            # AI 메시지 저장
            assistant_message = Message(
                chatId=chat_id,
                role=MessageRole.ASSISTANT,
                content=assistant_content,
                sources=assistant_sources
            )
            db.add(assistant_message)

            # 채팅 updatedAt 갱신
            await MessageService._update_chat_timestamp(db, chat_id)

            await db.commit()
            await db.refresh(assistant_message)
            return assistant_message

        except Exception as e:
            # AI 응답 생성 실패 시 롤백하지 않고 기본 메시지 생성
            await db.rollback()
            assistant_message = Message(
                chatId=chat_id,
                role=MessageRole.ASSISTANT,
                content=f"죄송합니다. AI 응답 생성 중 오류가 발생했습니다: {str(e)}",
                sources=None
            )
            db.add(assistant_message)

            # 채팅 updatedAt 갱신
            await MessageService._update_chat_timestamp(db, chat_id)

            await db.commit()
            await db.refresh(assistant_message)
            return assistant_message

    @staticmethod
    async def get_messages(
        db: AsyncSession,
        chat_id: str,
        page: int = 1,
        limit: int = 50
    ) -> dict:
        """
        채팅의 메시지 목록 조회

        Args:
            db: 데이터베이스 세션
            chat_id: 채팅 ID
            page: 페이지 번호
            limit: 페이지당 개수

        Returns:
            dict: 메시지 목록 및 페이지네이션 정보
        """
        # 페이지네이션 계산
        offset = (page - 1) * limit

        # 메시지 조회 (삭제되지 않은 것만, 생성일 순으로 정렬)
        query = (
            select(Message)
            .where(
                and_(
                    Message.chatId == chat_id,
                    Message.deletedAt.is_(None)
                )
            )
            .order_by(Message.createdAt.asc())
            .offset(offset)
            .limit(limit)
        )

        result = await db.execute(query)
        messages = result.scalars().all()

        # 각 메시지의 첨부 문서 조회 (JOIN으로 한 번에 로드)
        message_responses = []
        for message in messages:
            # 메시지에 첨부된 문서 조회 (JOIN으로 document를 함께 로드)
            doc_query = (
                select(MessageDocument, Document)
                .join(Document, MessageDocument.documentId == Document.id)
                .where(
                    and_(
                        MessageDocument.messageId == message.id,
                        MessageDocument.deletedAt.is_(None),
                        Document.deletedAt.is_(None)
                    )
                )
            )
            doc_result = await db.execute(doc_query)
            doc_rows = doc_result.all()

            attached_documents = [
                DocumentAttachment(
                    id=str(doc.id),
                    filename=doc.filename
                )
                for _, doc in doc_rows
            ]

            message_responses.append(
                MessageResponse(
                    id=str(message.id),
                    chat_id=str(message.chatId),
                    role=message.role.value,
                    content=message.content,
                    attached_documents=attached_documents,
                    sources=message.sources,
                    created_at=message.createdAt
                )
            )

        return {
            "chat_id": chat_id,
            "messages": message_responses,
            "total": len(message_responses),
            "page": page,
            "limit": limit
        }

    @staticmethod
    async def create_message(
        db: AsyncSession,
        message_data: MessageCreate
    ) -> MessageCreateResponse:
        """
        메시지 생성 및 AI 응답 생성
        - chat_id가 null이면 새 채팅 생성
        - chat_id가 있으면 기존 채팅에 추가
        - 매 메시지마다 document_ids를 첨부 가능

        Args:
            db: 데이터베이스 세션
            message_data: 메시지 생성 데이터

        Returns:
            MessageCreateResponse: 생성된 메시지 정보 (chat 포함 여부는 chat_id에 따라 다름)

        Raises:
            HTTPException: 채팅을 찾을 수 없거나, 문서가 없거나, 문서가 준비되지 않은 경우
        """
        chat_info = None

        # Case 1: 새 채팅 생성 (chat_id == null 이라면)
        if message_data.chat_id is None:
            chat_info = await MessageService._create_new_chat_with_message(
                db, message_data
            )
            chat_id = chat_info.id

        # Case 2: 기존 채팅에 메시지 추가 (chat_id != null 이라면)
        else:
            # 채팅 소유권 검증
            chat = await ChatService.validate_chat_ownership(
                db, message_data.chat_id, message_data.user_id
            )
            chat_id = chat.id

        # 사용자 메시지 저장
        user_message = Message(
            chatId=chat_id,
            role=MessageRole.USER,
            content=message_data.content,
            sources=None
        )
        db.add(user_message)
        await db.commit()
        await db.refresh(user_message)

        # 문서 첨부 및 RAG용 문서 수집
        if message_data.document_ids:
            attached_documents, documents_for_rag = await MessageService._attach_documents_to_message(
                db, user_message.id, message_data.document_ids
            )
        else:
            attached_documents = []
            # 1차: 채팅에 연결된 문서 확인
            documents_for_rag = await MessageService._get_chat_documents_for_rag(db, chat_id)

            # 2차: 채팅에 문서가 없으면 사용자의 모든 완료된 문서 사용
            if not documents_for_rag:
                user_docs_query = select(Document).where(
                    and_(
                        Document.userId == message_data.user_id,
                        Document.status == DocumentStatus.COMPLETED,
                        Document.deletedAt.is_(None)
                    )
                )
                user_docs_result = await db.execute(user_docs_query)
                documents_for_rag = list(user_docs_result.scalars().all())

        # AI 응답 생성
        assistant_message = await MessageService._generate_ai_response(
            db, chat_id, message_data.content, documents_for_rag
        )

        # 응답 생성
        return MessageCreateResponse(
            chat=chat_info,
            user_message=MessageResponse(
                id=user_message.id,
                chat_id=user_message.chatId,
                role=user_message.role.value,
                content=user_message.content,
                attached_documents=attached_documents,
                sources=None,
                created_at=user_message.createdAt
            ),
            assistant_message=MessageResponse(
                id=assistant_message.id,
                chat_id=assistant_message.chatId,
                role=assistant_message.role.value,
                content=assistant_message.content,
                attached_documents=[],
                sources=assistant_message.sources,
                created_at=assistant_message.createdAt
            )
        )

    @staticmethod
    async def _create_new_chat_with_message(
        db: AsyncSession,
        message_data: MessageCreate
    ) -> ChatCreateInfo:
        """
        새 채팅 생성 및 문서 연결

        Args:
            db: 데이터베이스 세션
            message_data: 메시지 생성 데이터

        Returns:
            ChatCreateInfo: 생성된 채팅 정보

        Raises:
            HTTPException: 카테고리나 문서를 찾을 수 없는 경우
        """
        # 카테고리 검증 (있는 경우)
        category_info = None
        if message_data.category_id:
            category = await CategoryService.validate_category_ownership(
                db, message_data.category_id, message_data.user_id
            )
            category_info = {"id": category.id, "name": category.name}

        # 채팅 제목 생성 (메시지 내용의 처음 50자)
        title = message_data.content[:50] if len(message_data.content) > 50 else message_data.content

        # 새 채팅 생성
        new_chat = Chat(
            userId=message_data.user_id,
            categoryId=message_data.category_id,
            title=title
        )
        db.add(new_chat)
        await db.commit()
        await db.refresh(new_chat)

        # 문서 연결 (document_ids가 있는 경우)
        documents_info = []
        if message_data.document_ids:
            for doc_id in message_data.document_ids:
                try:
                    document = await MessageService._get_document(db, doc_id)
                except HTTPException:
                    # 이미 채팅이 생성되었으므로 롤백하고 에러
                    await db.rollback()
                    raise

                # FAILED 상태 문서는 차단
                if document.status == DocumentStatus.FAILED:
                    await db.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Document {document.filename} processing failed."
                    )

                # ChatDocument 연결 생성
                chat_document = ChatDocument(
                    chatId=new_chat.id,
                    documentId=document.id
                )
                db.add(chat_document)

                documents_info.append({
                    "id": document.id,
                    "filename": document.filename
                })

            await db.commit()

        return ChatCreateInfo(
            id=new_chat.id,
            title=new_chat.title,
            category=category_info,
            documents=documents_info,
            created_at=new_chat.createdAt
        )

