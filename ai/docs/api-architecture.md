# Nura API Architecture

## 목차
- [개요](#개요)
- [기술 스택](#기술-스택)
- [아키텍처 다이어그램](#아키텍처-다이어그램)
- [데이터 플로우](#데이터-플로우)
- [API 엔드포인트](#api-엔드포인트)

---

## 개요

Nura는 RAG(Retrieval-Augmented Generation) 기반 문서 질의응답 시스템입니다. 사용자가 업로드한 문서를 분석하여 벡터 데이터베이스에 저장하고, GPT-4o-mini 모델을 사용하여 문서 기반 질문에 답변합니다.

### 핵심 기능
- 문서 업로드 및 자동 처리 (PDF, Markdown, Text)
- RAG 기반 질의응답
- 문서 없이도 가능한 일반 대화
- 채팅 세션 관리
- 카테고리별 채팅 분류

---

## 기술 스택

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL (with SQLAlchemy ORM)
- **Vector Database**: ChromaDB
- **LLM**: OpenAI GPT-4o-mini
- **Embeddings**: OpenAI text-embedding-3-small
- **Storage**: Google Cloud Storage (GCS)
- **Background Tasks**: FastAPI BackgroundTasks

### Frontend
- **Framework**: Next.js 15+ (React 19)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **State Management**: React Hooks

---

## 아키텍처 다이어그램

```
┌─────────────┐
│   Client    │
│  (Next.js)  │
└──────┬──────┘
       │
       │ HTTP/REST
       │
┌──────▼──────────────────────────────────────────────┐
│              FastAPI Server                         │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Routers  │  │ Services │  │  Models  │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │             │              │                 │
│       └─────────────┴──────────────┘                 │
│                     │                                │
└─────────────────────┼────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──────┐ ┌───▼────┐ ┌─────▼──────┐
│  PostgreSQL  │ │  GCS   │ │  ChromaDB  │
│   (Main DB)  │ │(Storage)│ │  (Vector)  │
└──────────────┘ └────────┘ └────────────┘
                                  │
                            ┌─────▼─────┐
                            │  OpenAI   │
                            │    API    │
                            └───────────┘
```

---

## 데이터 플로우

### 1. 문서 업로드 플로우

```
[Client]
   │
   │ POST /api/v1/documents
   │ (multipart/form-data)
   │
   ▼
[DocumentRouter]
   │
   ▼
[DocumentService.upload_document]
   │
   ├─► [Validation]
   │    ├─ File type check (pdf, md, txt)
   │    └─ File size check (max 50MB)
   │
   ├─► [Create DB Record]
   │    └─ Status: PROCESSING
   │
   ├─► [Upload to GCS]
   │    └─ Path: user-documents/{document_id}.{ext}
   │
   ├─► [Update DB]
   │    └─ filePath = GCS URL
   │
   └─► [Schedule Background Task]
        │
        ▼
     [_process_document_background]
        │
        ├─► [Extract Text]
        │    ├─ PDF: pypdf.PdfReader
        │    └─ MD/TXT: decode UTF-8
        │
        ├─► [RAGService.add_document_to_vectorstore]
        │    │
        │    ├─► [Text Splitting]
        │    │    └─ RecursiveCharacterTextSplitter
        │    │       ├─ chunk_size: 1000
        │    │       └─ chunk_overlap: 200
        │    │
        │    ├─► [Create Embeddings]
        │    │    └─ OpenAI text-embedding-3-small
        │    │
        │    └─► [Store in ChromaDB]
        │         └─ Metadata: {document_id, filename, chunk_index}
        │
        └─► [Update DB Status]
             └─ Status: COMPLETED
```

### 2. 메시지 생성 및 AI 응답 플로우

```
[Client]
   │
   │ POST /api/v1/messages
   │ Body: {
   │   chat_id?: string,
   │   content: string,
   │   document_ids?: string[],
   │   category_id?: string
   │ }
   │
   ▼
[MessageRouter]
   │
   ▼
[MessageService.create_message]
   │
   ├─► [Case 1: chat_id = null]
   │    │
   │    ├─► [Create New Chat]
   │    │    ├─ Validate category (if provided)
   │    │    ├─ Generate title (first 50 chars)
   │    │    └─ Create ChatDocument links
   │    │
   │    └─► chat_id = new_chat.id
   │
   ├─► [Case 2: chat_id != null]
   │    │
   │    └─► [Validate Chat Ownership]
   │
   ├─► [Save User Message]
   │    └─ Role: USER
   │
   ├─► [Collect Documents for RAG]
   │    │
   │    ├─► [If document_ids provided]
   │    │    ├─ Attach to message (MessageDocument)
   │    │    └─ Filter COMPLETED documents
   │    │
   │    └─► [Else]
   │         ├─ Get chat documents (ChatDocument)
   │         └─ If no chat documents → Get user's all COMPLETED documents
   │
   └─► [Generate AI Response]
        │
        ▼
     [_generate_ai_response]
        │
        ├─► [Case A: documents_for_rag exists]
        │    │
        │    ├─► [RAGService.search_similar_chunks]
        │    │    ├─ Query embedding
        │    │    ├─ Similarity search (top_k=4)
        │    │    └─ Filter by document_ids
        │    │
        │    ├─► [If chunks found]
        │    │    │
        │    │    ├─► [RAGService.generate_response]
        │    │    │    ├─ Build context from chunks
        │    │    │    ├─ Create prompt (문서 기반)
        │    │    │    └─ Call GPT-4o-mini
        │    │    │
        │    │    └─► [Build Sources]
        │    │         └─ {document_id, document_name,
        │    │             chunk_id, content_preview}
        │    │
        │    └─► [If no chunks found]
        │         └─► [Fallback to Case B]
        │
        └─► [Case B: no documents OR no relevant chunks]
             │
             └─► [RAGService.generate_response]
                  ├─ Create prompt (일반 대화)
                  ├─ Call GPT-4o-mini
                  └─ sources = None
```

1. Validate Request Body: 필수 필드(content)가 존재하고 선택적 필드(chat_id, document_ids, category_id)가 올바른 형식인지 처리 전에 확인하기 위함.

2. Case 1 - Create New Chat: chat_id가 null일 때 새로운 대화를 시작하고, 첫 메시지로부터 자동으로 제목을 생성하며 지정된 문서나 카테고리를 연결하기 위함. FAILED 상태의 문서는 차단함.

3. Case 2 - Validate Chat Ownership: 사용자가 자신의 채팅에만 메시지를 보낼 수 있도록 보장하여, 다른 사용자의 대화에 대한 무단 접근을 방지하기 위함.

4. Save User Message: 완전한 대화 이력을 유지하기 위해 사용자의 질문을 role "USER"로 데이터베이스에 기록하여 문맥을 제공하기 위함.

5. Collect Documents for RAG: 어떤 문서를 컨텍스트로 사용할지 결정하기 위함. 우선순위: (1) 새로 제공된 document_ids, (2) 기존 채팅 문서, (3) 사용자의 모든 COMPLETED 문서. COMPLETED 상태의 문서만 필터링함.

6. RAGService.search_similar_chunks: 질문을 임베딩으로 변환하고 ChromaDB에서 유사도 검색(top_k=4)을 수행하여 지정된 문서에서 가장 관련성 높은 텍스트 조각을 찾기 위함.

7. Build Context from Chunks: 검색된 텍스트 조각들을 AI가 정확하고 문서 기반의 답변을 생성하는 데 도움이 되는 일관된 컨텍스트로 조합하기 위함.

8. Create Prompt (문서 기반): 제공된 문서 컨텍스트를 기반으로 답변하도록 AI에게 지시하는 특화된 프롬프트를 구성하여, 응답이 실제 내용에 근거하도록 보장하기 위함.

9. Call GPT-4o-mini: 준비된 컨텍스트와 프롬프트를 사용하여 OpenAI의 언어 모델로 자연어 응답을 생성하기 위함.

10. Build Sources: 어떤 문서 조각이 사용되었는지에 대한 메타데이터(document_id, document_name, chunk_id, content_preview)를 포함하여 사용자가 답변을 검증할 수 있도록 투명성을 제공하기 위함.

11. Fallback to Case B: 문서는 존재하지만 질문과 관련된 텍스트 조각을 찾지 못했을 때, 고정 메시지로 거부하는 대신 Case B(일반 대화 모드)로 전환하여 AI가 일반 지식으로 답변할 수 있도록 하기 위함. 이를 통해 사용자 경험을 개선하고 AI의 활용 범위를 확장함.

12. Case B - General Conversation: 다음 두 경우에 실행됨. (1) 모든 문서 수집 시도 후에도 사용 가능한 문서가 하나도 없는 경우, (2) 문서는 있지만 관련 텍스트 조각을 찾지 못한 경우. AI가 문서 컨텍스트 없이 일반 지식을 기반으로 자유롭게 응답할 수 있도록 하며, sources는 None으로 설정됨.

13. Save AI Response: 대화 턴을 완료하기 위해 어시스턴트의 답변을 소스 메타데이터와 함께 role "ASSISTANT"로 데이터베이스에 저장하고, 채팅의 updatedAt을 갱신하기 위함.

### 3. 메시지 조회 플로우

```
[Client]
   │
   │ GET /api/v1/messages?chat_id={id}&page=1&limit=50
   │
   ▼
[MessageRouter]
   │
   ▼
[MessageService.get_messages]
   │
   ├─► [Query Messages]
   │    ├─ WHERE chatId = {id} AND deletedAt IS NULL
   │    ├─ ORDER BY createdAt ASC
   │    └─ LIMIT/OFFSET pagination
   │
   ├─► [For each message]
   │    │
   │    └─► [Load Attached Documents]
   │         └─ JOIN MessageDocument + Document
   │
   └─► [Return Response]
        └─ {chat_id, messages[], total, page, limit}
```

---

## API 엔드포인트

### Documents API

#### `POST /api/v1/documents`
문서 업로드

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  ```
  file: File (PDF, MD, TXT)
  user_id: string (query param, default: "default-user")
  ```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEX...",
    "filename": "document.pdf",
    "file_path": "https://storage.googleapis.com/...",
    "file_type": "pdf",
    "file_size": 1024000,
    "status": "processing",
    "created_at": "2025-01-20T12:00:00"
  },
  "message": "Success"
}
```

**Status Values:**
- `processing`: 문서 처리 중
- `completed`: 처리 완료 (RAG 사용 가능)
- `failed`: 처리 실패

#### `GET /api/v1/documents`
문서 목록 조회

**Query Parameters:**
- `status?: string` - 상태 필터 (processing, completed, failed)
- `page?: number` - 페이지 번호 (default: 1)
- `limit?: number` - 페이지당 개수 (default: 20, max: 100)

**Response:**
```json
{
  "success": true,
  "data": {
    "documents": [...],
    "total": 10,
    "page": 1,
    "limit": 20
  }
}
```

#### `GET /api/v1/documents/{document_id}`
문서 상세 조회

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEX...",
    "filename": "document.pdf",
    "file_path": "https://storage.googleapis.com/...",
    "file_type": "pdf",
    "file_size": 1024000,
    "status": "completed",
    "chunk_count": 42,
    "created_at": "2025-01-20T12:00:00"
  }
}
```

---

### Messages API

#### `POST /api/v1/messages`
메시지 생성 (AI 응답 포함)

**Request:**
```json
{
  "chat_id": "01JFEX...",  // null이면 새 채팅 생성
  "content": "문서 내용을 요약해줘",
  "document_ids": ["01JFEX...", "01JFEY..."],  // optional
  "category_id": "01JFEX...",  // optional (새 채팅 생성 시)
  "user_id": "default-user"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "chat": {  // chat_id가 null인 경우에만 포함
      "id": "01JFEX...",
      "title": "문서 내용을 요약해줘",
      "category": {
        "id": "01JFEX...",
        "name": "일반"
      },
      "documents": [
        {"id": "01JFEX...", "filename": "doc.pdf"}
      ],
      "created_at": "2025-01-20T12:00:00"
    },
    "user_message": {
      "id": "01JFEX...",
      "chat_id": "01JFEX...",
      "role": "user",
      "content": "문서 내용을 요약해줘",
      "attached_documents": [
        {"id": "01JFEX...", "filename": "doc.pdf"}
      ],
      "sources": null,
      "created_at": "2025-01-20T12:00:00"
    },
    "assistant_message": {
      "id": "01JFEY...",
      "chat_id": "01JFEX...",
      "role": "assistant",
      "content": "문서 내용을 요약하면...",
      "attached_documents": [],
      "sources": [
        {
          "document_id": "01JFEX...",
          "document_name": "doc.pdf",
          "chunk_id": "01JFEX..._0",
          "page": null,
          "similarity": 0.95,
          "content_preview": "This document contains..."
        }
      ],
      "created_at": "2025-01-20T12:00:01"
    }
  }
}
```

#### `GET /api/v1/messages`
메시지 목록 조회

**Query Parameters:**
- `chat_id: string` - 채팅 ID (required)
- `page?: number` - 페이지 번호 (default: 1)
- `limit?: number` - 페이지당 개수 (default: 50)

**Response:**
```json
{
  "success": true,
  "data": {
    "chat_id": "01JFEX...",
    "messages": [
      {
        "id": "01JFEX...",
        "chat_id": "01JFEX...",
        "role": "user",
        "content": "안녕하세요",
        "attached_documents": [],
        "sources": null,
        "created_at": "2025-01-20T12:00:00"
      },
      {
        "id": "01JFEY...",
        "chat_id": "01JFEX...",
        "role": "assistant",
        "content": "안녕하세요! 무엇을 도와드릴까요?",
        "attached_documents": [],
        "sources": null,
        "created_at": "2025-01-20T12:00:01"
      }
    ],
    "total": 2,
    "page": 1,
    "limit": 50
  }
}
```

---

### Chats API

#### `GET /api/v1/chats`
채팅 목록 조회

**Query Parameters:**
- `category_id?: string` - 카테고리 필터
- `page?: number` - 페이지 번호 (default: 1)
- `limit?: number` - 페이지당 개수 (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "chats": [
      {
        "id": "01JFEX...",
        "title": "문서 요약 질문",
        "category": {
          "id": "01JFEX...",
          "name": "일반"
        },
        "documents": [
          {"id": "01JFEX...", "filename": "doc.pdf"}
        ],
        "last_message": "문서 내용을 요약하면...",
        "created_at": "2025-01-20T12:00:00",
        "updated_at": "2025-01-20T12:05:00"
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 20
  }
}
```

---

## 데이터 모델

### Document
```python
{
  "id": str,              # ULID
  "userId": str,          # 사용자 ID
  "filename": str,        # 원본 파일명
  "filePath": str,        # GCS URL
  "fileType": enum,       # pdf | md | txt
  "fileSize": int,        # bytes
  "status": enum,         # processing | completed | failed
  "chunkCount": int,      # 청크 개수
  "createdAt": datetime,
  "updatedAt": datetime,
  "deletedAt": datetime?
}
```

### Message
```python
{
  "id": str,              # ULID
  "chatId": str,          # 채팅 ID
  "role": enum,           # user | assistant
  "content": str,         # 메시지 내용
  "sources": list?,       # RAG 소스 정보 (assistant만)
  "createdAt": datetime,
  "updatedAt": datetime,
  "deletedAt": datetime?
}
```

### Chat
```python
{
  "id": str,              # ULID
  "userId": str,          # 사용자 ID
  "categoryId": str?,     # 카테고리 ID
  "title": str,           # 채팅 제목
  "createdAt": datetime,
  "updatedAt": datetime,
  "deletedAt": datetime?
}
```

---

## RAG 파라미터

### Chunking
- **chunk_size**: 1000 characters
- **chunk_overlap**: 200 characters
- **separators**: `["\n\n", "\n", " ", ""]`

### Retrieval
- **top_k**: 4 chunks
- **embedding_model**: text-embedding-3-small
- **vector_db**: ChromaDB (local persist)

### Generation
- **model**: gpt-4o-mini
- **temperature**: 0.0
- **max_tokens**: 1000

---

## 에러 처리

### HTTP Status Codes
- `200`: Success
- `400`: Bad Request (유효성 검증 실패)
- `404`: Not Found (리소스 없음)
- `413`: Request Entity Too Large (파일 크기 초과)
- `415`: Unsupported Media Type (지원하지 않는 파일 타입)
- `500`: Internal Server Error

### Error Response Format
```json
{
  "success": false,
  "data": null,
  "message": "Error message",
  "detail": "Detailed error information"
}
```

---

## 보안 고려사항

### 파일 업로드
- 파일 타입 검증 (whitelist)
- 파일 크기 제한 (50MB)
- GCS 서비스 계정 인증 사용
- 파일은 private 저장 (인증된 접근만 허용)

### API 인증
- 현재: user_id 기반 (개발 단계)
- 향후: JWT/OAuth 인증 추가 필요

### 데이터베이스
- Soft delete (deletedAt) 사용
- SQLAlchemy ORM으로 SQL Injection 방지
- AsyncPG 드라이버 사용

---

## 성능 최적화

### Background Processing
- 문서 처리는 비동기 백그라운드 태스크로 실행
- 사용자는 즉시 응답 받고 처리 상태 확인 가능

### Database
- 인덱스: chatId, userId, documentId
- Pagination 적용 (모든 목록 조회)
- Soft delete로 성능 유지

### Caching
- RAG 서비스 싱글톤 패턴 (embeddings, vectorstore, llm)
- ChromaDB 로컬 persist로 재시작 시에도 데이터 유지

---

## 개발 환경 설정

### Backend
```bash
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd web
npm install
npm run dev
```

### Environment Variables
`.env.development` 파일 필요:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/nura
OPENAI_API_KEY=sk-...
GCP_PROJECT_ID=project-id
GCP_BUCKET_NAME=bucket-name
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```
