"""Import-token för maskin-till-maskin-anrop (skript, CI, curl).

Skilt från användarnas inloggning. Tokenen är en av två vägar in till import- och
adminroutrarna — se `admin_access.py` för helheten (token eller admin-session).
Är inget token konfigurerat är tokenvägen avstängd (503) — den får aldrig stå öppen.
"""

from __future__ import annotations

import secrets

from fastapi import HTTPException, status

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
