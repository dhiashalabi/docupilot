"""Local filesystem storage for uploaded files."""

from __future__ import annotations

import hashlib
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO

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


def save_stream(
    src: BinaryIO,
    *,
    suffix: str = ".pdf",
    max_bytes: int,
    chunk_size: int = 1024 * 1024,
) -> tuple[str, int, str]:
    """Stream *src* to disk while enforcing *max_bytes* and computing sha256.

    Returns ``(storage_key, size_bytes, sha256_hex)``. Raises :class:`AppError`
    if the payload exceeds ``max_bytes``; the partial file is removed.
    """
    key = f"{uuid.uuid4()}{suffix}"
    dest = _safe_path(key)
    hasher = hashlib.sha256()
    written = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = src.read(chunk_size)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise AppError(f"File exceeds {max_bytes // (1024 * 1024)} MB limit")
                hasher.update(chunk)
                out.write(chunk)
    except Exception:
        # Clean up the partial file so we never leave orphaned bytes on disk.
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return key, written, hasher.hexdigest()


def sha256_bytes(data: bytes) -> str:
    """Return the hex sha256 digest of *data*."""
    return hashlib.sha256(data).hexdigest()


def copy_file(src_key: str, *, suffix: str = ".pdf") -> str:
    """Duplicate a stored file under a new key (used by non-dedup fallbacks)."""
    new_key = f"{uuid.uuid4()}{suffix}"
    shutil.copyfile(_safe_path(src_key), _safe_path(new_key))
    return new_key
