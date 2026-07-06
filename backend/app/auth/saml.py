"""SAML SP via python3-saml (OneLogin), konfigurerad draken-kompatibelt.

Biblioteksval (omprövat efter test mot kommunens test-IdP): test-IdP:n är en driftad
fake-sso-idp som skickar issuer `http://localhost:7000/idp` (kvarglömd default),
audience = drakens metadata-URL och tomt Recipient. pysaml2 avvisar allt detta hårt
utan konfigknappar; python3-saml har exakt drakens toleransprofil som en dokumenterad
inställning: `strict: False` hoppar över destination/audience/recipient-kontrollerna
men **verifierar fortfarande XML-signaturen** mot IdP-certet — samma beteende som
passport-saml med `audience: false`. Sätt `SAML_STRICT=true` när IdP:n är spec-riktig.

Ingen IdP-metadata-fil finns i draken-flödet: IdP:n beskrivs direkt av
`SAML_ENTRY_SSO` (SSO/SLO-URL), `SAML_IDP_ENTITY_ID` (issuer i svaren; tom =
entry-URL:en) och `SAML_IDP_PUBLIC_CERT`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from app.config import Settings, get_settings

# onelogin importeras lazily i _auth()/sp_metadata_xml() — enhetstesterna fejkar
# parse_callback och ska inte kräva xmlsec-bygget på utvecklarmaskinen.

NAMEID_UNSPECIFIED = "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified"
BINDING_REDIRECT = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
BINDING_POST = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"


class SamlValidationError(Exception):
    """IdP-svaret gick inte att validera. `errors`/`reason` från python3-saml."""

    def __init__(self, errors: list[str], reason: str | None) -> None:
        self.errors = errors
        self.reason = reason
        super().__init__(f"{errors} ({reason})")


@dataclass
class CallbackResult:
    ava: dict[str, list[str]]
    name_id: str | None
    name_id_format: str | None
    session_index: str | None


def normalize_pem(value: str) -> str:
    """Env-PEM → riktig PEM. Hanterar citattecken kvar från .env och literala \\n
    (compose skickar dem oexpanderade; dotenv-varianter skiljer sig åt)."""
    pem = value.strip().strip('"').strip("'")
    pem = pem.replace("\\n", "\n").strip()
    return pem + "\n"


def cert_body(pem: str) -> str:
    """Base64-kroppen ur PEM (python3-saml tar cert/nyckel utan header-rader)."""
    body = re.sub(r"-----(BEGIN|END) [A-Z ]+-----", "", normalize_pem(pem))
    return re.sub(r"\s+", "", body)


def build_saml_settings(settings: Settings) -> dict[str, Any]:
    sign_requests = bool(settings.saml_private_key)
    return {
        # Drift ska vara strikt. Test-IdP:er som saknar korrekt audience/recipient
        # kan köra med SAML_STRICT=false, men signaturkravet ska fortfarande vara på.
        "strict": settings.saml_strict,
        "debug": False,
        "sp": {
            "entityId": settings.saml_issuer,
            "assertionConsumerService": {
                "url": settings.saml_callback_url,
                "binding": BINDING_POST,
            },
            "singleLogoutService": {
                "url": settings.saml_logout_callback_url,
                "binding": BINDING_REDIRECT,
            },
            "NameIDFormat": NAMEID_UNSPECIFIED,
            "x509cert": cert_body(settings.saml_public_key) if settings.saml_public_key else "",
            "privateKey": cert_body(settings.saml_private_key)
            if settings.saml_private_key
            else "",
        },
        "idp": {
            "entityId": settings.saml_idp_entity_id or settings.saml_entry_sso,
            "singleSignOnService": {
                "url": settings.saml_entry_sso,
                "binding": BINDING_REDIRECT,
            },
            # passport-saml-mönstret: SLO faller tillbaka på entryPoint.
            "singleLogoutService": {
                "url": settings.saml_entry_sso,
                "binding": BINDING_REDIRECT,
            },
            "x509cert": cert_body(settings.saml_idp_public_cert),
        },
        "security": {
            "authnRequestsSigned": sign_requests,
            "logoutRequestSigned": sign_requests,
            # Draken-paritet: sha256 för signatur och digest.
            "signatureAlgorithm": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
            "digestAlgorithm": "http://www.w3.org/2001/04/xmlenc#sha256",
            "wantAssertionsSigned": settings.saml_want_assertions_signed,
            "wantMessagesSigned": settings.saml_want_messages_signed,
            # Draken: disableRequestedAuthnContext.
            "requestedAuthnContext": False,
            "wantNameId": True,
            "wantAttributeStatement": True,
            # true i drift; test-IdP:n signerar rsa-sha1/sha1 (verifierat i dess källa).
            "rejectDeprecatedAlgorithm": settings.saml_reject_deprecated_alg,
        },
    }


def _request_data(
    settings: Settings,
    get_data: dict[str, str] | None = None,
    post_data: dict[str, str] | None = None,
) -> dict[str, Any]:
    """python3-saml är request-centrerat och vill veta vilken URL som träffades.
    Vi står bakom Next-proxyn, så vi syntetiserar detta ur callback-URL:en
    (i icke-strikt läge används det knappt; i strikt läge är det rätt värden)."""
    parsed = urlparse(settings.saml_callback_url)
    https = parsed.scheme == "https"
    return {
        "https": "on" if https else "off",
        "http_host": parsed.netloc,
        "server_port": str(parsed.port or (443 if https else 80)),
        "script_name": parsed.path,
        "get_data": get_data or {},
        "post_data": post_data or {},
    }


def _auth(get_data: dict[str, str] | None = None, post_data: dict[str, str] | None = None):
    from onelogin.saml2.auth import OneLogin_Saml2_Auth

    settings = get_settings()
    return OneLogin_Saml2_Auth(
        _request_data(settings, get_data, post_data), build_saml_settings(settings)
    )


def login_redirect(relay_state: str) -> str:
    """URL till IdP:n med (signerad) AuthnRequest + RelayState."""
    return _auth().login(return_to=relay_state)


def parse_callback(post_data: dict[str, str]) -> CallbackResult:
    """Validerar SAMLResponse (signatur mot IdP-certet) och plockar ut profilen."""
    auth = _auth(post_data=post_data)
    auth.process_response()
    errors = auth.get_errors()
    if errors or not auth.is_authenticated():
        raise SamlValidationError(errors, auth.get_last_error_reason())
    return CallbackResult(
        ava=auth.get_attributes(),
        name_id=auth.get_nameid(),
        name_id_format=auth.get_nameid_format(),
        session_index=auth.get_session_index(),
    )


def sp_metadata_xml() -> str:
    """SP-metadata att registrera hos IdP:n (motsvarar drakens /saml/metadata)."""
    from onelogin.saml2.settings import OneLogin_Saml2_Settings

    onelogin_settings = OneLogin_Saml2_Settings(
        build_saml_settings(get_settings()), sp_validation_only=True
    )
    metadata = onelogin_settings.get_sp_metadata()
    return metadata.decode() if isinstance(metadata, bytes) else metadata
