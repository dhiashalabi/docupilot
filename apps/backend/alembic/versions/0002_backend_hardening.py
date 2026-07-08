"""backend hardening: updated_at, content_hash, message.meta

Revision ID: 0002_backend_hardening
Revises: 0001_initial
Create Date: 2026-07-08

Additive migration:
  * documents.updated_at    NOT NULL DEFAULT NOW() + index (auto-backfills)
  * documents.content_hash  VARCHAR(64) NULL + lookup index + partial UNIQUE
    index (only enforced on non-NULL rows, so existing rows are unaffected)
  * messages.meta           JSONB NULL
  * Data step: opportunistic sha256 backfill of existing documents from disk.

Every change is roll-forward safe on populated data and roll-back drops only
the added columns/indexes.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.config import settings

revision: str = "0002_backend_hardening"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- documents.updated_at ---------------------------------------------
    op.add_column(
        "documents",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_documents_updated_at", "documents", ["updated_at"])

    # --- documents.content_hash ------------------------------------------
    op.add_column(
        "documents",
        sa.Column("content_hash", sa.String(length=64), nullable=True),
    )
    op.create_index("ix_documents_content_hash", "documents", ["content_hash"])
    # Partial unique index: enforce uniqueness only for rows where the hash
    # has been computed. Existing NULL rows never collide.
    op.create_index(
        "uq_documents_content_hash",
        "documents",
        ["content_hash"],
        unique=True,
        postgresql_where=sa.text("content_hash IS NOT NULL"),
    )

    # --- Opportunistic content_hash backfill from disk --------------------
    # Best-effort: any file the API process cannot read is skipped and left
    # NULL (dedup will start applying to future uploads once files are seen).
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, storage_key FROM documents WHERE content_hash IS NULL")
    ).all()
    root = Path(settings.storage_path).resolve()
    for row in rows:
        try:
            path = (root / row.storage_key).resolve()
            if not str(path).startswith(str(root)) or not path.exists():
                continue
            h = hashlib.sha256()
            with path.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                    h.update(chunk)
            bind.execute(
                sa.text("UPDATE documents SET content_hash = :h WHERE id = :id"),
                {"h": h.hexdigest(), "id": row.id},
            )
        except Exception:  # noqa: BLE001
            # Skip unreadable files; leave hash NULL so dedup doesn't apply.
            continue

    # --- messages.meta ----------------------------------------------------
    op.add_column(
        "messages",
        sa.Column("meta", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("messages", "meta")
    op.drop_index("uq_documents_content_hash", table_name="documents")
    op.drop_index("ix_documents_content_hash", table_name="documents")
    op.drop_column("documents", "content_hash")
    op.drop_index("ix_documents_updated_at", table_name="documents")
    op.drop_column("documents", "updated_at")
