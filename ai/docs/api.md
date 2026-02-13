# Nura API Documentation

## Base URL
```
http://localhost:8000/api/v1
```

---

## Documents API

### Upload Document
Upload a document for RAG processing.

**Endpoint:** `POST /documents`

**Content-Type:** `multipart/form-data`

**Parameters:**
- `file` (required): File to upload (PDF, Markdown, or Text)
- `user_id` (query, optional): User ID (default: "default-user")

**Response:**
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

**Document Status Values:**
- `processing`: Document is being processed in the background
- `completed`: Processing complete, ready for RAG queries
- `failed`: Processing failed

**Error Responses:**
- `400 Bad Request`: Invalid file type or size (max 50MB)
- `500 Internal Server Error`: Upload or processing failure

---

## Messages API

### Create Message
Send a message and receive an AI-generated response. Automatically creates a new chat if `chat_id` is null.

**Endpoint:** `POST /messages`

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "chat_id": "01JFEXAMPLE123",
  "content": "Summarize the uploaded document",
  "document_ids": ["01JFEXDOC001", "01JFEXDOC002"],
  "category_id": "01JFEXCAT001",
  "user_id": "default-user"
}
```

**Parameters:**
- `chat_id` (optional): Chat ID. If null, creates a new chat.
- `content` (required): User message content
- `document_ids` (optional): Document IDs to attach to this message
- `category_id` (optional): Category ID (only used when creating a new chat)
- `user_id` (optional): User ID (default: "default-user")

**Document Selection Priority:**
1. If `document_ids` is provided → Use specified documents
2. If chat has linked documents → Use chat documents
3. If user has uploaded documents → Use all user's COMPLETED documents
4. If no documents available → General conversation mode

**Response (New Chat Created):**
```json
{
  "success": true,
  "data": {
    "chat": {
      "id": "01JFEXCHAT001",
      "title": "Summarize the uploaded document",
      "category": {
        "id": "01JFEXCAT001",
        "name": "General"
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
      "content": "Summarize the uploaded document",
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
      "content": "Based on the document...",
      "attached_documents": [],
      "sources": [
        {
          "document_id": "01JFEXDOC001",
          "document_name": "document.pdf",
          "chunk_id": "01JFEXDOC001_0",
          "page": null,
          "similarity": 0.95,
          "content_preview": "This document contains..."
        }
      ],
      "created_at": "2025-01-20T12:00:01"
    }
  },
  "message": "Success"
}
```

**Response (Existing Chat):**
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

**AI Response Behavior:**
- **With relevant document chunks**: Generates response based on document content with source citations
- **Without relevant chunks (fallback)**: Switches to general conversation mode instead of refusing
- **No documents**: General conversation mode

**Error Responses:**
- `400 Bad Request`: Invalid request body or document not ready
- `404 Not Found`: Chat or document not found
- `500 Internal Server Error`: AI generation failure

---

## Chats API

### Get Chat List
Retrieve all chats for a user.

**Endpoint:** `GET /chats`

**Query Parameters:**
- `user_id` (required): User ID
- `category_id` (optional): Filter by category
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "01JFEXCHAT001",
      "title": "Document summary chat",
      "category": {
        "id": "01JFEXCAT001",
        "name": "General"
      },
      "documents": [
        {
          "id": "01JFEXDOC001",
          "filename": "document.pdf"
        }
      ],
      "last_message": "Based on the document...",
      "created_at": "2025-01-20T12:00:00",
      "updated_at": "2025-01-20T12:05:00"
    }
  ],
  "message": "Success"
}
```

---

### Get Chat Detail
Retrieve detailed information for a specific chat.

**Endpoint:** `GET /chats/{chat_id}`

**Query Parameters:**
- `user_id` (required): User ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCHAT001",
    "title": "Document summary chat",
    "category": {
      "id": "01JFEXCAT001",
      "name": "General"
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

**Error Responses:**
- `404 Not Found`: Chat not found or unauthorized access

---

### Update Chat
Update chat title or category.

**Endpoint:** `PATCH /chats/{chat_id}`

**Query Parameters:**
- `user_id` (required): User ID

**Request Body:**
```json
{
  "title": "Updated chat title",
  "category_id": "01JFEXCAT002"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCHAT001",
    "title": "Updated chat title",
    "category": {
      "id": "01JFEXCAT002",
      "name": "Work"
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

### Remove Category from Chat
Remove category assignment from a chat.

**Endpoint:** `DELETE /chats/{chat_id}/category`

**Query Parameters:**
- `user_id` (required): User ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCHAT001",
    "title": "Document summary chat",
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

### Delete Chat
Soft delete a chat.

**Endpoint:** `DELETE /chats/{chat_id}`

**Query Parameters:**
- `user_id` (required): User ID

**Response:**
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

### Bulk Delete Chats
Delete multiple chats at once.

**Endpoint:** `POST /chats/bulk-delete`

**Query Parameters:**
- `user_id` (required): User ID

**Request Body:**
```json
["01JFEXCHAT001", "01JFEXCHAT002", "01JFEXCHAT003"]
```

**Response:**
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

### Get Chat Messages
Retrieve all messages in a chat.

**Endpoint:** `GET /chats/{chat_id}/messages`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)

**Response:**
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
        "content": "Hello",
        "attached_documents": [],
        "sources": null,
        "created_at": "2025-01-20T12:00:00"
      },
      {
        "id": "01JFEXMSG002",
        "chat_id": "01JFEXCHAT001",
        "role": "assistant",
        "content": "Hello! How can I help you?",
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

### Get Category List
Retrieve all categories for a user.

**Endpoint:** `GET /categories`

**Query Parameters:**
- `user_id` (required): User ID
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "01JFEXCAT001",
      "name": "General",
      "chat_count": 5,
      "created_at": "2025-01-20T10:00:00",
      "updated_at": "2025-01-20T10:00:00"
    }
  ],
  "message": "Success"
}
```

---

### Create Category
Create a new category.

**Endpoint:** `POST /categories`

**Query Parameters:**
- `user_id` (required): User ID

**Request Body:**
```json
{
  "name": "Work"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCAT002",
    "name": "Work",
    "chat_count": 0,
    "created_at": "2025-01-20T14:00:00",
    "updated_at": "2025-01-20T14:00:00"
  },
  "message": "Success"
}
```

**Error Responses:**
- `400 Bad Request`: Duplicate category name

---

### Get Category Detail
Retrieve detailed information for a category.

**Endpoint:** `GET /categories/{category_id}`

**Query Parameters:**
- `user_id` (required): User ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCAT001",
    "name": "General",
    "chats": [
      {
        "id": "01JFEXCHAT001",
        "title": "Chat 1",
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

### Update Category
Update category name.

**Endpoint:** `PATCH /categories/{category_id}`

**Query Parameters:**
- `user_id` (required): User ID

**Request Body:**
```json
{
  "name": "Updated Name"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "01JFEXCAT001",
    "name": "Updated Name",
    "chat_count": 5,
    "created_at": "2025-01-20T10:00:00",
    "updated_at": "2025-01-20T15:00:00"
  },
  "message": "Success"
}
```

---

### Delete Category
Soft delete a category.

**Endpoint:** `DELETE /categories/{category_id}`

**Query Parameters:**
- `user_id` (required): User ID

**Response:**
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

## Data Models

### Message
```typescript
{
  id: string;              // ULID
  chat_id: string;         // Chat ID
  role: "user" | "assistant";
  content: string;         // Message content (Markdown for assistant)
  attached_documents: Array<{
    id: string;
    filename: string;
  }>;
  sources: Array<{        // Only for assistant messages with RAG
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
  filename: string;        // Original filename
  file_path: string;       // GCS URL
  file_type: "pdf" | "markdown" | "text";
  file_size: number;       // Bytes
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
  title: string;           // Chat title
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
  name: string;            // Category name
  chat_count: number;      // Number of chats
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}
```

---

## Error Handling

### HTTP Status Codes
- `200 OK`: Success
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request (validation failure)
- `404 Not Found`: Resource not found
- `413 Request Entity Too Large`: File size exceeds limit
- `415 Unsupported Media Type`: Unsupported file type
- `500 Internal Server Error`: Server error

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

## RAG Configuration

### Text Processing
- **Chunk Size**: 1000 characters
- **Chunk Overlap**: 200 characters
- **Separators**: `["\n\n", "\n", " ", ""]`

### Vector Search
- **Top K Results**: 4 chunks
- **Embedding Model**: OpenAI text-embedding-3-small
- **Vector Database**: ChromaDB (local persistent)

### Response Generation
- **Model**: GPT-4o-mini
- **Temperature**: 0.0
- **Max Tokens**: 1000
