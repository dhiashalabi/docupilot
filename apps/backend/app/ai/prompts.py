"""Prompt construction for chat, summarisation and document comparison.

All prompts instruct the model to answer in the user's language and to cite
sources using inline `[n]` markers that map to the numbered context passages.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RetrievedPassage:
    """A retrieved chunk used to ground the answer."""

    index: int  # 1-based citation number
    filename: str
    page_from: int | None
    page_to: int | None
    content: str


_SYSTEM = (
    "You are DocuPilot, a multilingual assistant. "
    "Answer questions using ONLY the numbered document excerpts provided below. "
    "Rules you must follow exactly:\n"
    "1. Respond in the SAME language as the user's question.\n"
    "2. For every sentence or claim that comes from an excerpt, place its number "
    "immediately after the claim in square brackets, e.g. [1] or [2][3]. "
    "Use the exact number shown at the start of the excerpt — never invent or "
    "guess a number.\n"
    "3. Do NOT cite an excerpt you did not actually use.\n"
    "4. If the answer cannot be found in the excerpts, say so honestly in the "
    "user's language and do not add any citation markers.\n"
    "5. Never fabricate facts, summaries, or citations."
)

_COMPARISON_SYSTEM = (
    "You are DocuPilot. Compare and contrast the documents using ONLY the provided "
    "excerpts. Group your analysis by theme, note agreements and differences, and "
    "cite every claim inline using the excerpt's exact number in square brackets, "
    "e.g. [1]. Never invent or guess a number. "
    "Respond in the same language as the user's question."
)


def _format_context(passages: list[RetrievedPassage]) -> str:
    lines: list[str] = []
    for p in passages:
        loc = ""
        if p.page_from:
            loc = f", p.{p.page_from}" + (f"-{p.page_to}" if p.page_to and p.page_to != p.page_from else "")
        lines.append(f"[{p.index}] (source: {p.filename}{loc})\n{p.content}")
    return "\n\n".join(lines)


def build_chat_messages(
    question: str,
    passages: list[RetrievedPassage],
    history: list[dict[str, str]] | None = None,
    history_summary: str | None = None,
    comparison: bool = False,
) -> list[dict[str, str]]:
    """Assemble the message list for a grounded chat completion."""
    system = _COMPARISON_SYSTEM if comparison else _SYSTEM
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]

    if history_summary:
        messages.append(
            {
                "role": "system",
                "content": f"Summary of earlier conversation:\n{history_summary}",
            }
        )

    if history:
        messages.extend(history)

    context = _format_context(passages) if passages else "(no relevant excerpts found)"
    user_content = (
        f"Context excerpts:\n{context}\n\n"
        f"Question: {question}\n\n"
        "Answer using only the excerpts above and cite sources inline."
    )
    messages.append({"role": "user", "content": user_content})
    return messages


def build_summary_messages(passages: list[RetrievedPassage], instruction: str | None = None) -> list[dict[str, str]]:
    """Build messages to summarise one or more documents."""
    context = _format_context(passages)
    task = instruction or "Write a clear, structured summary of the document(s)."
    return [
        {"role": "system", "content": _SYSTEM},
        {
            "role": "user",
            "content": f"{task}\n\nContext excerpts:\n{context}\n\nRespond in the language of the documents.",
        },
    ]


def build_history_summary_messages(history: list[dict[str, str]]) -> list[dict[str, str]]:
    """Build messages to condense a long conversation into a short summary."""
    transcript = "\n".join(f"{m['role']}: {m['content']}" for m in history)
    return [
        {
            "role": "system",
            "content": "Summarise the following conversation concisely, preserving key "
            "facts, decisions and the user's intent. Keep it under 200 words.",
        },
        {"role": "user", "content": transcript},
    ]
