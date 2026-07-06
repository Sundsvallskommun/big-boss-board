"""OAuth2 client credentials mot WSO2-gatewayn (api.sundsvall.se).

Port av drakens api-token.service.ts: token cachas i Redis och delas mellan poddar;
ett NX-lås ser till att bara en pod hämtar ny token åt gången. Utan Redis (lokal
utveckling) cachas token i processminnet.

Används först när bbb börjar anropa centrala API:er:

    token = await GatewayTokenService(redis_client).get_token()
    headers = {"Authorization": f"Bearer {token}"}
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger("bbb.gateway")

REDIS_TOKEN_KEY = "wso2:access_token"
REDIS_EXPIRES_KEY = "wso2:token_expires"
REDIS_LOCK_KEY = "wso2:token_lock"
LOCK_TTL_SECONDS = 10
LOCK_WAIT_SECONDS = 0.5
LOCK_MAX_RETRIES = 5
# Marginal så token aldrig används sekunderna innan den går ut (draken: 10 s).
EXPIRY_MARGIN_SECONDS = 10


class GatewayTokenError(Exception):
    """Token kunde inte hämtas från gatewayn."""


class GatewayTokenService:
    def __init__(self, redis_client: Any | None = None) -> None:
        """`redis_client` är en redis.asyncio-klient eller None (lokal minnescache)."""
        self._redis = redis_client
        self._local_token = ""
        self._local_expires = 0.0

    async def get_token(self) -> str:
        if self._redis is not None:
            return await self._get_token_redis()
        if self._local_token and time.time() < self._local_expires:
            return self._local_token
        token = await self._fetch_from_wso2()
        self._local_token = token["access_token"]
        self._local_expires = time.time() + token["expires_in"] - EXPIRY_MARGIN_SECONDS
        return self._local_token

    async def _get_token_redis(self) -> str:
        token, expires = await asyncio.gather(
            self._redis.get(REDIS_TOKEN_KEY), self._redis.get(REDIS_EXPIRES_KEY)
        )
        if token and expires and time.time() < float(expires):
            return token

        # NX-lås: bara en pod hämtar ny token, övriga väntar och läser ur Redis.
        acquired = await self._redis.set(REDIS_LOCK_KEY, "1", nx=True, ex=LOCK_TTL_SECONDS)
        if acquired:
            try:
                logger.info("Tog token-låset — hämtar ny OAuth-token")
                return await self._fetch_to_redis()
            finally:
                try:
                    await self._redis.delete(REDIS_LOCK_KEY)
                except Exception:  # noqa: BLE001 — låset dör ändå via TTL
                    pass

        logger.info("Annan pod hämtar token — väntar")
        for _ in range(LOCK_MAX_RETRIES):
            await asyncio.sleep(LOCK_WAIT_SECONDS)
            token, expires = await asyncio.gather(
                self._redis.get(REDIS_TOKEN_KEY), self._redis.get(REDIS_EXPIRES_KEY)
            )
            if token and expires and time.time() < float(expires):
                return token

        logger.warning("Väntetiden på token-låset gick ut — hämtar själv")
        return await self._fetch_to_redis()

    async def _fetch_to_redis(self) -> str:
        token = await self._fetch_from_wso2()
        ttl = max(1, int(token["expires_in"]) - EXPIRY_MARGIN_SECONDS)
        expires_at = time.time() + ttl
        await self._redis.set(REDIS_TOKEN_KEY, token["access_token"], ex=ttl)
        await self._redis.set(REDIS_EXPIRES_KEY, str(expires_at), ex=ttl)
        logger.info("Token cachad i Redis, giltig %s s", token["expires_in"])
        return token["access_token"]

    async def _fetch_from_wso2(self) -> dict[str, Any]:
        settings = get_settings()
        if not settings.client_key or not settings.client_secret:
            raise GatewayTokenError("CLIENT_KEY/CLIENT_SECRET är inte konfigurerade.")
        auth = base64.b64encode(
            f"{settings.client_key}:{settings.client_secret}".encode()
        ).decode()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    f"{settings.api_base_url.rstrip('/')}/token",
                    headers={
                        "Authorization": f"Basic {auth}",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    data={"grant_type": "client_credentials"},
                )
                response.raise_for_status()
                token = response.json()
        except Exception as exc:
            logger.error("Kunde inte hämta gateway-token: %s", exc)
            raise GatewayTokenError("Token kunde inte hämtas från gatewayn.") from exc

        if "access_token" not in token or "expires_in" not in token:
            raise GatewayTokenError("Oväntat tokensvar från gatewayn.")
        return token
