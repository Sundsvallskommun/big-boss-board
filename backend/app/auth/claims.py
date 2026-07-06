"""Claim-mappning och gruppauktorisation för SAML-profiler.

Port av draken-publics callback-logik: IdP:n har historiskt levererat claims i två
format (Onegate → ADFS-bytet 2023), så varje fält slås upp via en kandidatlista —
ADFS-claim-URI:n först, sedan de enkla attributnamnen. pysaml2 kan dessutom ha
översatt kända URI:er till friendly names, därför ingår båda i listorna.

Loggar aldrig attributvärden — bara namnen på fält som saknas (dataregeln).
"""

from __future__ import annotations

from typing import Any

from app.config import Settings

# Kandidatnycklar per fält: ADFS-URI, ev. urn:oid, friendly names.
GIVEN_NAME_KEYS = [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    "givenName",
]
SURNAME_KEYS = [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
    "sn",
]
EMAIL_KEYS = [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "email",
    "mail",
]
GROUPS_KEYS = [
    "http://schemas.xmlsoap.org/claims/Group",
    "groups",
]
USERNAME_KEYS = [
    "urn:oid:0.9.2342.19200300.100.1.1",
    "uid",
    "username",
]


class SamlAttributeError(Exception):
    """Nödvändiga profilfält saknas. `missing` innehåller fältnamn, aldrig värden."""

    def __init__(self, missing: list[str]) -> None:
        self.missing = missing
        super().__init__(f"Saknade SAML-attribut: {', '.join(missing)}")


class SamlGroupError(Exception):
    """Användaren ingår inte i någon tillåten grupp."""


def _values(ava: dict[str, Any], keys: list[str]) -> list[str]:
    """Alla värden för första kandidatnyckel som finns. pysaml2 ger listor."""
    for key in keys:
        if key in ava:
            value = ava[key]
            if isinstance(value, str):
                return [value]
            return [str(v) for v in value]
    return []


def _first(ava: dict[str, Any], keys: list[str]) -> str | None:
    values = _values(ava, keys)
    return values[0] if values else None


def extract_groups(ava: dict[str, Any]) -> list[str]:
    """Grupplista, gemener. Hanterar både flervärdesattribut (ADFS: ett Group-claim
    per grupp) och kommaseparerad sträng (draken slår ihop med join(','))."""
    groups: list[str] = []
    for raw in _values(ava, GROUPS_KEYS):
        groups.extend(g.strip().lower() for g in raw.split(",") if g.strip())
    return groups


def _csv(value: str) -> list[str]:
    return [item.strip().lower() for item in value.split(",") if item.strip()]


def authorize_groups(groups: list[str], allowed_csv: str) -> bool:
    """Sant om användaren ingår i minst en tillåten grupp (draken: some/includes)."""
    allowed = _csv(allowed_csv)
    return any(group in allowed for group in groups)


def resolve_role(groups: list[str], admin_csv: str) -> str:
    """bbb har två roller: admin (medlem i admin-grupp) och user."""
    admin = _csv(admin_csv)
    return "admin" if any(group in admin for group in groups) else "user"


def build_user(ava: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """Profil → användarobjekt för sessionen. Kastar SamlAttributeError/SamlGroupError."""
    given_name = _first(ava, GIVEN_NAME_KEYS)
    surname = _first(ava, SURNAME_KEYS)
    email = _first(ava, EMAIL_KEYS)
    username = _first(ava, USERNAME_KEYS)
    groups = extract_groups(ava)

    missing = [
        name
        for name, value in [
            ("givenName", given_name),
            ("surname", surname),
            ("email", email),
            ("username", username),
            ("groups", groups or None),
        ]
        if not value
    ]
    if missing:
        raise SamlAttributeError(missing)

    if not authorize_groups(groups, settings.saml_allowed_groups):
        raise SamlGroupError()

    return {
        "name": f"{given_name} {surname}",
        "firstName": given_name,
        "lastName": surname,
        "username": username,
        "email": email,
        "groups": groups,
        "role": resolve_role(groups, settings.saml_admin_groups),
    }
