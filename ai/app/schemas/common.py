"""
Common Schemas

공통으로 사용되는 스키마를 정의합니다.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Generic, TypeVar, Optional
from datetime import datetime


T = TypeVar('T')


def to_camel(string: str) -> str:
    """
    snake_case를 camelCase로 변환

    Args:
        string: snake_case 문자열

    Returns:
        camelCase 문자열
    """
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class CamelCaseModel(BaseModel):
    """
    camelCase 자동 변환 Base Model

    Python 코드는 snake_case로 작성하고,
    JSON 직렬화 시 자동으로 camelCase로 변환됩니다.
    """
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,  # snake_case와 camelCase 모두 허용
        from_attributes=True
    )


class SuccessResponse(BaseModel, Generic[T]):
    """
    성공 응답 스키마
    """
    success: bool = True
    data: T


class ErrorDetail(BaseModel):
    """
    에러 상세 정보
    """
    code: str
    message: str
    details: Optional[dict] = None


class ErrorResponse(BaseModel):
    """
    에러 응답 스키마
    """
    success: bool = False
    error: ErrorDetail


