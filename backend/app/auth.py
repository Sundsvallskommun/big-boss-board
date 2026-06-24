"""Behörighet för maskin-till-maskin-endpoints (dataimport).

Skilt från användarnas ACCESS_CODE (som gatar UI:t). Import-endpointen kräver ett
dedikerat hemligt token i Authorization-headern. Är inget token konfigurerat är
endpointen helt avstängd (503) — den får aldrig stå öppen.
"""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_import_token(authorization: str | None = Header(default=None)) -> None:
    """FastAPI-dependency: kräver `Authorization: Bearer <IMPORT_TOKEN>`."""
    expected = get_settings().import_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Import är inte aktiverad (IMPORT_TOKEN saknas).",
        )
    prefix = "Bearer "
    given = authorization[len(prefix):] if authorization and authorization.startswith(prefix) else ""
    # Konstanttids-jämförelse för att inte läcka token via timing.
    if not given or not secrets.compare_digest(given, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ogiltig eller saknad import-token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
