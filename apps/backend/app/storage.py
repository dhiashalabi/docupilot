"""Local filesystem storage for uploaded files."""

from __future__ import annotations

import uuid
from pathlib import Path

from app.config import settings
from app.core.exceptions import AppError


def _root() -> Path:
    root = Path(settings.storage_path).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_path(key: str) -> Path:
    """Resolve *key* under the storage root and reject path traversal attempts."""
    root = _root()
    resolved = (root / key).resolve()
    if not str(resolved).startswith(str(root)):
        raise AppError("Invalid storage key")
    return resolved


def save_file(data: bytes, suffix: str = ".pdf") -> str:
    """Persist bytes to disk and return the storage key."""
    key = f"{uuid.uuid4()}{suffix}"
    _safe_path(key).write_bytes(data)
    return key


def read_file(key: str) -> bytes:
    """Read a stored file by key."""
    return _safe_path(key).read_bytes()


def delete_file(key: str) -> None:
    """Delete a stored file. Logs a warning if the file does not exist."""
    from app.logging import get_logger

    logger = get_logger(__name__)
    try:
        path = _safe_path(key)
        path.unlink(missing_ok=True)
    except AppError:
        logger.warning("delete_file_invalid_key", key=key)
    except OSError as exc:
        logger.warning("delete_file_failed", key=key, error=str(exc))


def file_path(key: str) -> Path:
    """Return the absolute path for a storage key."""
    return _safe_path(key)
