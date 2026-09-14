"""Behörighet före kropp (token eller admin-session), med verkliga routrar utan databas."""
import re

import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute

from app.auth import sessions
from app.auth.sessions import MemorySessionStore
from app.config import get_settings
from app.routers import admin, import_data
from app.services.hme_import import hme_status
from tests.conftest import TEST_ENV

app = FastAPI()
app.include_router(import_data.router)
app.include_router(admin.router)
app.state.session_store = MemorySessionStore()  # Ingen lifespan i den nakna testappen.
ENDPOINTS = [
    (method, re.sub(r"\{[^}]+\}", "1", route.path))
    for router in (import_data.router, admin.router)
    for route in router.routes
    if isinstance(route, APIRoute)
    for method in sorted(route.methods)
]


@pytest.mark.parametrize("method,path", ENDPOINTS)
@pytest.mark.parametrize("authorization", [None, "Bearer wrong"])
async def test_unauthorized_requests_never_read_body(monkeypatch, method, path, authorization):
    monkeypatch.setenv("IMPORT_TOKEN", "test-import-token")
    get_settings.cache_clear()

    async def unread_body():
        raise AssertionError("En obehörig kropp får inte läsas")
        yield b""  # Gör funktionen till en async generator.

    headers = {"content-type": "application/json"}
    if authorization:
        headers["authorization"] = authorization
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(method, path, headers=headers, content=unread_body())
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("authorization,expected", [("Bearer nagot", 503), (None, 401)])
async def test_unconfigured_token_is_rejected_before_invalid_json(monkeypatch, authorization, expected):
    """Tom IMPORT_TOKEN stänger tokenvägen (503); utan token OCH utan session är svaret 401."""
    monkeypatch.setenv("IMPORT_TOKEN", "")
    get_settings.cache_clear()
    headers = {"content-type": "application/json"}
    if authorization:
        headers["authorization"] = authorization
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/import/hme", content=b"{", headers=headers)
    assert response.status_code == expected


@pytest.mark.parametrize("path", ["/api/import/hme", "/api/admin/status-cards"])
async def test_valid_token_reaches_normal_body_validation(monkeypatch, path):
    monkeypatch.setenv("IMPORT_TOKEN", "test-import-token")
    get_settings.cache_clear()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(path, content=b"{", headers={
            "content-type": "application/json", "authorization": "Bearer test-import-token",
        })
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "json_invalid"


async def session_cookie(role: str | None) -> dict[str, str]:
    """Session i storen + signerad kaka. role=None ger en kaka utan giltig session."""
    sid = f"sid-{role}"
    if role:
        await app.state.session_store.set(sid, {"user": {"username": "t", "role": role}}, 300)
    return {sessions.SESSION_COOKIE: sessions.encode_cookie(sid, TEST_ENV["SECRET_KEY"])}


@pytest.mark.parametrize("path", ["/api/import/hme", "/api/admin/status-cards"])
async def test_admin_session_reaches_normal_body_validation_without_token(monkeypatch, path):
    monkeypatch.setenv("IMPORT_TOKEN", "")  # Sessionsvägen kräver ingen konfigurerad token.
    get_settings.cache_clear()
    cookies = await session_cookie("admin")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        response = await client.post(path, content=b"{", headers={"content-type": "application/json"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "json_invalid"


@pytest.mark.parametrize("role,expected", [("user", 403), (None, 401)])
async def test_non_admin_sessions_are_rejected_before_body(role, expected):
    cookies = await session_cookie(role)

    async def unread_body():
        raise AssertionError("En obehörig kropp får inte läsas")
        yield b""

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        response = await client.post(
            "/api/import/hme", headers={"content-type": "application/json"}, content=unread_body(),
        )
    assert response.status_code == expected


async def test_tampered_session_cookie_is_rejected():
    cookies = {sessions.SESSION_COOKIE: sessions.encode_cookie("sid-admin", "fel-hemlighet-som-ar-lang-nog-32")}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        response = await client.get("/api/admin/submissions")
    assert response.status_code == 401


@pytest.mark.parametrize("fetch_site,expected", [
    ("cross-site", 403), ("same-site", 403),  # Lax skickar kakan från syskondomäner.
    ("same-origin", 422), ("none", 422), (None, 422),  # Swagger, adressfält, server-side fetch.
])
async def test_session_writes_require_same_origin_browser_context(fetch_site, expected):
    cookies = await session_cookie("admin")
    headers = {"content-type": "application/json"}
    if fetch_site:
        headers["sec-fetch-site"] = fetch_site
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        response = await client.post("/api/import/hme", content=b"{", headers=headers)
    assert response.status_code == expected


async def test_session_reads_ignore_fetch_site():
    """Läsning gatas inte av Sec-Fetch-Site — bara ändrande metoder (spärren körs före handlern)."""
    from fastapi import Request

    from app.auth.admin_access import require_admin_access

    cookies = await session_cookie("admin")
    cookie_header = f"{sessions.SESSION_COOKIE}={cookies[sessions.SESSION_COOKIE]}".encode()
    headers = [(b"cookie", cookie_header), (b"sec-fetch-site", b"cross-site")]
    scope = {"type": "http", "method": "GET", "path": "/api/admin/status-cards", "headers": headers, "app": app}
    await require_admin_access(Request(scope))  # Får inte kasta.


async def test_bearer_header_decides_even_with_admin_session(monkeypatch):
    """Skickas en token är det den som gäller — en felaktig token räddas inte av kakan."""
    monkeypatch.setenv("IMPORT_TOKEN", "test-import-token")
    get_settings.cache_clear()
    cookies = await session_cookie("admin")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        response = await client.post(
            "/api/import/hme", content=b"{}",
            headers={"content-type": "application/json", "authorization": "Bearer wrong"},
        )
    assert response.status_code == 401


def test_openapi_describes_token_or_session_auth():
    schema = app.openapi()
    security = schema["paths"]["/api/import/hme"]["post"]["security"]
    assert security == [{"HTTPBearer": []}, {"AdminSession": []}]
    assert schema["components"]["securitySchemes"]["AdminSession"] == {
        "type": "apiKey", "in": "cookie", "name": "bbb_session",
    }


@pytest.mark.parametrize("value,expected", [(75, "good"), (73, "warn"), (70, "warn"), (69.9, "alert")])
def test_hme_status_boundaries_match_chart_contract(value, expected):
    assert hme_status(value, 75).value == expected
