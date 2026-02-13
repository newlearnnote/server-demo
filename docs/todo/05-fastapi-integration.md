# TODO 05: FastAPI 서버 통합

## 목적
FastAPI 서버에서 X-User-Id 헤더를 검증하고, 사용자별 데이터 격리 구현

## 작업 내용

### 1. FastAPI 의존성 함수 생성

**파일**: `server-demo/ai/app/dependencies/auth.py` (신규 생성)

**내용**:

```python
from fastapi import Header, HTTPException
from typing import Optional

async def get_current_user_id(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id")
) -> str:
    """
    NestJS에서 전달된 X-User-Id 헤더를 검증
    """
    if not x_user_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied. User ID is required."
        )

    return x_user_id
```

---

### 2. documents 라우터 수정

**파일**: `server-demo/ai/app/routers/documents.py`

**수정 전**:
```python
@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    # ...
):
    # ...
```

**수정 후**:
```python
from fastapi import APIRouter, Depends, UploadFile, File
from ..dependencies.auth import get_current_user_id

router = APIRouter()

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """
    문서 업로드 (Premium 전용)
    NestJS에서 이미 Premium 검증을 마침
    """
    # user_id를 사용하여 문서와 사용자 연결
    # ...

@router.get("/")
async def list_documents(
    user_id: str = Depends(get_current_user_id),
):
    """
    사용자의 문서 목록 조회
    """
    # user_id로 필터링하여 조회
    # ...

@router.get("/{document_id}")
async def get_document(
    document_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    특정 문서 조회
    """
    # 문서 소유권 확인 후 조회
    # ...

@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    문서 삭제
    """
    # 문서 소유권 확인 후 삭제
    # ...
```

---

### 3. chats 라우터 수정

**파일**: `server-demo/ai/app/routers/chats.py`

**수정**:

```python
from fastapi import APIRouter, Depends
from ..dependencies.auth import get_current_user_id

router = APIRouter()

@router.post("/")
async def create_chat(
    document_id: str,
    title: str = None,
    user_id: str = Depends(get_current_user_id),
):
    """
    채팅 생성
    """
    # user_id를 chat에 저장
    # ...

@router.get("/")
async def list_chats(
    user_id: str = Depends(get_current_user_id),
):
    """
    사용자의 채팅 목록 조회
    """
    # user_id로 필터링
    # ...

@router.get("/{chat_id}")
async def get_chat(
    chat_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    특정 채팅 조회
    """
    # 채팅 소유권 확인
    # ...

@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    채팅 삭제
    """
    # 채팅 소유권 확인 후 삭제
    # ...
```

---

### 4. messages 라우터 수정

**파일**: `server-demo/ai/app/routers/messages.py`

**수정**:

```python
from fastapi import APIRouter, Depends
from ..dependencies.auth import get_current_user_id

router = APIRouter()

@router.post("/")
async def send_message(
    chat_id: str,
    message: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    메시지 전송
    """
    # 1. chat 소유권 확인
    # 2. RAG 파이프라인 실행
    # 3. 메시지 저장
    # ...

@router.get("/{chat_id}")
async def get_messages(
    chat_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    채팅의 메시지 목록 조회
    """
    # chat 소유권 확인 후 조회
    # ...
```

---

### 5. PostgreSQL 모델에 user_id 추가 (필요시)

**파일**: `server-demo/ai/app/models/` (기존 모델 확인 필요)

**Document 모델 예시**:
```python
from sqlalchemy import Column, String, DateTime, Text
from app.database import Base
import datetime

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)  # 추가
    file_path = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
```

**Chat 모델 예시**:
```python
class Chat(Base):
    __tablename__ = "chats"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)  # 추가
    document_id = Column(String, nullable=False)
    title = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
```

**Message 모델 예시**:
```python
class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True)
    chat_id = Column(String, nullable=False)
    user_id = Column(String, nullable=False, index=True)  # 추가
    role = Column(String, nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
```

---

### 6. ChromaDB 컬렉션에 user_id 메타데이터 추가

**파일**: `server-demo/ai/app/services/` (RAG 서비스)

**문서 임베딩 저장 시**:
```python
# 기존
collection.add(
    documents=[chunk],
    metadatas=[{"document_id": doc_id, "chunk_index": i}],
    ids=[f"{doc_id}_{i}"]
)

# 수정 후
collection.add(
    documents=[chunk],
    metadatas=[{
        "document_id": doc_id,
        "user_id": user_id,  # 추가
        "chunk_index": i
    }],
    ids=[f"{doc_id}_{i}"]
)
```

**유사도 검색 시**:
```python
# 기존
results = collection.query(
    query_texts=[query],
    n_results=top_k,
    where={"document_id": document_id}
)

# 수정 후
results = collection.query(
    query_texts=[query],
    n_results=top_k,
    where={
        "$and": [
            {"document_id": document_id},
            {"user_id": user_id}  # 추가
        ]
    }
)
```

---

### 7. 소유권 확인 헬퍼 함수

**파일**: `server-demo/ai/app/utils/permissions.py` (신규 생성)

**내용**:

```python
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models import Document, Chat

async def verify_document_owner(
    document_id: str,
    user_id: str,
    db: Session,
) -> Document:
    """
    문서 소유권 확인
    """
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == user_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found or access denied"
        )

    return document

async def verify_chat_owner(
    chat_id: str,
    user_id: str,
    db: Session,
) -> Chat:
    """
    채팅 소유권 확인
    """
    chat = db.query(Chat).filter(
        Chat.id == chat_id,
        Chat.user_id == user_id
    ).first()

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found or access denied"
        )

    return chat
```

---

## 체크리스트

- [ ] app/dependencies/auth.py 생성
- [ ] get_current_user_id 의존성 함수 구현
- [ ] documents.py 라우터에 user_id 의존성 추가
- [ ] chats.py 라우터에 user_id 의존성 추가
- [ ] messages.py 라우터에 user_id 의존성 추가
- [ ] Document 모델에 user_id 필드 추가
- [ ] Chat 모델에 user_id 필드 추가
- [ ] Message 모델에 user_id 필드 추가
- [ ] Alembic migration 생성 및 실행 (필요시)
- [ ] ChromaDB 메타데이터에 user_id 추가
- [ ] 유사도 검색 시 user_id 필터링 추가
- [ ] app/utils/permissions.py 생성
- [ ] verify_document_owner 함수 구현
- [ ] verify_chat_owner 함수 구현
- [ ] 모든 라우터에서 소유권 확인 로직 적용

---

## 테스트 시나리오

### 1. 사용자 격리
- [ ] 사용자 A가 문서 업로드
- [ ] 사용자 B가 사용자 A의 문서 조회 시도 시 404 반환
- [ ] 사용자 A가 자신의 문서 조회 성공

### 2. X-User-Id 헤더 검증
- [ ] X-User-Id 헤더 없이 요청 시 403 반환
- [ ] X-User-Id 헤더와 함께 요청 시 정상 처리

### 3. ChromaDB 격리
- [ ] 사용자 A의 문서로 채팅 생성
- [ ] 사용자 B의 문서로 채팅 생성
- [ ] 사용자 A의 채팅에서 검색 시 사용자 A의 문서만 조회됨

---

## 완료 조건

- 모든 FastAPI 엔드포인트에 user_id 의존성이 적용됨
- X-User-Id 헤더 없이 요청 시 403 에러 발생
- 사용자는 자신의 문서/채팅만 조회/수정/삭제 가능
- ChromaDB 검색 시 user_id로 필터링됨
- 다른 사용자의 리소스 접근 시 404 반환

---

## 다음 단계

06-subscription-api.md로 이동하여 구독 관리 API 및 결제 연동 구현
