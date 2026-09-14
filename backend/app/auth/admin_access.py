"""Behörighet för import- och adminroutrarna: import-token ELLER admin-session.

Två legitima vägar in, avgjorda före kroppen läses:

- **Maskin-till-maskin:** `Authorization: Bearer <IMPORT_TOKEN>` (skript, CI, curl).
  Finns headern avgör den ensam — se `import_token.require_import_token`.
- **Inloggad admin:** sessionskakan `bbb_session` (saml-läget, backend äger sessionen)
  med rollen `admin` ur IdP-gruppmedlemskapet. Vanlig `user` får 403. Det gör att
  `/api/docs` och status-sidans inkorg fungerar utan att frontend behöver hålla tokenen.
  I access_code-läget skapar backend inga sessioner, så bara tokenvägen gäller där.

CSRF: kakan är SameSite=Lax och endpoints tar JSON (preflight), så andra sajter kan inte
skicka ändrande anrop med kakan. Som extra skydd avvisas ändrande anrop där webbläsarens
`Sec-Fetch-Site` inte är `same-origin`/`none` — Lax skickar kakan även från syskondomäner
(`same-site`), och inga sådana anropare finns.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request, Response, status
from fastapi.routing import APIRoute

from app.auth import sessions
from app.auth.import_token import require_import_token

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
# Sec-Fetch-Site-värden som får skriva med sessionskaka. Saknad header = icke-webbläsare
# (server-side fetch från frontend) och släpps igenom; kakan är då redan betrodd.
TRUSTED_FETCH_SITES = frozenset({"same-origin", "none"})


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def require_admin_access(request: Request) -> None:
    """Kräver giltig import-token eller inloggad admin-session, utan att röra kroppen."""
    if request.headers.get("authorization"):
        require_import_token(request.headers["authorization"])
        return

    if not request.cookies.get(sessions.SESSION_COOKIE):
        raise _unauthorized("Import-token eller inloggad admin-session krävs.")

    fetch_site = request.headers.get("sec-fetch-site")
    if request.method not in SAFE_METHODS and fetch_site and fetch_site not in TRUSTED_FETCH_SITES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Anrop från annan sajt tillåts inte.")

    session = await sessions.get_session(request)
    user = session.get("user") if session else None
    if not user:
        raise _unauthorized("Ingen aktiv session.")
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kräver admin-roll.")


class AdminAccessRoute(APIRoute):
    """Auth för hela import-/adminroutern, innan FastAPI läser JSON eller formulär.

    En vanlig Depends körs efter JSON-parsning. Route-gränsen gör att även framtida
    endpoints i dessa routrar avvisar obehöriga kroppar utan att läsa dem.
    SAML och publika endpoints använder FastAPI:s vanliga route.
    """

    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        handler = super().get_route_handler()

        async def authenticated(request: Request) -> Response:
            await require_admin_access(request)
            return await handler(request)

        return authenticated
