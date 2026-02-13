# Nura Backend

## Overview

Nura is a Retrieval-Augmented Generation (RAG) based document chat system that enables users to upload documents and interact with them through natural language conversations. The system intelligently combines document-based question answering with general conversational capabilities, providing a seamless experience whether querying specific documents or engaging in general discussion.

The backend is built with FastAPI and leverages OpenAI's GPT-4o-mini for response generation, ChromaDB for vector storage, and Google Cloud Storage for document management.

---

## API Endpoints

### Documents

**Upload Document** - `POST /documents`
Upload PDF, Markdown, or Text files for processing. Files are stored in Google Cloud Storage and processed asynchronously to extract text, generate embeddings, and store vector representations for semantic search.

---

### Messages

**Create Message** - `POST /messages`
Send a message and receive an AI-generated response. The system automatically selects relevant documents based on priority (explicit selection, chat-linked documents, or all user documents) and generates responses using RAG when relevant content is found, or falls back to general conversation mode when not.

---

### Chats

**Get Chat List** - `GET /chats`
Retrieve all chat sessions for a user with optional category filtering and pagination.

**Get Chat Detail** - `GET /chats/{chat_id}`
Retrieve detailed information for a specific chat including linked documents and category.

**Update Chat** - `PATCH /chats/{chat_id}`
Update chat title or change category assignment.

**Remove Category** - `DELETE /chats/{chat_id}/category`
Remove category assignment from a chat while preserving the chat itself.

**Delete Chat** - `DELETE /chats/{chat_id}`
Soft delete a chat session, removing it from user view while retaining data.

**Bulk Delete Chats** - `POST /chats/bulk-delete`
Delete multiple chat sessions in a single operation.

**Get Chat Messages** - `GET /chats/{chat_id}/messages`
Retrieve all messages in a chat with pagination support.

---

### Categories

**Get Category List** - `GET /categories`
Retrieve all categories for a user with chat counts and pagination.

**Create Category** - `POST /categories`
Create a new category for organizing chats.

**Get Category Detail** - `GET /categories/{category_id}`
Retrieve detailed information for a category including associated chats.

**Update Category** - `PATCH /categories/{category_id}`
Update category name.

**Delete Category** - `DELETE /categories/{category_id}`
Soft delete a category, automatically unlinking associated chats.

---

## Documentation

- **[API Reference](docs/api.md)** - Comprehensive API documentation with request/response examples and detailed parameter descriptions
- **[Message Flow](docs/message-flow.md)** - Detailed explanation of message processing and AI response generation flow
- **[Architecture](docs/api-architecture.md)** - System architecture overview and data flow diagrams

---

## Technology Stack

- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL with SQLAlchemy ORM (AsyncPG driver)
- **Vector Database**: ChromaDB for semantic search
- **LLM**: OpenAI GPT-4o-mini
- **Embeddings**: OpenAI text-embedding-3-small
- **Storage**: Google Cloud Storage
- **Background Processing**: FastAPI BackgroundTasks

---

## Key Features

### Intelligent Document Selection
The system uses a three-tier priority system to select documents:
1. Explicitly provided document IDs in the request
2. Documents linked to the chat session
3. All user-uploaded documents with completed processing status

### Hybrid Response Mode
Unlike traditional RAG systems that refuse to answer when documents lack relevant information, Nura intelligently falls back to general conversation mode, ensuring users always receive helpful responses regardless of document content relevance.

### Asynchronous Processing
Document processing occurs in the background using FastAPI's BackgroundTasks, allowing immediate response to upload requests while extraction, chunking, embedding, and vector storage happen asynchronously.

### Soft Delete Pattern
All delete operations use soft delete (setting `deleted_at` timestamp) rather than hard deletion, enabling data recovery and maintaining referential integrity while removing items from user view.

---

## RAG Configuration

- **Chunk Size**: 1000 characters
- **Chunk Overlap**: 200 characters
- **Top K Results**: 4 chunks per query
- **Embedding Dimension**: 1536 (text-embedding-3-small)
- **LLM Temperature**: 0.0 (deterministic responses)
- **Max Tokens**: 1000 per response

---

## Development Setup

### Prerequisites
- Python 3.11+
- PostgreSQL database
- Google Cloud Storage account with service credentials
- OpenAI API key

### Environment Variables
Create a `.env.development` file with:
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/nura
OPENAI_API_KEY=sk-...
GCP_PROJECT_ID=your-project-id
GCP_BUCKET_NAME=your-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

### Installation
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Run Server
```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`
Interactive API documentation at `http://localhost:8000/docs`

---

## Project Structure

```
server/
├── app/
│   ├── models/          # SQLAlchemy database models
│   ├── routers/         # FastAPI route handlers
│   ├── schemas/         # Pydantic request/response schemas
│   ├── services/        # Business logic layer
│   └── main.py          # Application entry point
├── docs/                # Documentation
│   ├── api.md           # API reference
│   ├── message-flow.md  # Message processing flow
│   └── api-architecture.md  # System architecture
└── requirements.txt     # Python dependencies
```
