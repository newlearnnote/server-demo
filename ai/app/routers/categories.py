"""
Categories Router

카테고리 관련 API 엔드포인트 (Controller Layer)
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.category_service import CategoryService
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryDetail
)
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


@router.get("")
async def get_categories(
    page: int = Query(1, ge=1, description="페이지 번호"),
    limit: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[list[CategoryResponse]]:
    """
    카테고리 목록 조회

    Args:
        page: 페이지 번호
        limit: 페이지당 개수
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 카테고리 목록
    """
    categories = await CategoryService.get_categories(db, page, limit, user_id)
    return SuccessResponse(data=categories)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_category(
    category_data: CategoryCreate,
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[CategoryResponse]:
    """
    카테고리 생성

    Args:
        category_data: 카테고리 생성 데이터 (userId 포함)
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 생성된 카테고리 정보

    Raises:
        HTTPException: 중복된 이름이 존재하는 경우
    """
    category = await CategoryService.create_category(db, category_data, user_id)
    return SuccessResponse(data=category)


@router.get("/{category_id}")
async def get_category(
    category_id: str,
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[CategoryDetail]:
    """
    카테고리 상세 조회

    Args:
        category_id: 카테고리 ID
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 카테고리 상세 정보 (채팅 목록 포함)

    Raises:
        HTTPException: 카테고리를 찾을 수 없는 경우
    """
    category_detail = await CategoryService.get_category_by_id(db, category_id, user_id)
    return SuccessResponse(data=category_detail)


@router.patch("/{category_id}")
async def update_category(
    category_id: str,
    category_data: CategoryUpdate,
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[CategoryResponse]:
    """
    카테고리 수정

    Args:
        category_id: 카테고리 ID
        category_data: 수정할 데이터
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 수정된 카테고리 정보

    Raises:
        HTTPException: 카테고리를 찾을 수 없거나 중복된 이름인 경우
    """
    category = await CategoryService.update_category(db, category_id, category_data, user_id)
    return SuccessResponse(data=category)


@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    user_id: str = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db)
) -> SuccessResponse[dict]:
    """
    카테고리 삭제 (Soft Delete)

    Args:
        category_id: 카테고리 ID
        db: 데이터베이스 세션

    Returns:
        SuccessResponse: 삭제 결과

    Raises:
        HTTPException: 카테고리를 찾을 수 없는 경우
    """
    result = await CategoryService.delete_category(db, category_id, user_id)
    return SuccessResponse(data=result)
