"""Generation service: search, summaries, and Markdown -> PDF generation."""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import prompts, vllm_client
from app.core.exceptions import AppError, NotFoundError
from app.domain.models import GeneratedPdf
from app.pdf import generator
from app.rag import context_assembler, embedder, retriever
from app.storage import save_file


async def search(
    session: AsyncSession,
    query: str,
    document_ids: list[uuid.UUID] | None,
    top_k: int | None,
) -> list[retriever.RetrievedChunk]:
    """Semantic search across stored chunks."""
    query_vec = await asyncio.to_thread(embedder.embed_query, query)
    return await retriever.retrieve(
        session, query_vec, document_ids=document_ids or None, top_k=top_k, query_text=query
    )


async def summarize(
    session: AsyncSession, document_ids: list[uuid.UUID], instruction: str | None = None
) -> str:
    """Produce a summary grounded in the most representative chunks."""
    if not document_ids:
        raise AppError("At least one document id is required")
    seed = await embedder_embed_seed(instruction)
    chunks = await retriever.retrieve(session, seed, document_ids=document_ids, top_k=12)
    passages = context_assembler.to_passages(chunks)
    messages = prompts.build_summary_messages(passages, instruction)
    return await vllm_client.complete(messages)


async def embedder_embed_seed(instruction: str | None) -> list[float]:
    """Embed a seed query for summary retrieval."""
    return await asyncio.to_thread(
        embedder.embed_query, instruction or "summary overview key points"
    )


async def generate_pdf(
    session: AsyncSession,
    title: str,
    markdown: str,
    chat_id: uuid.UUID | None,
    language: str | None = None,
) -> GeneratedPdf:
    """Render markdown to PDF, store it and record the artifact."""
    record = GeneratedPdf(
        chat_id=chat_id, title=title, markdown_source=markdown, status="PROCESSING"
    )
    session.add(record)
    await session.flush()
    try:
        pdf_bytes = generator.render_pdf(title, markdown, language)
        key = save_file(pdf_bytes, suffix=".pdf")
        record.storage_key = key
        record.status = "READY"
    except Exception as exc:  # noqa: BLE001
        record.status = "FAILED"
        record.error = str(exc)
        raise AppError("PDF generation failed") from exc
    await session.flush()
    return record


async def get_generated_pdf(session: AsyncSession, pdf_id: uuid.UUID) -> GeneratedPdf:
    record = await session.get(GeneratedPdf, pdf_id)
    if record is None:
        raise NotFoundError("Generated PDF not found")
    return record


async def list_generated_pdfs(session: AsyncSession) -> list[GeneratedPdf]:
    rows = await session.scalars(select(GeneratedPdf).order_by(GeneratedPdf.created_at.desc()))
    return list(rows)
