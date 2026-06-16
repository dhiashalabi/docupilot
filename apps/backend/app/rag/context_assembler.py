"""Context assembly and citation parsing.

Converts retrieved chunks into numbered prompt passages and extracts the
citation markers (`[n]`) the model actually used so we only persist citations
that were referenced in the answer.
"""

from __future__ import annotations

import re

from app.ai.prompts import RetrievedPassage
from app.rag.retriever import RetrievedChunk

_CITATION_RE = re.compile(r"\[(\d+)\]")


def to_passages(chunks: list[RetrievedChunk]) -> list[RetrievedPassage]:
    """Number retrieved chunks (1-based) for use in prompts and citations."""
    return [
        RetrievedPassage(
            index=i + 1,
            filename=c.filename,
            page_from=c.page_from,
            page_to=c.page_to,
            content=c.content,
        )
        for i, c in enumerate(chunks)
    ]


def extract_cited_indices(answer: str, max_index: int) -> list[int]:
    """Return the distinct, in-range 1-based citation numbers used in the answer."""
    seen: list[int] = []
    for match in _CITATION_RE.finditer(answer):
        n = int(match.group(1))
        if 1 <= n <= max_index and n not in seen:
            seen.append(n)
    return seen


def is_comparison_query(question: str, document_ids: list) -> bool:
    """Heuristic: comparison mode when multiple docs + comparison intent words."""
    if len(document_ids) < 2:
        return False
    triggers = (
        "compare",
        "comparison",
        "difference",
        "differ",
        "versus",
        "vs",
        "contrast",
        "قارن",
        "الفرق",
        "comparer",
        "différence",
        "comparar",
        "diferencia",
    )
    q = question.lower()
    return any(t in q for t in triggers)
