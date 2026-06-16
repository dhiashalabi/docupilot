"""Application-specific exceptions."""

from __future__ import annotations


class AppError(Exception):
    """Base application error mapped to an HTTP response."""

    status_code: int = 400
    detail: str = "Application error"

    def __init__(self, detail: str | None = None) -> None:
        if detail:
            self.detail = detail
        super().__init__(self.detail)


class NotFoundError(AppError):
    status_code = 404
    detail = "Resource not found"


class AuthError(AppError):
    status_code = 401
    detail = "Authentication failed"


class ConflictError(AppError):
    status_code = 409
    detail = "Resource already exists"


class LLMError(AppError):
    status_code = 502
    detail = "Language model error"
