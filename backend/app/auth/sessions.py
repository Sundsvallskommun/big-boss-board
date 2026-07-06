"""Server-side sessioner: session-id i HMAC-signerad cookie, data i Redis eller minne.

Draken-mönstret: sessionsdata bor aldrig i cookien (bara ett signerat id), och är
REDIS_HOST satt men Redis onåbar vägrar appen starta — tyst fallback till pod-lokalt
minne i prod skulle ge sessioner som försvinner vid rollout/omstart.

Minnesstoret är endast för lokal utveckling och delar inget mellan Gunicorn-workers:
kör med WEB_CONCURRENCY=1 lokalt (sätts i docker-compose.override.yml).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from typing import Any, Protocol

from fastapi import Request, Response

from app.config import Settings, get_settings

SESSION_COOKIE = "bbb_session"


def _sign(sid: str, secret: str) -> str:
    return hmac.new(secret.encode(), sid.encode(), hashlib.sha256).hexdigest()


def encode_cookie(sid: str, secret: str) -> str:
    return f"{sid}.{_sign(sid, secret)}"


def decode_cookie(value: str | None, secret: str) -> str | None:
    """Returnerar session-id om cookiens signatur stämmer, annars None."""
    if not value or "." not in value or not secret:
        return None
    sid, signature = value.rsplit(".", 1)
    if not secrets.compare_digest(signature, _sign(sid, secret)):
        return None
    return sid


class SessionStore(Protocol):
    async def get(self, sid: str) -> dict[str, Any] | None: ...
    async def set(self, sid: str, data: dict[str, Any], ttl: int) -> None: ...
    async def delete(self, sid: str) -> None: ...
    async def close(self) -> None: ...


class MemorySessionStore:
    """Lokal utveckling utan Redis. Per process — se modulens docstring."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[float, dict[str, Any]]] = {}

    async def get(self, sid: str) -> dict[str, Any] | None:
        entry = self._data.get(sid)
        if entry is None:
            return None
        expires_at, data = entry
        if time.monotonic() > expires_at:
            self._data.pop(sid, None)
            return None
        return data

    async def set(self, sid: str, data: dict[str, Any], ttl: int) -> None:
        self._data[sid] = (time.monotonic() + ttl, data)

    async def delete(self, sid: str) -> None:
        self._data.pop(sid, None)

    async def close(self) -> None:
        self._data.clear()


class RedisSessionStore:
    """Prod: sessioner i Redis med TTL, delade mellan poddar/workers."""

    PREFIX = "sess:"

    def __init__(self, client: Any) -> None:
        self._redis = client

    async def get(self, sid: str) -> dict[str, Any] | None:
        raw = await self._redis.get(self.PREFIX + sid)
        return json.loads(raw) if raw else None

    async def set(self, sid: str, data: dict[str, Any], ttl: int) -> None:
        await self._redis.set(self.PREFIX + sid, json.dumps(data), ex=ttl)

    async def delete(self, sid: str) -> None:
        await self._redis.delete(self.PREFIX + sid)

    async def close(self) -> None:
        await self._redis.aclose()


async def create_session_store(settings: Settings) -> SessionStore:
    """Redis om REDIS_HOST är satt (och nåbar — annars vägrar vi starta), annars minne."""
    if settings.redis_host:
        import redis.asyncio as aioredis

        client = aioredis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            password=settings.redis_password or None,
            decode_responses=True,
        )
        try:
            await client.ping()
        except Exception as exc:
            raise RuntimeError(
                "REDIS_HOST är satt men Redis nås inte — vägrar falla tillbaka på "
                "minnessessioner. Kontrollera REDIS_HOST/REDIS_PORT/REDIS_PASSWORD."
            ) from exc
        return RedisSessionStore(client)
    return MemorySessionStore()


def _store(request: Request) -> SessionStore:
    return request.app.state.session_store


async def create_session(request: Request, data: dict[str, Any]) -> str:
    """Skapar en session och returnerar cookie-värdet (signerat session-id)."""
    settings = get_settings()
    sid = secrets.token_urlsafe(32)
    await _store(request).set(sid, data, settings.session_ttl_seconds)
    return encode_cookie(sid, settings.secret_key)


async def get_session(request: Request) -> dict[str, Any] | None:
    settings = get_settings()
    sid = decode_cookie(request.cookies.get(SESSION_COOKIE), settings.secret_key)
    if sid is None:
        return None
    return await _store(request).get(sid)


async def destroy_session(request: Request) -> None:
    settings = get_settings()
    sid = decode_cookie(request.cookies.get(SESSION_COOKIE), settings.secret_key)
    if sid is not None:
        await _store(request).delete(sid)


def set_session_cookie(response: Response, cookie_value: str) -> None:
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        cookie_value,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        samesite="lax",
        # Secure när appen körs över https (avläst ur callback-URL:en).
        secure=settings.saml_callback_url.startswith("https://"),
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
