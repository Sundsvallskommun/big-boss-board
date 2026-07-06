"""SAML-endpoints (login/callback/metadata/logout) + /api/me.

Flödet är drakens: frontend länkar till /api/auth/saml/login → IdP → POST-callback
→ session skapas → redirect till appen. Fel signaleras till login-sidan via
?failMessage=<KOD> (SAML_MISSING_ATTRIBUTES, SAML_MISSING_GROUP, SAML_UNKNOWN_ERROR).

Endpoints svarar 404 när AUTH_MODE inte är saml (utom /api/me som alltid finns och
svarar 401 utan session).
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse, Response

from app.auth import claims, redirects, saml, sessions
from app.config import get_settings

logger = logging.getLogger("bbb.auth")

router = APIRouter(tags=["auth"])


class FixedWindowLimiter:
    """Enkel rate limit per klient-IP (drakens samlLimiter: 100 anrop/minut).
    Per pod — räcker som skydd mot loopar/skript; central gräns hör hemma i gatewayn."""

    def __init__(self, limit: int = 100, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, tuple[int, int]] = {}

    def allow(self, key: str) -> bool:
        window_id = int(time.time()) // self.window
        count, seen_window = self._hits.get(key, (0, window_id))
        if seen_window != window_id:
            count = 0
        count += 1
        self._hits[key] = (count, window_id)
        if len(self._hits) > 10_000:  # städa så mappen inte växer obegränsat
            self._hits = {k: v for k, v in self._hits.items() if v[1] == window_id}
        return count <= self.limit


_limiter = FixedWindowLimiter()


def saml_rate_limit(request: Request) -> None:
    # Backend är endast nåbar via frontend-proxyn i normal drift. Använd därför
    # forwarded-for när den finns, annars skulle alla användare se ut som samma
    # frontend-container och dela samma limiter. SISTA posten, inte första:
    # de främre posterna är klientstyrda (Traefik/proxyn APPENDAR riktiga IP:t,
    # strippar inte), så första posten låter en angripare rotera limiter-nycklar.
    forwarded_for = request.headers.get("x-forwarded-for", "")
    ip = forwarded_for.rsplit(",", 1)[-1].strip()
    if not ip:
        ip = request.client.host if request.client else "okänd"
    if not _limiter.allow(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="För många förfrågningar. Försök igen om en stund.",
        )


def require_saml_mode() -> None:
    if get_settings().auth_mode != "saml":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


def _fail(failure_url: str, message: str) -> RedirectResponse:
    """Redirect till login-sidan med ?failMessage=<KOD> (drakens kontrakt)."""
    return RedirectResponse(
        redirects.with_fail_message(failure_url, message),
        status_code=status.HTTP_303_SEE_OTHER,
    )


@router.get(
    "/api/auth/saml/login",
    dependencies=[Depends(require_saml_mode), Depends(saml_rate_limit)],
)
async def saml_login(
    request: Request,
    successRedirect: str | None = None,  # noqa: N803 — drakens query-kontrakt
    failureRedirect: str | None = None,  # noqa: N803
) -> RedirectResponse:
    """Startar SP-initierad login: 302 till IdP:n med AuthnRequest + RelayState."""
    settings = get_settings()
    relay_state = redirects.build_relay_state(successRedirect, failureRedirect, settings)
    return RedirectResponse(
        saml.login_redirect(relay_state), status_code=status.HTTP_302_FOUND
    )


@router.post(
    "/api/auth/saml/callback",
    dependencies=[Depends(require_saml_mode), Depends(saml_rate_limit)],
)
async def saml_callback(request: Request) -> RedirectResponse:
    """ACS: validerar IdP-svaret, bygger användare, skapar session, redirectar."""
    settings = get_settings()
    form = await request.form()
    post_data = {key: str(value) for key, value in form.items()}
    success_url, failure_url = redirects.split_relay_state(
        post_data.get("RelayState"), settings
    )

    if not post_data.get("SAMLResponse"):
        return _fail(failure_url, "SAML_UNKNOWN_ERROR")

    try:
        result = saml.parse_callback(post_data)
    except saml.SamlValidationError as exc:
        # Endast valideringsfel/orsak loggas — aldrig attributvärden (dataregeln).
        logger.error("SAML-svaret kunde inte valideras: %s", exc)
        return _fail(failure_url, "SAML_UNKNOWN_ERROR")
    except Exception:
        logger.exception("Oväntat fel vid SAML-callback")
        return _fail(failure_url, "SAML_UNKNOWN_ERROR")

    try:
        user = claims.build_user(result.ava or {}, settings)
    except claims.SamlAttributeError as exc:
        # Endast fältnamn loggas — aldrig värden (dataregeln).
        logger.error("SAML-profilen saknar fält: %s", ", ".join(exc.missing))
        return _fail(failure_url, "SAML_MISSING_ATTRIBUTES")
    except claims.SamlGroupError:
        logger.warning("Inloggning nekad: användaren ingår inte i tillåten grupp")
        return _fail(failure_url, "SAML_MISSING_GROUP")

    session_data: dict[str, Any] = {
        "user": user,
        "name_id": result.name_id,
        "name_id_format": result.name_id_format,
        "session_index": result.session_index,
    }
    cookie_value = await sessions.create_session(request, session_data)
    logger.info("Inloggad: %s (roll: %s)", user["username"], user["role"])

    redirect = RedirectResponse(success_url, status_code=status.HTTP_303_SEE_OTHER)
    sessions.set_session_cookie(redirect, cookie_value)
    return redirect


@router.get("/api/auth/saml/metadata", dependencies=[Depends(require_saml_mode)])
async def saml_metadata() -> Response:
    """SP-metadata att registrera hos IdP:n."""
    return Response(content=saml.sp_metadata_xml(), media_type="application/xml")


@router.get(
    "/api/auth/saml/logout",
    dependencies=[Depends(require_saml_mode), Depends(saml_rate_limit)],
)
async def saml_logout(
    request: Request,
    successRedirect: str | None = None,  # noqa: N803
) -> RedirectResponse:
    """Loggar ut lokalt och skickar användaren vidare. Är SAML_IDP_LOGOUT_URL satt
    rensas även IdP-sessionen via dess /logout?RelayState=<retur-URL> (test-IdP:n
    hanterar inte SAML SLO-requests); annars lever IdP-sessionen kvar och nästa
    login SSO:ar tyst — standardbeteende för SSO."""
    settings = get_settings()
    target = redirects.safe_url(successRedirect, settings, settings.saml_success_redirect)

    location = target
    if settings.saml_idp_logout_url:
        from urllib.parse import quote

        location = f"{settings.saml_idp_logout_url}?RelayState={quote(target, safe='')}"

    await sessions.destroy_session(request)
    redirect = RedirectResponse(location, status_code=status.HTTP_302_FOUND)
    sessions.clear_session_cookie(redirect)
    return redirect


@router.get(
    "/api/auth/saml/logout/callback",
    dependencies=[Depends(require_saml_mode), Depends(saml_rate_limit)],
)
@router.post(
    "/api/auth/saml/logout/callback",
    dependencies=[Depends(require_saml_mode), Depends(saml_rate_limit)],
)
async def saml_logout_callback(
    request: Request, RelayState: str | None = None  # noqa: N803
) -> RedirectResponse:
    """IdP:n skickar hit efter SLO. Sessionen är redan riven — säkerställ och redirecta.
    LogoutResponse-innehållet valideras inte strikt (draken gör inte heller det)."""
    settings = get_settings()
    await sessions.destroy_session(request)
    target = redirects.safe_url(RelayState, settings, settings.saml_success_redirect)
    redirect = RedirectResponse(target, status_code=status.HTTP_302_FOUND)
    sessions.clear_session_cookie(redirect)
    return redirect


@router.get("/api/me")
async def me(request: Request) -> dict[str, Any]:
    """Aktuell inloggad användare. 401 utan giltig session (oavsett auth-läge —
    i access_code-läget finns inga sessioner, så svaret blir alltid 401 där)."""
    session = await sessions.get_session(request)
    if not session or "user" not in session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ingen aktiv session.",
        )
    return session["user"]
