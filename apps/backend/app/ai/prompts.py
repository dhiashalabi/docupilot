"""Prompt construction for chat, summarisation and document comparison.

All prompts instruct the model to answer in the user's language and to cite
sources using inline `[n]` markers that map to the numbered context passages.

Untrusted content (the user question, conversation history, and document
excerpts) is always wrapped in XML-style delimiters so the model can
distinguish data from instructions and cannot be prompt-injected.
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


_SYSTEM = """\
You are DocuPilot, a multilingual document assistant.
Answer questions using ONLY the numbered excerpts inside <context></context>.
Rules you must follow exactly:
1. Respond in the SAME language as the user's question.
2. For every sentence or claim drawn from an excerpt, place its number immediately \
after the claim in square brackets, e.g. [1] or [2][3]. Use the exact number shown — \
never invent or guess a number.
3. Do NOT cite an excerpt you did not actually use.
4. If the answer cannot be found in the excerpts, say so honestly in the user's language \
and do not add any citation markers.
5. Never fabricate facts, summaries, or citations.
6. Keep answers focused and concise — avoid unnecessary padding or repetition."""

_COMPARISON_SYSTEM = """\
You are DocuPilot. Compare and contrast the provided documents using ONLY the excerpts \
inside <context></context>. Group your analysis by theme, note agreements and differences, \
and cite every claim inline using the excerpt's exact number in square brackets, e.g. [1]. \
Never invent or guess a number. Respond in the same language as the user's question."""

# Intentionally simpler than _SYSTEM: summaries do not require inline citations.
_SUMMARY_SYSTEM = """\
You are DocuPilot. Summarise the provided document excerpts accurately and concisely. \
Do not add information beyond what is in the excerpts. \
Respond in the language of the documents unless instructed otherwise."""


def _format_context(passages: list[RetrievedPassage]) -> str:
    lines: list[str] = []
    for p in passages:
        loc = ""
        if p.page_from:
            loc = f", p.{p.page_from}" + (
                f"-{p.page_to}" if p.page_to and p.page_to != p.page_from else ""
            )
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

    context_body = _format_context(passages) if passages else "(no relevant excerpts found)"
    user_content = (
        f"<context>\n{context_body}\n</context>\n\n"
        f"<question>\n{question}\n</question>\n\n"
        "Answer using only the excerpts inside <context> and cite sources inline."
    )
    messages.append({"role": "user", "content": user_content})
    return messages


def build_summary_messages(
    passages: list[RetrievedPassage], instruction: str | None = None
) -> list[dict[str, str]]:
    """Build messages to summarise one or more documents."""
    context_body = _format_context(passages)
    task = instruction or "Write a clear, structured summary of the document(s)."
    return [
        {"role": "system", "content": _SUMMARY_SYSTEM},
        {
            "role": "user",
            "content": f"{task}\n\n<context>\n{context_body}\n</context>",
        },
    ]


def build_history_summary_messages(history: list[dict[str, str]]) -> list[dict[str, str]]:
    """Build messages to condense a long conversation into a short summary."""
    transcript = "\n".join(f"{m['role']}: {m['content']}" for m in history)
    return [
        {
            "role": "system",
            "content": (
                "Summarise the following conversation concisely, preserving key "
                "facts, decisions and the user's intent. Keep it under 200 words."
            ),
        },
        {
            "role": "user",
            "content": f"<transcript>\n{transcript}\n</transcript>",
        },
    ]
