"""
Document Service

문서 관련 비즈니스 로직
"""

import os
import asyncio
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import HTTPException, status, UploadFile, BackgroundTasks
from pypdf import PdfReader
import httpx

from app.models.document import Document, FileType, DocumentStatus
from app.schemas.document import DocumentUploadResponse
from app.utils.gcs_upload import gcs_uploader
from app.services.rag_service import RAGService
from app.config import settings


class DocumentService:
    """
    문서 비즈니스 로직 처리 서비스
    """

    # 허용된 파일 타입 및 최대 크기
    ALLOWED_EXTENSIONS = {"pdf", "md", "txt"}
    MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 52428800))  # 50MB

    @staticmethod
    async def _extract_text_from_file(file_path: str, file_type: FileType) -> str:
        """
        파일에서 텍스트 추출

        Args:
            file_path: GCS 파일 경로 (URL)
            file_type: 파일 타입

        Returns:
            str: 추출된 텍스트

        Raises:
            Exception: 텍스트 추출 실패 시
        """
        # GCS에서 파일 다운로드 (서비스 계정 인증 사용)
        from google.cloud import storage

        # URL에서 blob 이름 추출
        # https://storage.googleapis.com/bucket-name/user-documents/uuid.pdf
        # -> user-documents/uuid.pdf
        bucket_name = settings.GCP_BUCKET_NAME
        blob_name = file_path.split(f"{bucket_name}/")[-1]

        # GCS 클라이언트로 파일 다운로드
        client = storage.Client.from_service_account_json(settings.GOOGLE_APPLICATION_CREDENTIALS)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)

        file_content = blob.download_as_bytes()

        # 파일 타입별 텍스트 추출
        if file_type == FileType.PDF:
            # PDF 파일 처리
            import io
            pdf_file = io.BytesIO(file_content)
            reader = PdfReader(pdf_file)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            return text.strip()

        elif file_type == FileType.MARKDOWN or file_type == FileType.TEXT:
            # Markdown 또는 Text 파일 처리
            return file_content.decode("utf-8")

        else:
            raise ValueError(f"Unsupported file type: {file_type}")

    @staticmethod
    async def _process_document_background(document_id: str, db_url: str):
        """
        백그라운드에서 문서 처리 (텍스트 추출, 청킹, 임베딩, ChromaDB 저장)

        Args:
            document_id: 문서 ID
            db_url: 데이터베이스 URL
        """
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker

        # postgresql:// → postgresql+asyncpg:// 변환
        async_db_url = db_url.replace("postgresql://", "postgresql+asyncpg://")

        # 새로운 DB 세션 생성 (백그라운드 태스크용)
        engine = create_async_engine(async_db_url, echo=False)
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with async_session() as session:
            try:
                # 문서 조회
                doc_query = select(Document).where(Document.id == document_id)
                result = await session.execute(doc_query)
                document = result.scalar_one_or_none()

                if not document:
                    print(f"[ERROR] Document {document_id} not found")
                    return

                # 1. 텍스트 추출
                print(f"[INFO] Extracting text from document {document_id}...")
                text = await DocumentService._extract_text_from_file(
                    document.filePath,
                    document.fileType
                )

                if not text.strip():
                    raise ValueError("Extracted text is empty")

                # 2. ChromaDB에 저장 (청킹 및 임베딩은 RAGService에서 자동 처리)
                print(f"[INFO] Adding document {document_id} to vectorstore...")
                chunk_count = await RAGService.add_document_to_vectorstore(
                    document_id=document_id,
                    text=text,
                    metadata={
                        "filename": document.filename,
                        "fileType": document.fileType.value
                    }
                )

                # 3. 문서 상태 업데이트
                document.status = DocumentStatus.COMPLETED
                document.chunkCount = chunk_count
                await session.commit()

                print(f"[SUCCESS] Document {document_id} processed successfully ({chunk_count} chunks)")

            except Exception as e:
                print(f"[ERROR] Failed to process document {document_id}: {str(e)}")
                # 실패 시 상태 업데이트
                if document:
                    document.status = DocumentStatus.FAILED
                    await session.commit()
            finally:
                await engine.dispose()

    @staticmethod
    async def upload_document(
        db: AsyncSession,
        file: UploadFile,
        user_id: str,
        background_tasks: Optional[BackgroundTasks] = None
    ) -> DocumentUploadResponse:
        """
        문서 업로드 및 처리 시작

        Args:
            db: 데이터베이스 세션
            file: 업로드 파일
            user_id: 사용자 ID

        Returns:
            DocumentUploadResponse: 업로드된 문서 정보

        Raises:
            HTTPException: 파일 타입이나 크기가 유효하지 않은 경우
        """
        # 파일 확장자 검증
        if not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Filename is required."
            )

        file_extension = file.filename.split(".")[-1].lower()
        if file_extension not in DocumentService.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"UNSUPPORTED_FILE_TYPE: Only {', '.join(DocumentService.ALLOWED_EXTENSIONS)} files are supported."
            )

        # 파일 크기 검증
        file_content = await file.read()
        file_size = len(file_content)
        await file.seek(0)  # 파일 포인터 리셋

        if file_size > DocumentService.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"FILE_TOO_LARGE: Maximum file size is {DocumentService.MAX_FILE_SIZE / 1024 / 1024}MB."
            )

        # Document 레코드 생성 (status: processing)
        new_document = Document(
            userId=user_id,
            filename=file.filename,
            filePath="",  # GCS 업로드 후 설정
            fileType=FileType(file_extension),
            fileSize=file_size,
            status=DocumentStatus.PROCESSING,
            chunkCount=0
        )
        db.add(new_document)
        await db.commit()
        await db.refresh(new_document)

        try:
            # GCS에 업로드
            gcs_url = await gcs_uploader.upload_document(
                file=file,
                document_id=new_document.id,
                file_extension=file_extension
            )

            # filePath 업데이트
            new_document.filePath = gcs_url
            await db.commit()
            await db.refresh(new_document)

            # 백그라운드 태스크로 문서 처리 시작
            if background_tasks:
                # settings에서 DATABASE_URL 가져오기
                db_url = settings.DATABASE_URL
                background_tasks.add_task(
                    DocumentService._process_document_background,
                    document_id=new_document.id,
                    db_url=db_url
                )
                print(f"[INFO] Background task scheduled for document {new_document.id}")

            return DocumentUploadResponse(
                id=new_document.id,
                filename=new_document.filename,
                file_path=new_document.filePath,
                file_type=new_document.fileType.value,
                file_size=new_document.fileSize,
                status=new_document.status.value,
                created_at=new_document.createdAt
            )

        except Exception as e:
            # GCS 업로드 실패 시 Document 레코드 삭제
            await db.delete(new_document)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload document: {str(e)}"
            )


