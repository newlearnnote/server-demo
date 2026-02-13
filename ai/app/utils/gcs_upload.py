"""
GCS Upload Utility

Google Cloud Storage 파일 업로드 유틸리티
"""

import os
from typing import BinaryIO
from google.cloud import storage
from fastapi import UploadFile, HTTPException, status

from app.config import settings


class GCSUploader:
    """
    GCS 파일 업로드 헬퍼 클래스
    """

    def __init__(self):
        self.project_id = settings.GCP_PROJECT_ID
        self.bucket_name = settings.GCP_BUCKET_NAME
        self.credentials_path = settings.GOOGLE_APPLICATION_CREDENTIALS

        if not all([self.project_id, self.bucket_name, self.credentials_path]):
            raise ValueError("GCP configuration is missing in environment variables")

        # GCS 클라이언트 초기화
        self.client = storage.Client.from_service_account_json(self.credentials_path)
        self.bucket = self.client.bucket(self.bucket_name)

    async def upload_document(
        self,
        file: UploadFile,
        document_id: str,
        file_extension: str
    ) -> str:
        """
        문서를 GCS에 업로드

        Args:
            file: 업로드할 파일
            document_id: 문서 ID (ULID)
            file_extension: 파일 확장자 (pdf, md, txt)

        Returns:
            str: GCS URL (https://storage.googleapis.com/bucket-name/user-documents/uuid.pdf)

        Raises:
            HTTPException: 업로드 실패 시
        """
        try:
            # GCS blob 경로: user-documents/{document_id}.{extension}
            blob_name = f"user-documents/{document_id}.{file_extension}"
            blob = self.bucket.blob(blob_name)

            # 파일 읽기
            file_content = await file.read()

            # Content-Type 설정
            content_type_map = {
                "pdf": "application/pdf",
                "md": "text/markdown",
                "txt": "text/plain"
            }
            content_type = content_type_map.get(file_extension, "application/octet-stream")

            # GCS에 업로드
            blob.upload_from_string(
                file_content,
                content_type=content_type
            )

            # 파일을 처음으로 되돌림 (재사용을 위해)
            await file.seek(0)

            # Public URL 반환
            return f"https://storage.googleapis.com/{self.bucket_name}/{blob_name}"

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload file to GCS: {str(e)}"
            )

    async def delete_document(self, document_path: str) -> bool:
        """
        GCS에서 문서 삭제

        Args:
            document_path: GCS URL

        Returns:
            bool: 삭제 성공 여부
        """
        try:
            # URL에서 blob 이름 추출
            # https://storage.googleapis.com/bucket-name/user-documents/uuid.pdf
            # -> user-documents/uuid.pdf
            blob_name = document_path.split(f"{self.bucket_name}/")[-1]
            blob = self.bucket.blob(blob_name)

            if blob.exists():
                blob.delete()
                return True
            return False

        except Exception as e:
            print(f"Failed to delete file from GCS: {str(e)}")
            return False


# Singleton instance
gcs_uploader = GCSUploader()
