"""Sessionslagret: cookie-signering och minnesstorens TTL."""

from app.auth import sessions


def test_cookie_roundtrip():
    cookie = sessions.encode_cookie("abc123", "hemlis")
    assert sessions.decode_cookie(cookie, "hemlis") == "abc123"


def test_manipulerad_cookie_avvisas():
    cookie = sessions.encode_cookie("abc123", "hemlis")
    assert sessions.decode_cookie(cookie.replace("abc", "xyz"), "hemlis") is None
    assert sessions.decode_cookie(cookie, "annan-nyckel") is None
    assert sessions.decode_cookie(None, "hemlis") is None
    assert sessions.decode_cookie("utan-punkt", "hemlis") is None


async def test_minnesstore_ttl(monkeypatch):
    store = sessions.MemorySessionStore()
    await store.set("sid", {"user": {"username": "x"}}, ttl=100)
    assert await store.get("sid") is not None

    # Spola fram klockan förbi TTL.
    real = sessions.time.monotonic()
    monkeypatch.setattr(sessions.time, "monotonic", lambda: real + 101)
    assert await store.get("sid") is None


async def test_minnesstore_delete():
    store = sessions.MemorySessionStore()
    await store.set("sid", {"a": 1}, ttl=100)
    await store.delete("sid")
    assert await store.get("sid") is None
