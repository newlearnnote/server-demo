"""
RAG Service

RAG (Retrieval-Augmented Generation) 관련 비즈니스 로직
"""

from typing import Optional
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import Chroma
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document as LangchainDocument

from app.models.document import Document
from app.config import settings


class RAGService:
    """
    RAG 비즈니스 로직 처리 서비스
    """

    # settings에서 설정 로드
    OPENAI_API_KEY = settings.OPENAI_API_KEY
    CHROMA_DB_PATH = settings.CHROMA_DB_PATH
    CHUNK_SIZE = settings.CHUNK_SIZE
    CHUNK_OVERLAP = settings.CHUNK_OVERLAP
    TOP_K_RESULTS = settings.TOP_K_RESULTS
    LLM_MODEL = settings.LLM_MODEL
    EMBEDDING_MODEL = settings.EMBEDDING_MODEL
    LLM_TEMPERATURE = settings.LLM_TEMPERATURE
    LLM_MAX_TOKENS = settings.LLM_MAX_TOKENS

    # 싱글톤 인스턴스
    _embeddings: Optional[OpenAIEmbeddings] = None
    _vectorstore: Optional[Chroma] = None
    _llm: Optional[ChatOpenAI] = None

    @classmethod
    def get_embeddings(cls) -> OpenAIEmbeddings:
        """
        OpenAI 임베딩 모델 가져오기 (싱글톤)

        Returns:
            OpenAIEmbeddings: 임베딩 모델 인스턴스
        """
        if cls._embeddings is None:
            cls._embeddings = OpenAIEmbeddings(
                openai_api_key=cls.OPENAI_API_KEY,
                model=cls.EMBEDDING_MODEL
            )
        return cls._embeddings

    @classmethod
    def get_vectorstore(cls) -> Chroma:
        """
        ChromaDB 벡터스토어 가져오기 (싱글톤)

        Returns:
            Chroma: 벡터스토어 인스턴스
        """
        if cls._vectorstore is None:
            embeddings = cls.get_embeddings()
            cls._vectorstore = Chroma(
                persist_directory=cls.CHROMA_DB_PATH,
                embedding_function=embeddings
            )
        return cls._vectorstore

    @classmethod
    def get_llm(cls) -> ChatOpenAI:
        """
        OpenAI LLM 가져오기 (싱글톤)

        Returns:
            ChatOpenAI: LLM 인스턴스
        """
        if cls._llm is None:
            cls._llm = ChatOpenAI(
                openai_api_key=cls.OPENAI_API_KEY,
                model=cls.LLM_MODEL,
                temperature=cls.LLM_TEMPERATURE,
                max_tokens=cls.LLM_MAX_TOKENS
            )
        return cls._llm

    @staticmethod
    def split_text(text: str) -> list[str]:
        """
        텍스트를 청크로 분할

        Args:
            text: 분할할 텍스트

        Returns:
            list[str]: 분할된 청크 리스트
        """
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=RAGService.CHUNK_SIZE,
            chunk_overlap=RAGService.CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", " ", ""]
        )
        chunks = text_splitter.split_text(text)
        return chunks

    @staticmethod
    async def add_document_to_vectorstore(
        document_id: str,
        text: str,
        metadata: dict
    ) -> int:
        """
        문서를 벡터스토어에 추가

        Args:
            document_id: 문서 ID
            text: 문서 텍스트
            metadata: 메타데이터 (filename, fileType 등)

        Returns:
            int: 생성된 청크 개수
        """
        # 텍스트를 청크로 분할
        chunks = RAGService.split_text(text)

        # Langchain Document 객체 생성
        documents = [
            LangchainDocument(
                page_content=chunk,
                metadata={
                    **metadata,
                    "document_id": document_id,
                    "chunk_index": i
                }
            )
            for i, chunk in enumerate(chunks)
        ]

        # 벡터스토어에 추가
        vectorstore = RAGService.get_vectorstore()
        vectorstore.add_documents(documents)

        return len(chunks)

    @staticmethod
    async def search_similar_chunks(
        query: str,
        document_ids: Optional[list[str]] = None,
        k: Optional[int] = None
    ) -> list[dict]:
        """
        유사한 청크 검색

        Args:
            query: 검색 쿼리
            document_ids: 검색할 문서 ID 리스트 (None이면 전체 검색)
            k: 반환할 결과 개수 (None이면 TOP_K_RESULTS 사용)

        Returns:
            list[dict]: 유사한 청크 리스트
        """
        vectorstore = RAGService.get_vectorstore()
        k = k or RAGService.TOP_K_RESULTS

        # 문서 ID 필터링
        if document_ids:
            # ChromaDB where 조건 사용
            results = vectorstore.similarity_search(
                query,
                k=k,
                filter={"document_id": {"$in": document_ids}}
            )
        else:
            results = vectorstore.similarity_search(query, k=k)

        # 결과를 딕셔너리로 변환
        return [
            {
                "content": doc.page_content,
                "metadata": doc.metadata
            }
            for doc in results
        ]

    @staticmethod
    async def generate_response(
        query: str,
        context_chunks: list[dict],
        conversation_history: list[dict] = None
    ) -> str:
        """
        RAG 기반 응답 생성 (대화 히스토리 포함)

        Args:
            query: 사용자 질문
            context_chunks: 컨텍스트 청크 리스트
            conversation_history: 이전 대화 히스토리 (선택적)

        Returns:
            str: 생성된 응답
        """
        llm = RAGService.get_llm()

        # 대화 히스토리 포맷팅
        history_text = ""
        if conversation_history and len(conversation_history) > 0:
            history_text = "\n\n이전 대화 내용:\n"
            for msg in conversation_history:
                role_name = "사용자" if msg["role"] == "user" else "어시스턴트"
                # 너무 긴 메시지는 요약
                content = msg["content"]
                if len(content) > 500:
                    content = content[:500] + "..."
                history_text += f"{role_name}: {content}\n"

        # 문서가 있는 경우와 없는 경우 구분
        if context_chunks:
            # 컨텍스트 구성
            context = "\n\n".join([
                f"[문서: {chunk['metadata'].get('filename', 'Unknown')}]\n{chunk['content']}"
                for chunk in context_chunks
            ])

            # 프롬프트 구성 (문서 기반)
            prompt = f"""당신은 친절한 AI 어시스턴트입니다. 사용자가 업로드한 문서 내용을 참고하여 답변할 수 있습니다.
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

답변:"""
        else:
            # 프롬프트 구성 (일반 대화)
            prompt = f"""당신은 친절한 AI 어시스턴트입니다.
{history_text}

사용자 질문: {query}

답변 시 주의사항:
1. 위 대화 히스토리를 참고하여 맥락을 이해하세요.
2. 친절하고 정확하게 답변하세요.
3. 한국어로 답변하세요.
4. 모르는 내용은 모른다고 솔직히 말하세요.

답변:"""

        # LLM 호출
        response = await llm.ainvoke(prompt)
        return response.content

    @staticmethod
    async def delete_document_from_vectorstore(document_id: str):
        """
        벡터스토어에서 문서 삭제

        Args:
            document_id: 삭제할 문서 ID
        """
        vectorstore = RAGService.get_vectorstore()

        # document_id로 필터링하여 삭제
        vectorstore.delete(
            filter={"document_id": document_id}
        )
