# Message Processing Flow

This document describes the complete flow of message creation and AI response generation in the Nura system.

---

## Overview

When a user sends a message, the system follows a multi-step process:
1. Validate and save the user message
2. Determine which documents to use for context
3. **Retrieve conversation history for context continuity**
4. Search for relevant document chunks (if documents exist)
5. Generate AI response based on available context and conversation history
6. Save and return the AI response

The system intelligently handles three scenarios:
- **Document-based Q&A**: When relevant document chunks are found
- **General conversation fallback**: When documents exist but no relevant chunks are found
- **General conversation**: When no documents are available

**Key Feature**: Each chat session maintains independent conversation history, enabling the AI to understand context, follow-up questions, and references to previous messages (e.g., "that thing", "as mentioned above").

---

## Complete Flow Diagram

```
[Client]
   │
   │ POST /api/v1/messages
   │ {
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
   ├─► [Step 1: Chat Management]
   │    │
   │    ├─► [If chat_id is null]
   │    │    ├─ Create new chat
   │    │    ├─ Generate title (first 50 chars of content)
   │    │    ├─ Link documents (if document_ids provided)
   │    │    └─ Validate category (if category_id provided)
   │    │
   │    └─► [If chat_id exists]
   │         └─ Validate chat ownership
   │
   ├─► [Step 2: Save User Message]
   │    └─ Create message with role="user"
   │
   ├─► [Step 3: Collect Documents for RAG]
   │    │
   │    ├─► [Priority 1: Explicit document_ids]
   │    │    ├─ If document_ids provided in request
   │    │    ├─ Attach to message (MessageDocument)
   │    │    └─ Filter only COMPLETED documents
   │    │
   │    ├─► [Priority 2: Chat documents]
   │    │    ├─ If no document_ids provided
   │    │    ├─ Query ChatDocument for this chat
   │    │    └─ Filter only COMPLETED documents
   │    │
   │    └─► [Priority 3: User's all documents]
   │         ├─ If chat has no documents
   │         ├─ Query all user's documents
   │         └─ Filter only COMPLETED documents
   │
   └─► [Step 4: Generate AI Response]
        │
        ▼
     [_generate_ai_response]
        │
        ├─► [Retrieve Conversation History] ✅ NEW
        │    ├─ Query recent messages from this chat
        │    ├─ Limit to MAX_CONVERSATION_HISTORY pairs (default: 10)
        │    ├─ Order by created time (oldest first)
        │    └─ Extract role and content only
        │
        ├─► [CASE A: Documents Available]
        │    │
        │    ├─► [RAGService.search_similar_chunks]
        │    │    ├─ Extract document IDs
        │    │    ├─ Create query embedding (text-embedding-3-small)
        │    │    ├─ Search ChromaDB with similarity
        │    │    ├─ Filter by document_ids
        │    │    └─ Return top 4 chunks
        │    │
        │    ├─► [Branch: Chunks Found]
        │    │    │
        │    │    ├─► [RAGService.generate_response]
        │    │    │    ├─ Format conversation history ✅ NEW
        │    │    │    ├─ Build context from chunks
        │    │    │    ├─ Create flexible prompt with:
        │    │    │    │   • Conversation history
        │    │    │    │   • Document context
        │    │    │    │   • Current query
        │    │    │    └─ Call GPT-4o-mini (temp=0.0, max_tokens=1000)
        │    │    │
        │    │    └─► [Build Source Citations]
        │    │         ├─ Extract metadata (document_id, filename, chunk_index)
        │    │         ├─ Create chunk_id = "{document_id}_{chunk_index}"
        │    │         └─ Add content_preview (first 200 chars)
        │    │
        │    └─► [Branch: No Chunks Found]
        │         │
        │         └─► **Fallback to Case B** (General Conversation)
        │
        └─► [CASE B: No Documents OR No Relevant Chunks]
             │
             └─► [RAGService.generate_response]
                  ├─ Format conversation history ✅ NEW
                  ├─ Create general conversation prompt with:
                  │   • Conversation history
                  │   • Current query
                  ├─ Call GPT-4o-mini (temp=0.0, max_tokens=1000)
                  └─ sources = null
```

---

## Detailed Step Breakdown

### Step 1: Chat Management

**Purpose**: Ensure the message belongs to a valid chat session.

**New Chat Creation:**
- Triggered when `chat_id` is null
- Title is automatically generated from first 50 characters of user message
- If `document_ids` provided, documents are linked to chat via ChatDocument table
- If `category_id` provided, category is validated and linked

**Existing Chat:**
- Validates that user owns the chat
- Prevents unauthorized access

---

### Step 2: Save User Message

**Purpose**: Record the user's input for conversation history.

**Process:**
```python
user_message = Message(
    chatId=chat_id,
    role=MessageRole.USER,
    content=message_data.content,
    sources=None
)
```

**Note**: User messages never have sources, only assistant messages do.

---

### Step 3: Conversation History Retrieval ✅ NEW

**Purpose**: Enable context-aware conversations by retrieving recent message history.

**Process:**
```python
conversation_history = await MessageService._get_conversation_history(
    db,
    chat_id,
    limit=settings.MAX_CONVERSATION_HISTORY  # Default: 10 pairs
)
```

**Configuration:**
- `MAX_CONVERSATION_HISTORY`: Maximum number of user-assistant message pairs to include (default: 10)
- Query retrieves most recent `limit * 2` messages (user + assistant pairs)
- Results ordered chronologically (oldest first) for proper context flow

**Benefits:**
- AI understands references like "that thing", "as mentioned", "the previous example"
- Enables natural follow-up questions without re-explaining context
- Each chat session maintains independent conversation history

---

### Step 4: Document Collection Priority

**Purpose**: Determine which documents to use for RAG context.

**Priority System:**

1. **Explicit `document_ids`** (Highest Priority)
   - User specifically selected documents for this message
   - Most precise and intentional selection
   - Documents are attached to the message via MessageDocument table

2. **Chat-linked documents** (Medium Priority)
   - Documents linked when chat was created
   - Persistent context for the entire conversation
   - Retrieved via ChatDocument table

3. **All user documents** (Fallback)
   - Used when chat has no specific documents
   - Enables "ask about any of my documents" behavior
   - Automatically leverages all available knowledge

**Filtering:**
- Only documents with `status=COMPLETED` are used
- Documents with `status=PROCESSING` or `FAILED` are excluded

---

### Step 5: RAG with Documents

**When**: Documents are available for the query.

**Chunk Search Process:**
```python
# 1. Extract document IDs
document_ids = [doc.id for doc in documents_for_rag]

# 2. Search similar chunks
context_chunks = await RAGService.search_similar_chunks(
    query=user_query,
    document_ids=document_ids  # Filter by these documents
)
```

**Vector Search Configuration:**
- Embedding Model: OpenAI text-embedding-3-small
- Top K: 4 chunks
- Storage: ChromaDB (local persistent)
- Similarity Metric: Cosine similarity

**If Chunks Found:**

Creates a flexible prompt that includes:
1. **Conversation history** for context continuity ✅ NEW
2. Document content for reference
3. Current query

```python
# Format conversation history
history_text = "\n\n이전 대화 내용:\n"
for msg in conversation_history:
    role_name = "사용자" if msg["role"] == "user" else "어시스턴트"
    history_text += f"{role_name}: {msg['content']}\n"

# Build prompt
prompt = f"""당신은 친절한 AI 어시스턴트입니다.
{history_text}

참고 문서 내용:
{context}

사용자 질문: {query}

답변 시 주의사항:
1. 위 대화 히스토리를 참고하여 맥락을 이해하세요.
2. 문서 내용이 질문과 관련이 있다면 우선적으로 참고하여 답변하세요.
3. 문서 내용을 사용했다면 어떤 문서를 참고했는지 간단히 언급하세요.
4. 문서 내용이 질문과 관련이 없다면, 일반 지식을 바탕으로 친절하게 답변하세요.
5. 한국어로 답변하세요.
"""
```

**Source Citation:**
Each chunk used in the response includes:
```typescript
{
  document_id: string;       // Document identifier
  document_name: string;     // Original filename
  chunk_id: string;          // "{document_id}_{chunk_index}"
  page: number | null;       // Page number (if available)
  similarity: number;        // Similarity score
  content_preview: string;   // First 200 characters of chunk
}
```

---

### Step 6: Fallback to General Conversation

**Triggered When:**
1. No documents are available, OR
2. Documents exist but no relevant chunks found

**Previous Behavior (v1):**
```python
# ❌ Old: Refused to answer
assistant_content = "관련된 정보를 찾을 수 없습니다."
```

**Current Behavior (v3 - with Conversation History):** ✅ UPDATED
```python
# ✅ New: Falls back to general knowledge with conversation context
assistant_content = await RAGService.generate_response(
    query=user_query,
    context_chunks=[],  # Empty context = general mode
    conversation_history=conversation_history  # Include history
)
```

**General Conversation Prompt:**
```python
# Format conversation history
history_text = "\n\n이전 대화 내용:\n"
for msg in conversation_history:
    role_name = "사용자" if msg["role"] == "user" else "어시스턴트"
    history_text += f"{role_name}: {msg['content']}\n"

prompt = f"""당신은 친절한 AI 어시스턴트입니다.
{history_text}

사용자 질문: {query}

답변 시 주의사항:
1. 위 대화 히스토리를 참고하여 맥락을 이해하세요.
2. 친절하고 정확하게 답변하세요.
3. 한국어로 답변하세요.
4. 모르는 내용은 모른다고 솔직히 말하세요.
"""
```

**Result:**
- No source citations (sources = null)
- Pure LLM response based on general knowledge
- User gets helpful answer instead of rejection

---

## Example Scenarios

### Scenario 1: Document-Based Q&A

**User Message:**
```
"Attention 메커니즘을 요약해줘"
```

**System Behavior:**
1. Finds Attention.md document
2. Searches for relevant chunks about Attention mechanism
3. Finds 4 relevant chunks
4. Generates response using document content
5. Includes source citations

**Response:**
```
Attention 메커니즘은 입력 문장의 각 단어에 대해 동적으로 가중치를 계산하여...

[참고: Attention.md]
```

**Sources:** `[{ document_id: "...", document_name: "Attention.md", ... }]`

---

### Scenario 2: Fallback to General Knowledge

**User Message:**
```
"후쿠오카 여행 일정 짜줘"
```

**System Behavior:**
1. Finds Attention.md document (user's only uploaded document)
2. Searches for chunks related to "후쿠오카 여행"
3. No relevant chunks found (document is about AI, not travel)
4. **Falls back to general conversation mode**
5. Generates response using LLM's general knowledge

**Response:**
```
후쿠오카 2박 3일 여행 일정을 추천드립니다:

1일차: 하카타역 주변 탐방, 이치란 라멘...
```

**Sources:** `null` (no document sources used)

---

### Scenario 3: Pure General Conversation

**User Message:**
```
"안녕하세요"
```

**System Behavior:**
1. No documents available
2. Skips RAG entirely
3. Uses general conversation mode

**Response:**
```
안녕하세요! 무엇을 도와드릴까요?
```

**Sources:** `null`

---

## Key Improvements

### v1 → v2: Intelligent Fallback

**Problem in v1:**
When users uploaded a document about topic A, the AI would refuse to answer questions about topic B:

**Example:**
- Uploaded: `Attention.md` (AI/ML topic)
- Question: "Plan a trip to Fukuoka"
- Response: ❌ "관련된 정보를 찾을 수 없습니다"

### Solution in v2:
The system now intelligently falls back to general knowledge:

**Same Example:**
- Uploaded: `Attention.md` (AI/ML topic)
- Question: "Plan a trip to Fukuoka"
- Response: ✅ "Here's a suggested itinerary for Fukuoka..."

**Benefits:**
- AI is never "blocked" by irrelevant documents
- Users can ask anything, anytime
- Document-based Q&A when relevant
- General conversation when not relevant
- Seamless hybrid experience

---

### v2 → v3: Conversation History Context ✅ NEW

**Problem in v2:**
The AI responded to each message independently without considering previous conversation context:

**Example:**
- User: "Explain Python list comprehension"
- AI: [Explains list comprehension]
- User: "What are the benefits of that?"
- AI: ❌ "I'm not sure what you're referring to"

**Solution in v3:**
The system now maintains conversation history for each chat session:

**Same Example:**
- User: "Explain Python list comprehension"
- AI: [Explains list comprehension]
- User: "What are the benefits of that?"
- AI: ✅ "The benefits of list comprehension include..." (understands "that" refers to list comprehension)

**Implementation:**
- Each chat session retrieves recent conversation history (default: 10 message pairs)
- History included in prompt for context-aware responses
- Independent context per chat session (Chat A doesn't affect Chat B)
- Token limit controlled via `MAX_CONVERSATION_HISTORY` setting

**Benefits:**
- Natural follow-up questions without re-explaining
- AI understands references like "that", "it", "as mentioned above"
- Maintains conversation flow like VS Code Copilot Chat
- Each chat room has independent memory
- Better user experience with contextual understanding

---

## RAG Configuration

### Text Chunking
```python
RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", " ", ""]
)
```

### Embedding
- Model: `text-embedding-3-small`
- Provider: OpenAI
- Vector Store: ChromaDB (local persistent)

### Generation
- Model: `gpt-4o-mini`
- Temperature: `0.0` (deterministic)
- Max Tokens: `1000`

### Conversation History ✅ NEW
- Max History Pairs: `10` (configurable via `MAX_CONVERSATION_HISTORY`)
- Message Truncation: Messages longer than 500 characters are truncated
- Ordering: Chronological (oldest to newest)
- Scope: Per chat session (independent contexts)

---

## Error Handling

### Document Processing Errors
- If document status is `PROCESSING`: Not used for RAG (filtered out)
- If document status is `FAILED`: Not used for RAG (filtered out)
- If document doesn't exist: Returns 404 error

### RAG Errors
- If ChromaDB fails: Falls back to general conversation
- If OpenAI API fails: Returns error message to user
- If embedding fails: Skips RAG, uses general conversation

### Database Errors
- Transaction rollback on failure
- Proper error messages returned to client
- Chat/message creation failures are atomic

---

## Performance Considerations

### Background Processing
- Document processing runs asynchronously (FastAPI BackgroundTasks)
- User receives immediate response with `status=processing`
- Processing happens in background:
  1. Text extraction (PDF/MD/TXT)
  2. Chunking (RecursiveCharacterTextSplitter)
  3. Embedding generation (OpenAI API)
  4. Vector storage (ChromaDB)
  5. Status update to `completed` or `failed`

### Caching
- RAG service uses singleton pattern (embeddings, vectorstore, llm)
- ChromaDB persists to disk (survives server restart)
- No re-processing of documents on restart

### Database Optimization
- Soft deletes (`deletedAt` field)
- Indexed fields: `chatId`, `userId`, `documentId`
- Pagination on all list endpoints

---

## Future Enhancements

### Potential Improvements
1. **Semantic Caching**: Cache similar queries to reduce API calls
2. **Hybrid Search**: Combine vector search with keyword search
3. **Multi-document Synthesis**: Better handling of information across multiple documents
4. **Conversation Summarization**: Automatically summarize long conversations to save tokens
5. **Streaming Responses**: Stream AI responses token-by-token for better UX
6. **Advanced Citations**: Show exact page numbers and highlight relevant text
7. **Context Prioritization**: Identify and prioritize important messages in history
8. **User-controlled History**: Allow users to customize MAX_CONVERSATION_HISTORY per chat
