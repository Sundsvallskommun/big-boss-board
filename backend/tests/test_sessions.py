"""Sessionslagret: cookie-signering och minnesstorens TTL."""

import redis.asyncio as aioredis

from app.auth import sessions
from app.config import Settings


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


async def test_redisstore_anvander_korta_timeouter(monkeypatch):
    captured_kwargs = {}

    class FakeRedis:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

        async def ping(self):
            return True

    monkeypatch.setattr(aioredis, "Redis", FakeRedis)

    store = await sessions.create_session_store(
        Settings(
            redis_host="redis.example.test",
            redis_port=6379,
            redis_password="hemlis",
        )
    )

    assert isinstance(store, sessions.RedisSessionStore)
    assert captured_kwargs["socket_connect_timeout"] == 2
    assert captured_kwargs["socket_timeout"] == 2
