"""
Chats Router

채팅 관련 API 엔드포인트 (Controller Layer)
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, UploadFile, File, Body
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.chat_service import ChatService
from app.services.message_service import MessageService
from app.schemas.chat import (
    ChatUpdate,
    ChatResponse,
    ChatDetail
)
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/api/v1/chats", tags=["chats"])


@router.get("")
async def get_chats(
    user_id: str = Query(..., description="사용자 ID"),
    category_id: Optional[str] = Query(None, description="카테고리 ID (필터링)"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    limit: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[list[ChatResponse]]:
    """
    채팅 목록 조회

    Args:
        user_id: 사용자 ID
        category_id: 카테고리 ID (선택)
        page: 페이지 번호
        limit: 페이지당 개수
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 채팅 목록
    """
    chats = await ChatService.get_chats(db, user_id, page, limit, category_id)
    return SuccessResponse(data=chats)


@router.get("/{chat_id}")
async def get_chat(
    chat_id: str,
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[ChatDetail]:
    """
    채팅 상세 조회

    Args:
        chat_id: 채팅 ID
        user_id: 사용자 ID
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 채팅 상세 정보 (문서 목록 포함)

    Raises:
        HTTPException: 채팅을 찾을 수 없거나 권한이 없는 경우
    """
    chat_detail = await ChatService.get_chat_by_id(db, chat_id, user_id)
    return SuccessResponse(data=chat_detail)


@router.patch("/{chat_id}")
async def update_chat(
    chat_id: str,
    chat_data: ChatUpdate,
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[ChatResponse]:
    """
    채팅 수정

    Args:
        chat_id: 채팅 ID
        chat_data: 수정할 데이터
        user_id: 사용자 ID
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 수정된 채팅 정보

    Raises:
        HTTPException: 채팅을 찾을 수 없거나 권한이 없는 경우
    """
    chat = await ChatService.update_chat(db, chat_id, chat_data, user_id)
    return SuccessResponse(data=chat)


@router.delete("/{chat_id}/category")
async def remove_category(
    chat_id: str,
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[ChatResponse]:
    """
    채팅에서 카테고리 해제

    Args:
        chat_id: 채팅 ID
        user_id: 사용자 ID
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 카테고리가 해제된 채팅 정보

    Raises:
        HTTPException: 채팅을 찾을 수 없거나 권한이 없는 경우
    """
    chat = await ChatService.remove_category_from_chat(db, chat_id, user_id)
    return SuccessResponse(data=chat)


@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: str,
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[dict]:
    """
    채팅 삭제 (Soft Delete)

    Args:
        chat_id: 채팅 ID
        user_id: 사용자 ID
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 삭제 결과

    Raises:
        HTTPException: 채팅을 찾을 수 없거나 권한이 없는 경우
    """
    result = await ChatService.delete_chat(db, chat_id, user_id)
    return SuccessResponse(data=result)


@router.post("/bulk-delete")
async def bulk_delete_chats(
    chat_ids: list[str] = Body(..., description="삭제할 채팅 ID 목록"),
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[dict]:
    """
    여러 채팅 일괄 삭제 (Soft Delete)

    Args:
        chat_ids: 삭제할 채팅 ID 목록
        user_id: 사용자 ID
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 삭제 결과

    Raises:
        HTTPException: 권한이 없는 경우
    """
    result = await ChatService.delete_multiple_chats(db, chat_ids, user_id)
    return SuccessResponse(data=result)

@router.get("/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    page: int = Query(1, ge=1, description="페이지 번호"),
    limit: int = Query(50, ge=1, le=100, description="페이지당 개수"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[dict]:
    """
    채팅의 메시지 목록 조회

    Args:
        chat_id: 채팅 ID
        page: 페이지 번호
        limit: 페이지당 개수
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 메시지 목록
    """
    result = await MessageService.get_messages(db, chat_id, page, limit)
    return SuccessResponse(data=result)