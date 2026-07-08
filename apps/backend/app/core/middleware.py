"""Request ID middleware.

Reads ``X-Request-ID`` from incoming requests (or generates one), binds it to
the structlog context so every log line for the request carries it, and echoes
it back on the response. This makes correlating API + worker + LLM logs for a
single question trivial.
"""

from __future__ import annotations

import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_HEADER = "X-Request-ID"


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(_HEADER) or uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        try:
            response: Response = await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()
        response.headers[_HEADER] = request_id
        return response
