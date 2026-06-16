"""PDF parsing using Docling (layout/tables/OCR) with a PyMuPDF fast path.

Docling is the primary parser: it produces structure-aware markdown including
tables and runs OCR on scanned pages. PyMuPDF is used for cheap metadata
(page count) and as a fallback text extractor if Docling fails.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from app.logging import get_logger

logger = get_logger(__name__)


@dataclass
class ParsedDocument:
    """Result of parsing a PDF."""

    markdown: str
    page_count: int
    page_map: dict[int, int] = field(default_factory=dict)


def page_count(path: Path) -> int:
    """Return the number of pages using PyMuPDF (fast)."""
    import pymupdf

    with pymupdf.open(path) as doc:
        return doc.page_count


def _parse_with_pymupdf(path: Path) -> ParsedDocument:
    """Fast fallback: concatenate page text and build a char->page map."""
    import pymupdf

    parts: list[str] = []
    page_map: dict[int, int] = {}
    offset = 0
    with pymupdf.open(path) as doc:
        count = doc.page_count
        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            page_map[offset] = i + 1
            parts.append(text)
            offset += len(text) + 2
    return ParsedDocument(markdown="\n\n".join(parts), page_count=count, page_map=page_map)


def _docling_markdown_with_pages(document) -> tuple[str, dict[int, int]]:
    """Reconstruct markdown from Docling items while tracking page provenance.

    Returns the markdown text plus a `page_map` of char-offset -> page number so
    chunks (and therefore citations) can carry their source page. Falls back to
    plain `export_to_markdown` with an empty map if item iteration is
    unavailable in the installed Docling version.
    """
    try:
        parts: list[str] = []
        page_map: dict[int, int] = {}
        offset = 0
        for item, _level in document.iterate_items():
            text = (getattr(item, "text", "") or "").strip()
            if not text:
                continue
            label = str(getattr(item, "label", "") or "")
            if "header" in label or "title" in label:
                text = f"## {text}"

            prov = getattr(item, "prov", None) or []
            page_no = getattr(prov[0], "page_no", None) if prov else None
            if page_no is not None:
                page_map[offset] = int(page_no)

            parts.append(text)
            offset += len(text) + 2  # account for the "\n\n" join below

        markdown = "\n\n".join(parts).strip()
        if markdown:
            return markdown, page_map
    except Exception as exc:  # noqa: BLE001
        logger.warning("docling_page_map_failed", error=str(exc))

    return document.export_to_markdown(), {}


def _parse_with_docling(path: Path) -> ParsedDocument:
    """Primary parser: Docling -> structured markdown with page provenance."""
    from docling.document_converter import DocumentConverter

    converter = DocumentConverter()
    result = converter.convert(str(path))
    markdown, page_map = _docling_markdown_with_pages(result.document)
    try:
        count = len(result.document.pages) or page_count(path)
    except Exception:  # noqa: BLE001
        count = page_count(path)
    return ParsedDocument(markdown=markdown, page_count=count, page_map=page_map)


def parse_pdf(path: Path) -> ParsedDocument:
    """Parse a PDF to markdown, preferring Docling and falling back to PyMuPDF."""
    try:
        parsed = _parse_with_docling(path)
        if parsed.markdown.strip():
            return parsed
        logger.warning("docling_empty_output_falling_back", path=str(path))
    except Exception as exc:  # noqa: BLE001
        logger.warning("docling_failed_falling_back", path=str(path), error=str(exc))
    return _parse_with_pymupdf(path)
