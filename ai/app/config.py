"""
Application Configuration Module

환경 변수를 로드하고 타입 안전한 설정 관리를 제공합니다.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """
    애플리케이션 설정 클래스
    
    .env.development 파일에서 환경 변수를 자동으로 로드합니다.
    """
    
    # Database Configuration
    DATABASE_URL: str
    DB_SCHEMA: str = "public"
    
    # Application Configuration
    PORT: int = 8000
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str
    SERVER_URL: str
    
    # CORS
    ALLOWED_ORIGINS: str
    
    # GCP Configuration
    GCP_PROJECT_ID: str
    GCP_BUCKET_NAME: str
    GOOGLE_APPLICATION_CREDENTIALS: str
    
    # GCS URLs
    USER_DEFAULT_AVATAR_URL: str
    USER_AVATAR_URLS: str
    USER_DOCUMENTS_URL: str
    
    # OpenAI API Keys
    OPENAI_API_KEY: str
    
    # ChromaDB
    CHROMA_DB_PATH: str = "./chroma"
    
    # File Upload Settings
    ALLOWED_FILE_TYPES: str = "pdf,md,txt"
    MAX_FILE_SIZE: int = 52428800  # 50MB
    
    # RAG Settings
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    TOP_K_RESULTS: int = 4
    
    # LLM Settings
    LLM_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 1000

    # Conversation History
    MAX_CONVERSATION_HISTORY: int = 10

    model_config = SettingsConfigDict(
        env_file=".env.development",
        env_file_encoding="utf-8",
        case_sensitive=False
    )
    
    @property
    def allowed_origins_list(self) -> List[str]:
        """
        CORS용 허용된 origin 목록을 반환합니다.
        
        Returns:
            List[str]: 허용된 origin URL 목록
        """
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    
    @property
    def allowed_file_types_list(self) -> List[str]:
        """
        허용된 파일 타입 목록을 반환합니다.
        
        Returns:
            List[str]: 허용된 파일 확장자 목록
        """
        return [file_type.strip() for file_type in self.ALLOWED_FILE_TYPES.split(",")]


# 전역 설정 인스턴스
settings: Settings = Settings()
