# Database Architecture

> PostgreSQL + ChromaDB 데이터베이스 아키텍처

## Table of Contents
- [1. 개요](#1-개요)
- [2. PostgreSQL 스키마](#2-postgresql-스키마)
- [3. ChromaDB 벡터 스토어](#3-chromadb-벡터-스토어)
- [4. 데이터베이스 최적화](#4-데이터베이스-최적화)

---

## 1. 개요

NewLearnNote는 **PostgreSQL**과 **ChromaDB** 두 가지 데이터베이스를 사용합니다.

### 1.1 데이터베이스 역할 분리

| 데이터베이스 | 용도 | 데이터 |
|--------------|------|--------|
| **PostgreSQL** | 메타데이터 저장 | 사용자, 노트, 라이브러리, 채팅 |
| **ChromaDB** | 벡터 검색 | 문서 임베딩, 유사도 검색 |

### 1.2 데이터베이스 연결

**NestJS (PostgreSQL):**
```typescript
// Prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**FastAPI (PostgreSQL + ChromaDB):**
```python
# PostgreSQL (SQLAlchemy)
DATABASE_URL = "postgresql://user:password@localhost:5432/newlearnnote"

# ChromaDB
CHROMA_DB_PATH = "./chroma"
```

---

## 2. PostgreSQL 스키마

### 2.1 ERD (Entity Relationship Diagram)

```mermaid
erDiagram
    User ||--o{ Library : owns
    User ||--o{ Note : writes
    User ||--o{ Chat : creates

    Library ||--o{ Note : contains

    Note ||--o{ NoteNetwork : source
    Note ||--o{ NoteNetwork : target
    Note ||--o{ NoteTag : has
    Note ||--o{ NoteBookmark : bookmarked_by

    Tag ||--o{ NoteTag : tagged_in

    Chat ||--o{ Message : contains
    Chat ||--o{ ChatDocument : references

    Document ||--o{ ChatDocument : used_in
    Document ||--o{ MessageDocument : referenced_in

    Message ||--o{ MessageDocument : references

    User {
        uuid id PK
        string email UK
        string name
        string avatar_url
        timestamp created_at
        timestamp updated_at
    }

    Library {
        uuid id PK
        uuid user_id FK
        string name
        string description
        enum visibility
        timestamp created_at
    }

    Note {
        uuid id PK
        uuid user_id FK
        uuid library_id FK
        string title
        text content
        timestamp published_at
        timestamp deleted_at
    }

    NoteNetwork {
        uuid id PK
        uuid source_note_id FK
        uuid target_note_id FK
        enum link_type
        timestamp created_at
    }

    Chat {
        uuid id PK
        uuid user_id FK
        uuid category_id FK
        string title
        timestamp created_at
        timestamp deleted_at
    }

    Message {
        uuid id PK
        uuid chat_id FK
        enum role
        text content
        timestamp created_at
    }

    Document {
        uuid id PK
        uuid user_id FK
        string filename
        string file_path
        int file_size
        int total_chunks
        timestamp created_at
        timestamp deleted_at
    }
```

### 2.2 핵심 테이블 상세

#### User (사용자)

```sql
CREATE TABLE "User" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  provider VARCHAR(50) DEFAULT 'google',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_email ON "User"(email);
```

#### Library (라이브러리)

```sql
CREATE TABLE "Library" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  visibility VARCHAR(20) DEFAULT 'private', -- 'private', 'published'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_library_user ON "Library"(user_id);
CREATE INDEX idx_library_visibility ON "Library"(visibility);
```

#### Note (노트)

```sql
CREATE TABLE "Note" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  library_id UUID REFERENCES "Library"(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP  -- Soft Delete
);

CREATE INDEX idx_note_user_library ON "Note"(user_id, library_id, deleted_at);
CREATE INDEX idx_note_published ON "Note"(published_at) WHERE deleted_at IS NULL;
```

#### NoteNetwork (노트 간 연결)

```sql
CREATE TABLE "NoteNetwork" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_note_id UUID NOT NULL REFERENCES "Note"(id) ON DELETE CASCADE,
  target_note_id UUID NOT NULL REFERENCES "Note"(id) ON DELETE CASCADE,
  link_type VARCHAR(20) DEFAULT 'linked',  -- 'linked', 'embed'
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_note_link UNIQUE (source_note_id, target_note_id)
);

CREATE INDEX idx_note_network_source ON "NoteNetwork"(source_note_id);
CREATE INDEX idx_note_network_target ON "NoteNetwork"(target_note_id);
```

**Self-Join 구조:**
- Source Note → Target Note 관계 모델링
- 양방향 연결 지원
- 링크 타입: `linked` (참조), `embed` (임베드)

#### Chat (채팅방)

```sql
CREATE TABLE "Chat" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
  category_id UUID REFERENCES "Category"(id) ON DELETE SET NULL,
  title VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_chat_user ON "Chat"(user_id, deleted_at);
```

#### Message (메시지)

```sql
CREATE TABLE "Message" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES "Chat"(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,  -- 'user', 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_message_chat_created ON "Message"(chat_id, created_at DESC);
```

**대화 히스토리 조회 최적화:**
```sql
-- 최근 10개 메시지 조회 (인덱스 활용)
SELECT * FROM "Message"
WHERE chat_id = '...'
ORDER BY created_at DESC
LIMIT 10;
```

#### Document (문서)

```sql
CREATE TABLE "Document" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
  filename VARCHAR(500) NOT NULL,
  file_path TEXT NOT NULL,  -- GCS URL
  file_size INTEGER NOT NULL,
  file_type VARCHAR(10),  -- 'pdf', 'md', 'txt'
  total_chunks INTEGER,  -- 청킹 후 개수
  status VARCHAR(20) DEFAULT 'processing',  -- 'processing', 'completed', 'failed'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_document_user ON "Document"(user_id, deleted_at);
CREATE INDEX idx_document_status ON "Document"(status);
```

### 2.3 Soft Delete 전략

**모든 주요 테이블에 `deleted_at` 컬럼:**
```sql
-- Soft Delete
UPDATE "Note"
SET deleted_at = NOW()
WHERE id = '...';

-- 조회 시 제외
SELECT * FROM "Note"
WHERE deleted_at IS NULL;
```

**장점:**
- ✅ 데이터 복구 가능
- ✅ 감사(Audit) 추적
- ✅ 참조 무결성 유지

---

## 3. ChromaDB 벡터 스토어

### 3.1 ChromaDB 구조

```mermaid
graph TB
    subgraph "Document Processing"
        DOC[원본 문서] -->|텍스트 추출| TEXT[Plain Text]
        TEXT -->|청킹| CHUNKS[청크 리스트]
        CHUNKS -->|임베딩 생성| VECTORS[벡터 리스트]
    end

    subgraph "ChromaDB Storage"
        VECTORS --> CHROMA[(ChromaDB)]
        CHROMA --> COLLECTION[Collection: documents]
        COLLECTION --> ENTRY1[청크 1<br/>- content<br/>- embedding<br/>- metadata]
        COLLECTION --> ENTRY2[청크 2<br/>- content<br/>- embedding<br/>- metadata]
        COLLECTION --> ENTRY3[청크 N<br/>- content<br/>- embedding<br/>- metadata]
    end

    subgraph "Metadata Structure"
        META[Metadata] --> DOC_ID[document_id: UUID]
        META --> FILENAME[filename: string]
        META --> FILE_TYPE[fileType: pdf/md/txt]
        META --> CHUNK_IDX[chunk_index: int]
    end

    style CHROMA fill:#FF6B6B,color:#fff
```

### 3.2 벡터 저장 구조

**ChromaDB 데이터 포맷:**
```python
{
    "id": "doc123_chunk_0",  # 청크 고유 ID
    "embedding": [0.123, -0.456, ...],  # 1536-dim vector (text-embedding-3-small)
    "document": "청크 텍스트 내용...",  # 원본 텍스트
    "metadata": {
        "document_id": "uuid-xxx",  # PostgreSQL Document ID
        "filename": "ML_notes.pdf",
        "fileType": "pdf",
        "chunk_index": 0  # 청크 순서
    }
}
```

### 3.3 ChromaDB 설정

```python
# app/services/rag_service.py
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings

# Chroma 초기화
vectorstore = Chroma(
    persist_directory="./chroma",  # 로컬 저장소
    embedding_function=OpenAIEmbeddings(
        model="text-embedding-3-small"
    ),
    collection_name="documents",
    collection_metadata={
        "hnsw:space": "cosine",  # 코사인 유사도
        "hnsw:construction_ef": 200,  # 인덱스 품질
        "hnsw:M": 16  # 연결 수
    }
)
```

### 3.4 청킹 전략

**RecursiveCharacterTextSplitter:**
```python
from langchain.text_splitters import RecursiveCharacterTextSplitter

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,  # 청크 크기
    chunk_overlap=200,  # 중복 영역
    length_function=len,
    separators=["\n\n", "\n", " ", ""]  # 분할 우선순위
)

chunks = text_splitter.split_text(text)
```

**청킹 예시:**
```
원본 텍스트 (3000자)
↓
청크 1: 0-1000자
청크 2: 800-1800자 (200자 중복)
청크 3: 1600-2600자 (200자 중복)
청크 4: 2400-3000자 (200자 중복)
```

**중복(Overlap)이 필요한 이유:**
- 청크 경계에서 정보 손실 방지
- 문맥 연속성 유지
- 검색 정확도 향상

---

## 4. 데이터베이스 최적화

### 4.1 인덱싱 전략

**복합 인덱스:**
```sql
-- 사용자의 삭제되지 않은 노트 조회
CREATE INDEX idx_note_user_library ON "Note"(user_id, library_id, deleted_at);

-- 쿼리 최적화
SELECT * FROM "Note"
WHERE user_id = '...' AND library_id = '...' AND deleted_at IS NULL;
```

**부분 인덱스 (Partial Index):**
```sql
-- 발행된 노트만 인덱싱
CREATE INDEX idx_note_published ON "Note"(published_at)
WHERE deleted_at IS NULL;
```

### 4.2 N+1 쿼리 방지

**문제 상황:**
```typescript
// ❌ N+1 쿼리 발생
const notes = await prisma.note.findMany();
for (const note of notes) {
  const user = await prisma.user.findUnique({ where: { id: note.userId } });
}
// 총 쿼리: 1 (notes) + N (users) = N+1
```

**해결책 (Eager Loading):**
```typescript
// ✅ JOIN으로 한 번에 조회
const notes = await prisma.note.findMany({
  include: {
    user: true,
    library: true,
    tags: {
      include: {
        tag: true
      }
    }
  }
});
// 총 쿼리: 1
```

### 4.3 벡터 검색 최적화

**HNSW 인덱스:**
```python
# Hierarchical Navigable Small World
# - 근사 최근접 이웃 검색 (ANN)
# - O(log N) 시간 복잡도

vectorstore = Chroma(
    collection_metadata={
        "hnsw:space": "cosine",
        "hnsw:construction_ef": 200,  # 높을수록 정확, 느림
        "hnsw:M": 16  # 연결 수 (메모리 vs 속도)
    }
)
```

**검색 시간 비교:**
- **Brute Force**: O(N) - 10,000개 문서 = 1초
- **HNSW**: O(log N) - 10,000개 문서 = 0.01초 (100배 빠름)

### 4.4 PostgreSQL 쿼리 최적화

**EXPLAIN ANALYZE 활용:**
```sql
EXPLAIN ANALYZE
SELECT * FROM "Message"
WHERE chat_id = '...'
ORDER BY created_at DESC
LIMIT 10;

-- 출력 예시:
-- Index Scan using idx_message_chat_created on "Message"
-- (cost=0.29..8.31 rows=10 width=100)
-- (actual time=0.023..0.045 rows=10 loops=1)
```

**인덱스 사용 여부 확인:**
- `Index Scan`: 인덱스 사용 ✅
- `Seq Scan`: 전체 테이블 스캔 ❌ (인덱스 필요)

---

## 5. 데이터 마이그레이션

### 5.1 Prisma 마이그레이션

**개발 환경:**
```bash
# 마이그레이션 생성
npx prisma migrate dev --name add_document_table

# 마이그레이션 적용
npx prisma migrate deploy
```

**프로덕션 환경:**
```bash
# 마이그레이션 적용 (다운타임 최소화)
npx prisma migrate deploy
```

### 5.2 FastAPI (SQLAlchemy)

**Alembic 마이그레이션:**
```bash
# 마이그레이션 생성
alembic revision --autogenerate -m "Add document table"

# 마이그레이션 적용
alembic upgrade head
```

---

## 참고 자료

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [SQLAlchemy ORM](https://docs.sqlalchemy.org/en/20/)
