# Nura API 문서

## Base URL
```
http://localhost:8000/api/v1
```

---

## Documents API

### 문서 업로드
RAG 처리를 위한 문서를 업로드합니다.

**엔드포인트:** `POST /documents`

**Content-Type:** `multipart/form-data`

**파라미터:**
- `file` (필수): 업로드할 파일 (PDF, Markdown, Text)
- `user_id` (쿼리, 선택): 사용자 ID (기본값: "default-user")

**응답:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXAMPLE123",
    "filename": "document.pdf",
    "file_path": "https://storage.googleapis.com/...",
    "file_type": "pdf",
    "file_size": 1024000,
    "status": "processing",
    "chunk_count": null,
    "created_at": "2025-01-20T12:00:00",
    "updated_at": "2025-01-20T12:00:00"
  },
  "message": "Success"
}
```

**문서 상태 값:**
- `processing`: 백그라운드에서 문서 처리 중
- `completed`: 처리 완료, RAG 쿼리 준비 완료
- `failed`: 처리 실패

**에러 응답:**
- `400 Bad Request`: 잘못된 파일 형식 또는 크기 (최대 50MB)
- `500 Internal Server Error`: 업로드 또는 처리 실패

---

## Messages API

### 메시지 생성
메시지를 전송하고 AI 생성 응답을 받습니다. `chat_id`가 null이면 자동으로 새 채팅을 생성합니다.

**엔드포인트:** `POST /messages`

**Content-Type:** `application/json`

**요청 본문:**
```json
{
  "chat_id": "01JFEXAMPLE123",
  "content": "업로드한 문서를 요약해줘",
  "document_ids": ["01JFEXDOC001", "01JFEXDOC002"],
  "category_id": "01JFEXCAT001",
  "user_id": "default-user"
}
```

**파라미터:**
- `chat_id` (선택): 채팅 ID. null이면 새 채팅 생성
- `content` (필수): 사용자 메시지 내용
- `document_ids` (선택): 이 메시지에 첨부할 문서 ID 목록
- `category_id` (선택): 카테고리 ID (새 채팅 생성 시에만 사용)
- `user_id` (선택): 사용자 ID (기본값: "default-user")

**문서 선택 우선순위:**
1. `document_ids`가 제공된 경우 → 지정된 문서 사용
2. 채팅에 연결된 문서가 있는 경우 → 채팅 문서 사용
3. 사용자가 업로드한 문서가 있는 경우 → 사용자의 모든 COMPLETED 문서 사용
4. 사용 가능한 문서가 없는 경우 → 일반 대화 모드

**응답 (새 채팅 생성):**
```json
{
  "success": true,
  "data": {
    "chat": {
      "id": "01JFEXCHAT001",
      "title": "업로드한 문서를 요약해줘",
      "category": {
        "id": "01JFEXCAT001",
        "name": "일반"
      },
      "documents": [
        {
          "id": "01JFEXDOC001",
          "filename": "document.pdf"
        }
      ],
      "created_at": "2025-01-20T12:00:00"
    },
    "user_message": {
      "id": "01JFEXMSG001",
      "chat_id": "01JFEXCHAT001",
      "role": "user",
      "content": "업로드한 문서를 요약해줘",
      "attached_documents": [
        {
          "id": "01JFEXDOC001",
          "filename": "document.pdf"
        }
      ],
      "sources": null,
      "created_at": "2025-01-20T12:00:00"
    },
    "assistant_message": {
      "id": "01JFEXMSG002",
      "chat_id": "01JFEXCHAT001",
      "role": "assistant",
      "content": "문서에 따르면...",
      "attached_documents": [],
      "sources": [
        {
          "document_id": "01JFEXDOC001",
          "document_name": "document.pdf",
          "chunk_id": "01JFEXDOC001_0",
          "page": null,
          "similarity": 0.95,
          "content_preview": "이 문서는..."
        }
      ],
      "created_at": "2025-01-20T12:00:01"
    }
  },
  "message": "Success"
}
```

**응답 (기존 채팅):**
```json
{
  "success": true,
  "data": {
    "chat": null,
    "user_message": { ... },
    "assistant_message": { ... }
  },
  "message": "Success"
}
```

**AI 응답 동작:**
- **관련 문서 청크 발견**: 문서 내용을 기반으로 출처 인용과 함께 응답 생성
- **관련 청크 없음 (폴백)**: 거부하지 않고 일반 대화 모드로 전환
- **문서 없음**: 일반 대화 모드

**에러 응답:**
- `400 Bad Request`: 잘못된 요청 본문 또는 문서 미준비
- `404 Not Found`: 채팅 또는 문서를 찾을 수 없음
- `500 Internal Server Error`: AI 생성 실패

---

## Chats API

### 채팅 목록 조회
사용자의 모든 채팅을 조회합니다.

**엔드포인트:** `GET /chats`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID
- `category_id` (선택): 카테고리별 필터링
- `page` (선택): 페이지 번호 (기본값: 1)
- `limit` (선택): 페이지당 항목 수 (기본값: 20, 최대: 100)

**응답:**
```json
{
  "success": true,
  "data": [
    {
      "id": "01JFEXCHAT001",
      "title": "문서 요약 채팅",
      "category": {
        "id": "01JFEXCAT001",
        "name": "일반"
      },
      "documents": [
        {
          "id": "01JFEXDOC001",
          "filename": "document.pdf"
        }
      ],
      "last_message": "문서에 따르면...",
      "created_at": "2025-01-20T12:00:00",
      "updated_at": "2025-01-20T12:05:00"
    }
  ],
  "message": "Success"
}
```

---

### 채팅 상세 조회
특정 채팅의 상세 정보를 조회합니다.

**엔드포인트:** `GET /chats/{chat_id}`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID

**응답:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCHAT001",
    "title": "문서 요약 채팅",
    "category": {
      "id": "01JFEXCAT001",
      "name": "일반"
    },
    "documents": [
      {
        "id": "01JFEXDOC001",
        "filename": "document.pdf",
        "status": "completed"
      }
    ],
    "created_at": "2025-01-20T12:00:00",
    "updated_at": "2025-01-20T12:05:00"
  },
  "message": "Success"
}
```

**에러 응답:**
- `404 Not Found`: 채팅을 찾을 수 없거나 권한 없음

---

### 채팅 수정
채팅 제목 또는 카테고리를 수정합니다.

**엔드포인트:** `PATCH /chats/{chat_id}`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID

**요청 본문:**
```json
{
  "title": "수정된 채팅 제목",
  "category_id": "01JFEXCAT002"
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCHAT001",
    "title": "수정된 채팅 제목",
    "category": {
      "id": "01JFEXCAT002",
      "name": "업무"
    },
    "documents": [...],
    "last_message": "...",
    "created_at": "2025-01-20T12:00:00",
    "updated_at": "2025-01-20T13:00:00"
  },
  "message": "Success"
}
```

---

### 채팅에서 카테고리 제거
채팅의 카테고리 할당을 제거합니다.

**엔드포인트:** `DELETE /chats/{chat_id}/category`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID

**응답:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCHAT001",
    "title": "문서 요약 채팅",
    "category": null,
    "documents": [...],
    "last_message": "...",
    "created_at": "2025-01-20T12:00:00",
    "updated_at": "2025-01-20T13:00:00"
  },
  "message": "Success"
}
```

---

### 채팅 삭제
채팅을 소프트 삭제합니다.

**엔드포인트:** `DELETE /chats/{chat_id}`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID

**응답:**
```json
{
  "success": true,
  "data": {
    "deleted_chat_id": "01JFEXCHAT001"
  },
  "message": "Success"
}
```

---

### 채팅 일괄 삭제
여러 채팅을 한 번에 삭제합니다.

**엔드포인트:** `POST /chats/bulk-delete`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID

**요청 본문:**
```json
["01JFEXCHAT001", "01JFEXCHAT002", "01JFEXCHAT003"]
```

**응답:**
```json
{
  "success": true,
  "data": {
    "deleted_count": 3,
    "deleted_chat_ids": ["01JFEXCHAT001", "01JFEXCHAT002", "01JFEXCHAT003"]
  },
  "message": "Success"
}
```

---

### 채팅 메시지 조회
채팅의 모든 메시지를 조회합니다.

**엔드포인트:** `GET /chats/{chat_id}/messages`

**쿼리 파라미터:**
- `page` (선택): 페이지 번호 (기본값: 1)
- `limit` (선택): 페이지당 항목 수 (기본값: 50, 최대: 100)

**응답:**
```json
{
  "success": true,
  "data": {
    "chat_id": "01JFEXCHAT001",
    "messages": [
      {
        "id": "01JFEXMSG001",
        "chat_id": "01JFEXCHAT001",
        "role": "user",
        "content": "안녕하세요",
        "attached_documents": [],
        "sources": null,
        "created_at": "2025-01-20T12:00:00"
      },
      {
        "id": "01JFEXMSG002",
        "chat_id": "01JFEXCHAT001",
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
  },
  "message": "Success"
}
```

---

## Categories API

### 카테고리 목록 조회
사용자의 모든 카테고리를 조회합니다.

**엔드포인트:** `GET /categories`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID
- `page` (선택): 페이지 번호 (기본값: 1)
- `limit` (선택): 페이지당 항목 수 (기본값: 20, 최대: 100)

**응답:**
```json
{
  "success": true,
  "data": [
    {
      "id": "01JFEXCAT001",
      "name": "일반",
      "chat_count": 5,
      "created_at": "2025-01-20T10:00:00",
      "updated_at": "2025-01-20T10:00:00"
    }
  ],
  "message": "Success"
}
```

---

### 카테고리 생성
새 카테고리를 생성합니다.

**엔드포인트:** `POST /categories`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID

**요청 본문:**
```json
{
  "name": "업무"
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCAT002",
    "name": "업무",
    "chat_count": 0,
    "created_at": "2025-01-20T14:00:00",
    "updated_at": "2025-01-20T14:00:00"
  },
  "message": "Success"
}
```

**에러 응답:**
- `400 Bad Request`: 중복된 카테고리 이름

---

### 카테고리 상세 조회
카테고리의 상세 정보를 조회합니다.

**엔드포인트:** `GET /categories/{category_id}`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID

**응답:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCAT001",
    "name": "일반",
    "chats": [
      {
        "id": "01JFEXCHAT001",
        "title": "채팅 1",
        "last_message": "...",
        "created_at": "2025-01-20T12:00:00"
      }
    ],
    "created_at": "2025-01-20T10:00:00",
    "updated_at": "2025-01-20T10:00:00"
  },
  "message": "Success"
}
```

---

### 카테고리 수정
카테고리 이름을 수정합니다.

**엔드포인트:** `PATCH /categories/{category_id}`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID

**요청 본문:**
```json
{
  "name": "수정된 이름"
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCAT001",
    "name": "수정된 이름",
    "chat_count": 5,
    "created_at": "2025-01-20T10:00:00",
    "updated_at": "2025-01-20T15:00:00"
  },
  "message": "Success"
}
```

---

### 카테고리 삭제
카테고리를 소프트 삭제합니다.

**엔드포인트:** `DELETE /categories/{category_id}`

**쿼리 파라미터:**
- `user_id` (필수): 사용자 ID

**응답:**
```json
{
  "success": true,
  "data": {
    "deleted_category_id": "01JFEXCAT001"
  },
  "message": "Success"
}
```

---

## 데이터 모델

### Message
```typescript
{
  id: string;              // ULID
  chat_id: string;         // 채팅 ID
  role: "user" | "assistant";
  content: string;         // 메시지 내용 (assistant는 Markdown)
  attached_documents: Array<{
    id: string;
    filename: string;
  }>;
  sources: Array<{        // RAG 사용 시 assistant 메시지에만 포함
    document_id: string;
    document_name: string;
    chunk_id: string;
    page: number | null;
    similarity: number;
    content_preview: string;
  }> | null;
  created_at: string;      // ISO 8601
}
```

### Document
```typescript
{
  id: string;              // ULID
  filename: string;        // 원본 파일명
  file_path: string;       // GCS URL
  file_type: "pdf" | "markdown" | "text";
  file_size: number;       // 바이트
  status: "processing" | "completed" | "failed";
  chunk_count: number | null;
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}
```

### Chat
```typescript
{
  id: string;              // ULID
  title: string;           // 채팅 제목
  category: {
    id: string;
    name: string;
  } | null;
  documents: Array<{
    id: string;
    filename: string;
  }>;
  last_message: string;
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}
```

### Category
```typescript
{
  id: string;              // ULID
  name: string;            // 카테고리 이름
  chat_count: number;      // 채팅 개수
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}
```

---

## 에러 처리

### HTTP 상태 코드
- `200 OK`: 성공
- `201 Created`: 리소스 생성 성공
- `400 Bad Request`: 잘못된 요청 (유효성 검증 실패)
- `404 Not Found`: 리소스를 찾을 수 없음
- `413 Request Entity Too Large`: 파일 크기 제한 초과
- `415 Unsupported Media Type`: 지원하지 않는 파일 형식
- `500 Internal Server Error`: 서버 에러

### 에러 응답 형식
```json
{
  "success": false,
  "data": null,
  "message": "에러 메시지",
  "detail": "상세 에러 정보"
}
```

---

## RAG 설정

### 텍스트 처리
- **청크 크기**: 1000자
- **청크 중첩**: 200자
- **구분자**: `["\n\n", "\n", " ", ""]`

### 벡터 검색
- **Top K 결과**: 4개 청크
- **임베딩 모델**: OpenAI text-embedding-3-small
- **벡터 데이터베이스**: ChromaDB (로컬 영구 저장)

### 응답 생성
- **모델**: GPT-4o-mini
- **Temperature**: 0.0
- **Max Tokens**: 1000
