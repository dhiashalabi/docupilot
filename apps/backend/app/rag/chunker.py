"""Structure-aware chunking.

Strategy: Docling produces well-structured markdown (headings, paragraphs,
tables). We split on heading/paragraph boundaries first, then pack consecutive
blocks into chunks of ~`chunk_target_chars` with `chunk_overlap_chars` overlap.
This keeps semantically related content together and preserves the section
title + originating page range for citations.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.config import settings

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


@dataclass
class Block:
    """A logical block of text with its source page and section heading."""

    text: str
    page: int | None = None
    section_title: str | None = None


@dataclass
class Chunk:
    """A packed chunk ready for embedding and storage."""

    index: int
    content: str
    page_from: int | None = None
    page_to: int | None = None
    section_title: str | None = None
    meta: dict = field(default_factory=dict)


def blocks_from_markdown(markdown: str, page_map: dict[int, int] | None = None) -> list[Block]:
    """Split markdown into blocks, tracking the current heading.

    `page_map` optionally maps a character offset to a page number; when absent
    pages are left as None (PyMuPDF path populates pages directly instead).
    """
    blocks: list[Block] = []
    current_section: str | None = None
    offset = 0

    for raw in markdown.split("\n\n"):
        para = raw.strip()
        if not para:
            offset += len(raw) + 2
            continue

        heading = _HEADING_RE.match(para)
        if heading:
            current_section = heading.group(2).strip()

        page = _page_for_offset(offset, page_map) if page_map else None
        blocks.append(Block(text=para, page=page, section_title=current_section))
        offset += len(raw) + 2

    return blocks


def _page_for_offset(offset: int, page_map: dict[int, int]) -> int | None:
    page = None
    for start in sorted(page_map):
        if offset >= start:
            page = page_map[start]
        else:
            break
    return page


def chunk_blocks(blocks: list[Block]) -> list[Chunk]:
    """Pack blocks into overlapping, size-bounded chunks."""
    target = settings.chunk_target_chars
    overlap = settings.chunk_overlap_chars

    chunks: list[Chunk] = []
    buf: list[Block] = []
    buf_len = 0

    def flush() -> None:
        nonlocal buf, buf_len
        if not buf:
            return
        content = "\n\n".join(b.text for b in buf).strip()
        pages = [b.page for b in buf if b.page is not None]
        section = next((b.section_title for b in buf if b.section_title), None)
        chunks.append(
            Chunk(
                index=len(chunks),
                content=content,
                page_from=min(pages) if pages else None,
                page_to=max(pages) if pages else None,
                section_title=section,
                meta={"char_len": len(content)},
            )
        )
        # Carry overlap: keep trailing blocks up to the overlap budget.
        carry: list[Block] = []
        carry_len = 0
        for b in reversed(buf):
            if carry_len >= overlap:
                break
            carry.insert(0, b)
            carry_len += len(b.text)
        buf = carry
        buf_len = carry_len

    for block in blocks:
        # A single oversized block becomes its own chunk (after flushing).
        if len(block.text) >= target:
            flush()
            buf = [block]
            buf_len = len(block.text)
            flush()
            continue

        if buf_len + len(block.text) > target and buf:
            flush()

        buf.append(block)
        buf_len += len(block.text)

    flush()
    # Re-index in case overlap-carry produced gaps.
    for i, c in enumerate(chunks):
        c.index = i
    return chunks


def chunk_markdown(markdown: str, page_map: dict[int, int] | None = None) -> list[Chunk]:
    """Convenience: markdown -> blocks -> chunks."""
    return chunk_blocks(blocks_from_markdown(markdown, page_map))
