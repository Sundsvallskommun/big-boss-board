"""Applikationskonfiguration läst från miljövariabler."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://bbb:bbb@db:5432/bbb"
    access_code: str = ""
    # Hemlig nyckel för dataimport-endpointen (maskin-till-maskin). Tom = endpoint avstängd.
    import_token: str = ""

    # --- Auth-läge: "access_code" (stub, default) eller "saml" (kommunens IdP). ---
    auth_mode: str = "access_code"

    # --- Sessioner (krävs i saml-läget) ---
    # Server-side sessioner: session-id i signerad cookie, data i Redis (prod) eller
    # minne (lokal fallback). Samma namnkontrakt som draken/OpenShift-manifesten.
    secret_key: str = ""
    redis_host: str = ""
    redis_port: int = 6379
    redis_password: str = ""
    session_ttl_seconds: int = 4 * 24 * 60 * 60  # 4 dygn, samma som draken

    # --- SAML SP <-> kommunens IdP (samma env-namn som draken) ---
    saml_issuer: str = ""
    saml_entry_sso: str = ""
    # IdP:ns entityID i syntetiserad metadata. Tom = SAML_ENTRY_SSO (passport-saml-
    # mönstret: bara entryPoint konfigureras, ingen riktig IdP-metadata-fil).
    saml_idp_entity_id: str = ""
    saml_callback_url: str = ""
    saml_logout_callback_url: str = ""
    saml_success_redirect: str = ""
    saml_failure_redirect: str = ""
    saml_idp_public_cert: str = ""
    saml_public_key: str = ""
    saml_private_key: str = ""
    # Kommaseparerade AD-grupper: ALLOWED = får logga in, ADMIN = adminroll.
    saml_allowed_groups: str = ""
    saml_admin_groups: str = ""
    # Tillåten klockdrift mot IdP i sekunder. Draken stänger av tidskontrollen helt
    # (acceptedClockSkewMs: -1); vi tillåter drift men validerar — höj vid behov.
    saml_clock_skew: int = 300
    # Strikt SAML-validering (destination/audience/recipient). Ska vara true i drift.
    # Sätt false endast mot en kontrollerad test-IdP som inte följer SAML-profilen.
    saml_strict: bool = True
    # Minst en av dessa ska vara true i SAML-läge. Kommunens/prod-IdP ska normalt
    # signera assertionen; vissa test-IdP:er signerar i stället hela response-message.
    saml_want_assertions_signed: bool = True
    saml_want_messages_signed: bool = False
    # Avvisa föråldrade signaturalgoritmer (sha1). Ska vara true i drift.
    # Test-IdP:n (fake-sso-idp) signerar med rsa-sha1/sha1 — sätt false mot den.
    saml_reject_deprecated_alg: bool = True
    # IdP:ns utloggnings-URL (rensar IdP-sessionen). Test-IdP:n hanterar inte
    # SAML SLO-requests utan har en egen /logout?RelayState=<retur-URL>-route.
    # Tom = endast lokal utloggning (IdP-sessionen lever kvar → nästa login SSO:ar).
    saml_idp_logout_url: str = ""

    # --- WSO2 / api.sundsvall.se (OAuth2 client credentials, maskin-till-maskin) ---
    api_base_url: str = "https://api-test.sundsvall.se"
    client_key: str = ""
    client_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


VALID_AUTH_MODES = {"access_code", "saml"}


def validate_runtime_settings(settings: Settings) -> None:
    """Fail-fast på auth-konfiguration som annars riskerar att bli fail-open."""
    if settings.auth_mode not in VALID_AUTH_MODES:
        raise RuntimeError(
            f"Ogiltigt AUTH_MODE={settings.auth_mode!r}. Tillåtna värden: access_code, saml."
        )

    if settings.auth_mode != "saml":
        return

    missing = [
        name
        for name, value in [
            ("SECRET_KEY", settings.secret_key),
            ("SAML_ISSUER", settings.saml_issuer),
            ("SAML_ENTRY_SSO", settings.saml_entry_sso),
            ("SAML_CALLBACK_URL", settings.saml_callback_url),
            ("SAML_LOGOUT_CALLBACK_URL", settings.saml_logout_callback_url),
            ("SAML_SUCCESS_REDIRECT", settings.saml_success_redirect),
            ("SAML_FAILURE_REDIRECT", settings.saml_failure_redirect),
            ("SAML_IDP_PUBLIC_CERT", settings.saml_idp_public_cert),
            ("SAML_ALLOWED_GROUPS", settings.saml_allowed_groups),
        ]
        if not value
    ]
    if missing:
        raise RuntimeError(
            "AUTH_MODE=saml kräver att följande miljövariabler är satta: "
            + ", ".join(missing)
        )
    if len(settings.secret_key) < 32:
        raise RuntimeError("SECRET_KEY måste vara minst 32 tecken i AUTH_MODE=saml.")
    if settings.session_ttl_seconds <= 0:
        raise RuntimeError("SESSION_TTL_SECONDS måste vara större än 0.")
    if not (
        settings.saml_want_assertions_signed or settings.saml_want_messages_signed
    ):
        raise RuntimeError(
            "SAML måste kräva signerad assertion eller signerad response-message."
        )
