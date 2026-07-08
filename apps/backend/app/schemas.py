"""Pydantic request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# --- Documents ---
class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    filename: str
    size_bytes: int
    page_count: int | None
    language: str | None
    status: str
    error: str | None
    created_at: datetime
    updated_at: datetime | None = None
    content_hash: str | None = None


class ProcessingJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    document_id: uuid.UUID
    status: str
    progress: int
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


# --- Chats ---
class ChatCreate(BaseModel):
    title: str | None = None
    document_ids: list[uuid.UUID] = Field(default_factory=list)


class ChatUpdate(BaseModel):
    title: str | None = None
    document_ids: list[uuid.UUID] | None = None


class ChatRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str | None
    document_ids: list[uuid.UUID]
    created_at: datetime
    updated_at: datetime


# --- Citations & Messages ---
class Citation(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    document_id: uuid.UUID
    chunk_id: uuid.UUID | None = None
    filename: str | None = None
    page_from: int | None = None
    page_to: int | None = None
    score: float | None = None


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    role: str
    content: str
    language: str | None = None
    citations: list[Citation] = Field(default_factory=list)
    meta: dict | None = None
    created_at: datetime


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=32_000)


# --- Search ---
class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    document_ids: list[uuid.UUID] = Field(default_factory=list)
    top_k: int | None = Field(default=None, ge=1, le=50)


class SearchHit(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    content: str
    page_from: int | None = None
    page_to: int | None = None
    score: float


# --- PDF Generation ---
class GeneratePdfRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    markdown: str = Field(min_length=1, max_length=200_000)
    chat_id: uuid.UUID | None = None


class GeneratedPdfRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    chat_id: uuid.UUID | None
    title: str
    status: str
    error: str | None
    created_at: datetime
