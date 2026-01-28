"""FastAPI application for the Episteme API.

This is the main entry point for the REST API, providing endpoints for:
- Claim management (CRUD, decomposition, assessment)
- Source ingestion and retrieval
- Semantic search across claims
- Validation for browser extensions
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from episteme.config import get_settings
from episteme.api.routers import claims, sources, search, contributions, appeals

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler for startup/shutdown."""
    settings = get_settings()

    # Startup
    logger.info(
        "Starting Episteme API",
        environment=settings.environment,
        debug=settings.api.debug,
    )

    # Initialize storage connections
    # These will be initialized lazily on first request
    # to avoid blocking startup

    yield

    # Shutdown
    logger.info("Shutting down Episteme API")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Episteme API",
        description="""
Episteme is an epistemic infrastructure system that uses LLMs to process claims.

## Overview

The API provides access to:
- **Claims**: The core knowledge graph of propositions
- **Sources**: Documents from which claims are extracted
- **Search**: Semantic search across the claim graph
- **Validation**: Quick claim validation for browser extensions

## Authentication

API keys are required for write operations. Read operations may be rate-limited
for unauthenticated requests.

## Rate Limits

- Authenticated: 1000 requests/minute
- Unauthenticated: 60 requests/minute
        """,
        version="0.1.0",
        docs_url="/docs" if settings.api.debug else None,
        redoc_url="/redoc" if settings.api.debug else None,
        openapi_url="/openapi.json" if settings.api.debug else "/api/openapi.json",
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(claims.router, prefix="/api/v1/claims", tags=["claims"])
    app.include_router(sources.router, prefix="/api/v1/sources", tags=["sources"])
    app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
    app.include_router(contributions.router, prefix="/api/v1/contributions", tags=["contributions"])
    app.include_router(appeals.router, prefix="/api/v1/appeals", tags=["appeals"])

    # Health check endpoint
    @app.get("/health", tags=["health"])
    async def health_check() -> dict:
        """Health check endpoint."""
        return {
            "status": "healthy",
            "version": "0.1.0",
        }

    # Root endpoint
    @app.get("/", tags=["root"])
    async def root() -> dict:
        """API root with basic information."""
        return {
            "name": "Episteme API",
            "version": "0.1.0",
            "documentation": "/docs",
        }

    # Global exception handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Handle uncaught exceptions."""
        logger.error(
            "Unhandled exception",
            path=request.url.path,
            method=request.method,
            error=str(exc),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    return app


# Create the app instance
app = create_app()
