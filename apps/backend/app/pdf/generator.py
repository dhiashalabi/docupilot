"""PDF generation: Markdown -> HTML -> PDF using WeasyPrint.

WeasyPrint is a pure-Python renderer (no headless browser) with solid
multilingual and RTL support, which matters for Arabic output. Markdown is
converted to HTML via markdown-it-py and wrapped in a print stylesheet that
flips direction for RTL languages.
"""

from __future__ import annotations

from app.logging import get_logger

logger = get_logger(__name__)

_RTL_LANGS = {"ar", "fa", "he", "ur"}

_BASE_CSS = """
@page {{ size: A4; margin: 2cm; }}
body {{
    font-family: 'Noto Sans', 'Noto Sans Arabic', sans-serif;
    line-height: 1.6;
    direction: {direction};
    text-align: {align};
    color: #1a1a1a;
}}
h1, h2, h3 {{ color: #111; margin-top: 1.2em; }}
code, pre {{ font-family: 'Noto Sans Mono', monospace; background: #f5f5f5; }}
pre {{ padding: 0.8em; border-radius: 6px; overflow-x: auto; }}
table {{ border-collapse: collapse; width: 100%; }}
th, td {{ border: 1px solid #ddd; padding: 6px 10px; }}
blockquote {{ border-left: 3px solid #ccc; margin: 0; padding-left: 1em; color: #555; }}
"""


def markdown_to_html(markdown_text: str) -> str:
    """Render markdown to an HTML fragment."""
    from markdown_it import MarkdownIt

    md = MarkdownIt("commonmark", {"html": False, "linkify": True}).enable("table")
    return md.render(markdown_text)


def render_pdf(title: str, markdown_text: str, language: str | None = None) -> bytes:
    """Render markdown content to PDF bytes."""
    from weasyprint import HTML

    is_rtl = (language or "").lower() in _RTL_LANGS
    css = _BASE_CSS.format(
        direction="rtl" if is_rtl else "ltr",
        align="right" if is_rtl else "left",
    )
    body = markdown_to_html(markdown_text)
    html = (
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<title>{title}</title><style>{css}</style></head>"
        f"<body><h1>{title}</h1>{body}</body></html>"
    )
    logger.info("rendering_pdf", title=title, rtl=is_rtl)
    return HTML(string=html).write_pdf()
