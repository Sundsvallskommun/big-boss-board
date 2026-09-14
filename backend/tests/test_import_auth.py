"""Autentisering före kropp, med verkliga routrar och utan databas/server."""
import re

import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute

from app.config import get_settings
from app.routers import admin, import_data
from app.services.hme_import import hme_status

app = FastAPI()
app.include_router(import_data.router)
app.include_router(admin.router)
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


async def test_disabled_import_is_rejected_before_invalid_json(monkeypatch):
    monkeypatch.setenv("IMPORT_TOKEN", "")
    get_settings.cache_clear()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/import/hme", content=b"{", headers={"content-type": "application/json"})
    assert response.status_code == 503


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


def test_openapi_describes_bearer_auth():
    schema = app.openapi()
    assert schema["paths"]["/api/import/hme"]["post"]["security"] == [{"HTTPBearer": []}]


@pytest.mark.parametrize("value,expected", [(75, "good"), (73, "warn"), (70, "warn"), (69.9, "alert")])
def test_hme_status_boundaries_match_chart_contract(value, expected):
    assert hme_status(value, 75).value == expected
