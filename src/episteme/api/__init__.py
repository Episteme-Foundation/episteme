"""Episteme REST API.

This module provides the FastAPI application and routers for the Episteme API.

Usage:
    # Run with uvicorn
    uvicorn episteme.api.app:app --reload

    # Or programmatically
    from episteme.api.app import create_app
    app = create_app()
"""

from episteme.api.app import app, create_app

__all__ = ["app", "create_app"]
