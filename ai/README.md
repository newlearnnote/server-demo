# Nura 백엔드

> Nura Web UI: [Nura Web Github Repository](https://github.com/newlearnnote/Nura-web/blob/main/README.md)

## 개요

![main-img](./imgs/nura-main-img.png)

Nura는 RAG(Retrieval-Augmented Generation) 기반 문서 채팅 시스템으로, 사용자가 문서를 업로드하고 자연어 대화를 통해 상호작용할 수 있습니다. 

이 시스템은 문서 기반 질의응답과 일반 대화 기능을 지능적으로 결합하여, 특정 문서 내용을 확인하거나 일반적인 대화를 나눌 때 매끄러운 경험을 제공합니다. 또한 카테고리 기능으로 여러 채팅을 정리할 수 있습니다.

백엔드는 FastAPI로 구축되었으며, 응답 생성을 위해 OpenAI의 GPT-4o-mini, 벡터 저장을 위해 ChromaDB, 문서 관리를 위해 Google Cloud Storage를 활용합니다.




## API 엔드포인트

> [API 명세서](docs/api.kr.md)에서 자세한 요청과 응답 예시 확인 가능

### Documents

**문서 업로드** - `POST /documents`
PDF, Markdown 또는 텍스트 파일을 업로드하여 처리합니다. 파일은 Google Cloud Storage에 저장되고 비동기적으로 처리되어 텍스트를 추출하고, 임베딩을 생성하며, 시맨틱 검색을 위한 벡터 표현을 저장합니다.


### Messages

> 메시지 흐름은 [이곳](docs/message-flow.kr.md)에서 자세히 확인 가능

**메시지 생성** - `POST /messages`
메시지를 전송하고 AI가 생성한 응답을 받습니다. 시스템은 우선순위(명시적 선택, 채팅 연결 문서 또는 채팅방의 모든 문서)에 따라 관련 문서를 자동으로 선택하고, 관련 콘텐츠가 발견되면 RAG를 사용하여 응답을 생성하거나, 그렇지 않으면 일반 대화 모드로 폴백합니다.


### Chats

**채팅 목록 조회** - `GET /chats`
사용자의 모든 채팅 세션을 카테고리 필터링 및 페이지네이션 옵션과 함께 조회합니다.

**채팅 상세 조회** - `GET /chats/{chat_id}`
연결된 문서 및 카테고리를 포함한 특정 채팅의 상세 정보를 조회합니다.

**채팅 수정** - `PATCH /chats/{chat_id}`
채팅 제목을 업데이트하거나 카테고리 할당을 변경합니다.

**카테고리 제거** - `DELETE /chats/{chat_id}/category`
채팅 자체는 유지하면서 채팅의 카테고리 할당을 제거합니다.

**채팅 삭제** - `DELETE /chats/{chat_id}`
채팅 세션을 소프트 삭제하여 데이터는 유지하면서 사용자 뷰에서 제거합니다.

**채팅 일괄 삭제** - `POST /chats/bulk-delete`
여러 채팅 세션을 단일 작업으로 삭제합니다.

**채팅 메시지 조회** - `GET /chats/{chat_id}/messages`
페이지네이션을 지원하여 채팅의 모든 메시지를 조회합니다.


### Categories

**카테고리 목록 조회** - `GET /categories`
사용자의 모든 카테고리를 채팅 수 및 페이지네이션과 함께 조회합니다.

**카테고리 생성** - `POST /categories`
채팅을 정리하기 위한 새 카테고리를 생성합니다.

**카테고리 상세 조회** - `GET /categories/{category_id}`
연관된 채팅을 포함한 카테고리의 상세 정보를 조회합니다.

**카테고리 수정** - `PATCH /categories/{category_id}`
카테고리 이름을 업데이트합니다.

**카테고리 삭제** - `DELETE /categories/{category_id}`
카테고리를 소프트 삭제하고 연관된 채팅의 연결을 자동으로 해제합니다.


## 문서화

- **[API 참조](docs/api.kr.md)** - 요청/응답 예제 및 상세한 매개변수 설명이 포함된 종합 API 문서
- **[메시지 흐름](docs/message-flow.kr.md)** - 메시지 처리 및 AI 응답 생성 흐름에 대한 상세 설명
- **[아키텍처](docs/api-architecture.md)** - 시스템 아키텍처 개요 및 데이터 흐름 다이어그램


## 기술 스택

- **프레임워크**: FastAPI (Python 3.11+)
- **데이터베이스**: PostgreSQL with SQLAlchemy ORM (AsyncPG driver)
- **벡터 데이터베이스**: ChromaDB for semantic search
- **LLM**: OpenAI GPT-4o-mini
- **임베딩**: OpenAI text-embedding-3-small
- **저장소**: Google Cloud Storage
- **백그라운드 처리**: FastAPI BackgroundTasks


## 주요 기능

### 지능형 문서 선택
시스템은 3단계 우선순위 시스템을 사용하여 문서를 선택합니다:
1. 요청에서 명시적으로 제공된 문서 ID
2. 채팅 세션에 연결된 문서
3. 처리가 완료된 사용자의 모든 업로드 문서

### 하이브리드 응답 모드
문서에 관련 정보가 없을 때 답변을 거부하는 전통적인 RAG 시스템과 달리, Nura는 일반 대화 모드로 지능적으로 폴백하여 문서 내용의 관련성과 상관없이 사용자가 항상 유용한 응답을 받을 수 있도록 보장합니다.

### 비동기 처리
문서 처리는 FastAPI의 BackgroundTasks를 사용하여 백그라운드에서 발생하므로, 업로드 요청에 즉시 응답하면서 추출, 청킹, 임베딩 및 벡터 저장이 비동기적으로 진행됩니다.

### 소프트 삭제 패턴
모든 삭제 작업은 하드 삭제가 아닌 소프트 삭제(`deleted_at` 타임스탬프 설정)를 사용하여, 데이터 복구를 가능하게 하고 참조 무결성을 유지하면서 사용자 뷰에서 항목을 제거합니다.


## RAG 구성

- **청크 크기**: 1000자
- **청크 오버랩**: 200자
- **Top K 결과**: 쿼리당 4개 청크
- **임베딩 차원**: 1536 (text-embedding-3-small)
- **LLM Temperature**: 0.0 (결정적 응답)
- **Max Tokens**: 응답당 1000


## 개발 환경 설정

### 사전 요구사항
- Python 3.11+
- PostgreSQL 데이터베이스
- 서비스 자격 증명이 있는 Google Cloud Storage 계정
- OpenAI API 키

### 환경 변수
`.env.development` 파일을 다음과 같이 생성:
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/nura
OPENAI_API_KEY=sk-...
GCP_PROJECT_ID=your-project-id
GCP_BUCKET_NAME=your-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

### 설치
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 서버 실행
```bash
uvicorn app.main:app --reload --port 8000
```

API는 `http://localhost:8000`에서 사용 가능
대화형 API 문서는 `http://localhost:8000/docs`에서 확인


## 프로젝트 구조

```
server/
├── app/
│   ├── models/          # SQLAlchemy 데이터베이스 모델
│   ├── routers/         # FastAPI 라우트 핸들러
│   ├── schemas/         # Pydantic 요청/응답 스키마
│   ├── services/        # 비즈니스 로직 레이어
│   └── main.py          # 애플리케이션 진입점
├── docs/                # 문서
│   ├── api.kr.md        # API 참조
│   ├── message-flow.kr.md  # 메시지 처리 흐름
│   └── api-architecture.md  # 시스템 아키텍처
└── requirements.txt     # Python 의존성
```
