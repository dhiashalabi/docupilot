"""API v1 package: aggregates all v1 routers."""

from fastapi import APIRouter

from app.api.v1 import chats, documents, generate, health, messages, search

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(documents.router)
api_router.include_router(chats.router)
api_router.include_router(messages.router)
api_router.include_router(search.router)
api_router.include_router(generate.router)

