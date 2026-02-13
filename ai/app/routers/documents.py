"""
Documents Router

문서 관련 API 엔드포인트
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.document_service import DocumentService
from app.schemas.document import DocumentUploadResponse
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


@router.post("")
async def upload_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    user_id: str = Query(default="default-user", description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[DocumentUploadResponse]:
    """
    문서 업로드

    Args:
        file: 업로드할 파일 (PDF, Markdown, Text)
        user_id: 사용자 ID
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 업로드된 문서 정보

    Raises:
        HTTPException: 파일 타입이나 크기가 유효하지 않은 경우
    """
    document = await DocumentService.upload_document(db, file, user_id, background_tasks)
    return SuccessResponse(data=document)


@router.get("")
async def get_documents(
    status: Optional[str] = Query(None, description="상태 필터 (processing, completed, failed)"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    limit: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    문서 목록 조회
    
    Args:
        status: 상태 필터
        page: 페이지 번호
        limit: 페이지당 개수
        db: 데이터베이스 세션
        
    Returns:
        dict: 문서 목록 및 페이지네이션 정보
    """
    # TODO: 구현
    return {"success": True, "data": {"documents": [], "total": 0, "page": page, "limit": limit}}


@router.get("/{document_id}")
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    문서 상세 조회
    
    Args:
        document_id: 문서 ID
        db: 데이터베이스 세션
        
    Returns:
        dict: 문서 상세 정보
    """
    # TODO: 구현
    return {"success": True, "data": {}}


@router.get("/{document_id}/status")
async def get_document_status(
    document_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    문서 처리 상태 조회
    
    Args:
        document_id: 문서 ID
        db: 데이터베이스 세션
        
    Returns:
        dict: 문서 처리 상태
    """
    # TODO: 구현
    return {"success": True, "data": {}}


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    문서 삭제 (Soft Delete)
    
    Args:
        document_id: 문서 ID
        db: 데이터베이스 세션
        
    Returns:
        dict: 삭제 결과
    """
    # TODO: 구현
    return {"success": True, "data": {}}
