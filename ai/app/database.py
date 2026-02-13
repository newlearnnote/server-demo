"""
Database Configuration Module

SQLAlchemy 비동기 엔진 및 세션 관리를 제공합니다.
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, AsyncEngine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from typing import AsyncGenerator

from app.config import settings

# 비동기 엔진 생성
engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
    echo=settings.ENVIRONMENT == "development",
    future=True,
    pool_pre_ping=True
)

# 비동기 세션 팩토리
AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Base 클래스 정의
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    데이터베이스 세션 의존성 함수
    
    FastAPI 의존성으로 사용되며, 요청마다 새로운 DB 세션을 제공합니다.
    
    Yields:
        AsyncSession: 비동기 데이터베이스 세션
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
