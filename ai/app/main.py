"""
Nura Server - FastAPI Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import categories, chats, documents, messages

# FastAPI 앱 생성
app: FastAPI = FastAPI(
    title="Nura Server",
    description="RAG 파이프라인 기반 AI 문서 분석 및 질의응답 시스템",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 미들웨어 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(categories.router)
app.include_router(chats.router)
app.include_router(documents.router)
app.include_router(messages.router)


@app.get("/")
async def root() -> dict[str, str]:
    """
    루트 엔드포인트
    
    Returns:
        dict: 환영 메시지
    """
    return {
        "message": "Welcome to Nura Server",
        "version": "0.1.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check() -> dict[str, str]:
    """
    헬스 체크 엔드포인트
    
    Returns:
        dict: 서버 상태
    """
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT
    }


@app.on_event("startup")
async def startup_event() -> None:
    """
    서버 시작 시 실행되는 이벤트
    
    데이터베이스 연결을 테스트하고 테이블을 생성합니다.
    """
    from app.database import engine, Base
    from sqlalchemy import text
    import app.models  # 모든 모델 import
    
    try:
        # 데이터베이스 연결 테스트
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            await conn.commit()
        print("✅ PostgreSQL 연결 성공")
        
        # 스키마 생성 (없으면)
        async with engine.begin() as conn:
            await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {settings.DB_SCHEMA}"))
        print(f"✅ {settings.DB_SCHEMA} 스키마 확인/생성 완료")
        
        # 테이블 생성
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print(f"✅ 데이터베이스 테이블 생성 완료 ({settings.DB_SCHEMA} 스키마)")
        
    except Exception as e:
        print(f"❌ 데이터베이스 초기화 실패: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """
    서버 종료 시 실행되는 이벤트
    
    데이터베이스 연결을 정리합니다.
    """
    from app.database import engine
    
    await engine.dispose()
    print("✅ PostgreSQL 연결 종료")
