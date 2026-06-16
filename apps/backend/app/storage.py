"""Local filesystem storage for uploaded files."""

from __future__ import annotations

import uuid
from pathlib import Path

from app.config import settings


def _root() -> Path:
    root = Path(settings.storage_path)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_file(data: bytes, suffix: str = ".pdf") -> str:
    """Persist bytes to disk and return the storage key."""
    key = f"{uuid.uuid4()}{suffix}"
    path = _root() / key
    path.write_bytes(data)
    return key


def read_file(key: str) -> bytes:
    """Read a stored file by key."""
    return (_root() / key).read_bytes()


def file_path(key: str) -> Path:
    """Return the absolute path for a storage key."""
    return _root() / key
