"""SQLAlchemy ORM models for DocuPilot.

The platform runs as a local unrestricted workspace, so there is no user/owner
scoping. All documents, chats and generated artifacts are globally accessible.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import settings
from app.db.session import Base

# --- Status constants ---
STATUS_PENDING = "PENDING"
STATUS_PROCESSING = "PROCESSING"
STATUS_READY = "READY"
STATUS_FAILED = "FAILED"


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class Document(Base):
    """An uploaded PDF and its processing state."""

    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = _uuid_pk()
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    page_count: Mapped[int | None] = mapped_column(Integer)
    language: Mapped[str | None] = mapped_column(String(8))
    # PENDING | PROCESSING | READY | FAILED
    status: Mapped[str] = mapped_column(
        String(16), default=STATUS_PENDING, nullable=False, index=True
    )
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    chunks: Mapped[list[DocumentChunk]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentChunk.chunk_index",
    )
    jobs: Mapped[list[ProcessingJob]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class DocumentChunk(Base):
    """A retrievable chunk of a document with its embedding vector."""

    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_chunk_doc_index"),
        # Declared here so Alembic autogenerate does not treat the HNSW index
        # (created in 0001_initial.py) as drift and try to drop it.
        Index(
            "ix_document_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page_from: Mapped[int | None] = mapped_column(Integer)
    page_to: Mapped[int | None] = mapped_column(Integer)
    section_title: Mapped[str | None] = mapped_column(String(512))
    token_count: Mapped[int | None] = mapped_column(Integer)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.embedding_dim))
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    document: Mapped[Document] = relationship(back_populates="chunks")


class Chat(Base):
    """A conversation, optionally scoped to one or more documents."""

    __tablename__ = "chats"

    id: Mapped[uuid.UUID] = _uuid_pk()
    title: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True
    )

    documents: Mapped[list[ChatDocument]] = relationship(
        back_populates="chat", cascade="all, delete-orphan"
    )
    messages: Mapped[list[Message]] = relationship(
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class ChatDocument(Base):
    """Association between a chat and the documents it can retrieve from."""

    __tablename__ = "chat_documents"

    chat_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )

    chat: Mapped[Chat] = relationship(back_populates="documents")
    document: Mapped[Document] = relationship()


class Message(Base):
    """A single turn in a conversation."""

    __tablename__ = "messages"
    __table_args__ = (
        # Composite index for list_messages: WHERE chat_id = ? ORDER BY created_at
        Index("ix_messages_chat_id_created_at", "chat_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    chat_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str | None] = mapped_column(String(8))
    token_count: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    chat: Mapped[Chat] = relationship(back_populates="messages")
    citations: Mapped[list[MessageCitation]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )


class MessageCitation(Base):
    """A reference from an assistant message to a source document chunk."""

    __tablename__ = "message_citations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    chunk_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("document_chunks.id", ondelete="SET NULL")
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    page_from: Mapped[int | None] = mapped_column(Integer)
    page_to: Mapped[int | None] = mapped_column(Integer)
    score: Mapped[float | None] = mapped_column(Float)

    message: Mapped[Message] = relationship(back_populates="citations")
    document: Mapped[Document] = relationship()

    @property
    def filename(self) -> str | None:
        return self.document.filename if self.document is not None else None


class GeneratedPdf(Base):
    """A PDF produced from AI-generated markdown content."""

    __tablename__ = "generated_pdfs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    chat_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chats.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    markdown_source: Mapped[str] = mapped_column(Text, nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(
        String(16), default=STATUS_PENDING, nullable=False, index=True
    )
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ProcessingJob(Base):
    """Tracks an async background job (e.g. document ingestion)."""

    __tablename__ = "processing_jobs"
    __table_args__ = (
        # Composite index for latest-job-per-document lookup: ORDER BY created_at DESC
        Index("ix_processing_jobs_document_created_at", "document_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    celery_task_id: Mapped[str | None] = mapped_column(String(64))
    job_type: Mapped[str] = mapped_column(String(32), default="ingest", nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default=STATUS_PENDING, nullable=False, index=True
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    document: Mapped[Document] = relationship(back_populates="jobs")
