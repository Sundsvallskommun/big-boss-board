"""RelayState- och redirect-validering för SAML-flödet.

Draken-mönstret: login/logout tar valfria successRedirect/failureRedirect som packas
i RelayState ("success,failure") och valideras vid callback så att IdP-svaret aldrig
kan skicka användaren till främmande origin (open redirect).
"""

from __future__ import annotations

from urllib.parse import urlencode, urlparse, urlunparse

from app.config import Settings


def allowed_origins(settings: Settings) -> set[str]:
    origins = set()
    for url in (settings.saml_success_redirect, settings.saml_failure_redirect):
        parsed = urlparse(url)
        if parsed.scheme in ("http", "https") and parsed.netloc:
            origins.add(f"{parsed.scheme}://{parsed.netloc}")
    return origins


def is_allowed_url(url: str | None, settings: Settings) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    return f"{parsed.scheme}://{parsed.netloc}" in allowed_origins(settings)


def safe_url(candidate: str | None, settings: Settings, fallback: str) -> str:
    return candidate if is_allowed_url(candidate, settings) else fallback


def build_relay_state(
    success_redirect: str | None, failure_redirect: str | None, settings: Settings
) -> str:
    """Endast redan validerade URL:er läggs i RelayState (draken validerar först vid
    callback — vi gör det i båda ändar, kostar inget)."""
    success = safe_url(success_redirect, settings, settings.saml_success_redirect)
    failure = safe_url(failure_redirect, settings, settings.saml_failure_redirect)
    return f"{success},{failure}"


def split_relay_state(relay_state: str | None, settings: Settings) -> tuple[str, str]:
    """RelayState → (success, failure), med konfigurerade fallbacks."""
    parts = (relay_state or "").split(",")
    success = safe_url(parts[0] if parts else None, settings, settings.saml_success_redirect)
    failure = safe_url(
        parts[1] if len(parts) > 1 else None, settings, settings.saml_failure_redirect
    )
    return success, failure


def with_fail_message(url: str, message: str) -> str:
    """Lägger failMessage som query-param (drakens kontrakt mot login-sidan)."""
    parsed = urlparse(url)
    query = f"{parsed.query}&" if parsed.query else ""
    query += urlencode({"failMessage": message})
    return urlunparse(parsed._replace(query=query))
