"""PDF generation endpoints: summaries and Markdown -> PDF download."""

from __future__ import annotations

import asyncio
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Body
from fastapi.responses import Response

from app.ai.language import detect_language
from app.core.exceptions import AppError
from app.deps import SessionDep
from app.schemas import GeneratePdfRequest, GeneratedPdfRead
from app.services import generation_service
from app.storage import read_file

router = APIRouter(prefix="/generate", tags=["generate"])


@router.post("/summary")
async def summarize(
    session: SessionDep,
    document_ids: list[uuid.UUID] = Body(..., embed=True),
    instruction: str | None = Body(default=None, embed=True),
) -> dict:
    """Generate a grounded summary of one or more documents."""
    summary = await generation_service.summarize(session, document_ids, instruction)
    return {"summary": summary}


@router.post("/pdf", response_model=GeneratedPdfRead, status_code=201)
async def generate_pdf(payload: GeneratePdfRequest, session: SessionDep) -> GeneratedPdfRead:
    """Render markdown to a downloadable PDF and persist the artifact."""
    language = detect_language(payload.markdown)
    record = await generation_service.generate_pdf(
        session, payload.title, payload.markdown, payload.chat_id, language
    )
    return GeneratedPdfRead.model_validate(record)


@router.get("/pdf", response_model=list[GeneratedPdfRead])
async def list_pdfs(session: SessionDep) -> list[GeneratedPdfRead]:
    records = await generation_service.list_generated_pdfs(session)
    return [GeneratedPdfRead.model_validate(r) for r in records]


@router.get("/pdf/{pdf_id}/download")
async def download_pdf(pdf_id: uuid.UUID, session: SessionDep) -> Response:
    """Download a previously generated PDF."""
    record = await generation_service.get_generated_pdf(session, pdf_id)
    if record.status != "READY" or not record.storage_key:
        raise AppError("PDF is not ready for download")
    data = await asyncio.to_thread(read_file, record.storage_key)
    # Use RFC 5987 encoding so titles with non-ASCII or special chars are safe.
    safe_name = quote(f"{record.title}.pdf", safe="")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"},
    )
