"""
Messages Router

메시지 관련 API 엔드포인트
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.message_service import MessageService
from app.schemas.message import MessageCreate, MessageCreateResponse
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/api/v1/messages", tags=["messages"])


@router.post("")
async def create_message(
    message_data: MessageCreate,
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[MessageCreateResponse]:
    """
    메시지 생성 (질의응답 및 채팅 자동 생성)

    Args:
        message_data: 메시지 생성 데이터
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 생성된 메시지 정보 (chat_id가 null이면 chat 정보 포함)

    Raises:
        HTTPException: 채팅을 찾을 수 없거나, 문서가 없거나, 문서가 준비되지 않은 경우
    """
    result = await MessageService.create_message(db, message_data)
    return SuccessResponse(data=result)

