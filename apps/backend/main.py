"""Backend entrypoint.

Run the API with: `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
This module exposes the ASGI app and a convenience runner.
"""

from app.main import app


def main() -> None:
    import uvicorn

    from app.config import settings

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()

