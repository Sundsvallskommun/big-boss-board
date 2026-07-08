"""Testmiljö för auth-modulen.

Env sätts på modulnivå (innan app-import) så Settings aldrig läser repo-rotens .env
eller riktiga miljövärden. DATABASE_URL pekar mot en port som inget lyssnar på —
auth-testerna rör aldrig databasen.
"""

from __future__ import annotations

import asyncio
import os

import pytest

TEST_ENV = {
    "AUTH_MODE": "saml",
    "SECRET_KEY": "test-secret-that-is-long-enough-32",
    "REDIS_HOST": "",
    "SAML_ISSUER": "bbb-test",
    "SAML_ENTRY_SSO": "http://idp.example.test/sso",
    "SAML_IDP_ENTITY_ID": "",
    "SAML_CALLBACK_URL": "http://localhost:3399/api/auth/saml/callback",
    "SAML_LOGOUT_CALLBACK_URL": "http://localhost:3399/api/auth/saml/logout/callback",
    "SAML_SUCCESS_REDIRECT": "http://localhost:3399/",
    "SAML_FAILURE_REDIRECT": "http://localhost:3399/login",
    "SAML_IDP_PUBLIC_CERT": "test-idp-cert",
    "SAML_IDP_LOGOUT_URL": "",
    "SAML_STRICT": "false",
    "SAML_WANT_ASSERTIONS_SIGNED": "true",
    "SAML_WANT_MESSAGES_SIGNED": "false",
    "SAML_REJECT_DEPRECATED_ALG": "true",
    "SAML_PUBLIC_KEY": "",
    "SAML_PRIVATE_KEY": "",
    "SAML_ALLOWED_GROUPS": "grupp_tillaten,grupp_admin",
    "SAML_ADMIN_GROUPS": "grupp_admin",
    "DATABASE_URL": "postgresql+asyncpg://test:test@localhost:65500/test",
    "IMPORT_TOKEN": "",
    "ACCESS_CODE": "",
}
os.environ.update(TEST_ENV)


@pytest.fixture(autouse=True)
def _reset_caches():
    """Nollställ settings-cachen mellan tester (env kan ändras per test)."""
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app, follow_redirects=False) as test_client:
        yield test_client


def seed_session(client, data: dict) -> None:
    """Lägger en session direkt i storen och sätter motsvarande signerad cookie."""
    from app.auth import sessions

    sid = "test-session-id"
    store = client.app.state.session_store
    asyncio.run(store.set(sid, data, 300))
    client.cookies.set(
        sessions.SESSION_COOKIE,
        sessions.encode_cookie(sid, TEST_ENV["SECRET_KEY"]),
    )
