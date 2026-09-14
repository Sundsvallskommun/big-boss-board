"""Behörighet för maskin-till-maskin-endpoints (dataimport).

Skilt från användarnas ACCESS_CODE (som gatar UI:t). Import-endpointen kräver ett
dedikerat hemligt token i Authorization-headern. Är inget token konfigurerat är
endpointen helt avstängd (503) — den får aldrig stå öppen.
"""

from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request, Response, status
from fastapi.routing import APIRoute

from app.config import get_settings


def require_import_token(authorization: str | None) -> None:
    """Kräver `Authorization: Bearer <IMPORT_TOKEN>` före läsning av kroppen."""
    expected = get_settings().import_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Import är inte aktiverad (IMPORT_TOKEN saknas).",
        )
    prefix = "Bearer "
    given = authorization[len(prefix):] if authorization and authorization.startswith(prefix) else ""
    # Konstanttids-jämförelse för att inte läcka token via timing.
    if not given or not secrets.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ogiltig eller saknad import-token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


class ImportTokenRoute(APIRoute):
    """Auth för hela import-/adminroutern, innan FastAPI läser JSON eller formulär.

    En vanlig Depends körs efter JSON-parsning. Route-gränsen gör att även framtida
    endpoints i dessa routrar avvisar obehöriga kroppar utan att läsa dem.
    SAML och publika endpoints använder FastAPI:s vanliga route.
    """

    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        handler = super().get_route_handler()

        async def authenticated(request: Request) -> Response:
            require_import_token(request.headers.get("authorization"))
            return await handler(request)

        return authenticated
