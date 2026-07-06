"""API-tester: /api/me, mode-gaten och SAML-callbacken (med fejkad SAML-klient).

Callback-testerna fejkar pysaml2-klienten — riktig XML-validering kräver xmlsec1
och en riktig IdP och verifieras i containern/mot test-IdP:n.
"""

from __future__ import annotations

from app.auth import router as auth_router
from tests.conftest import seed_session

USER = {
    "name": "Anna Andersson",
    "firstName": "Anna",
    "lastName": "Andersson",
    "username": "ann01and",
    "email": "anna@example.se",
    "groups": ["grupp_tillaten"],
    "role": "user",
}


def test_me_utan_session_ger_401(client):
    response = client.get("/api/me")
    assert response.status_code == 401


def test_me_med_session_ger_anvandaren(client):
    seed_session(client, {"user": USER})
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json()["username"] == "ann01and"


def test_me_med_manipulerad_cookie_ger_401(client):
    seed_session(client, {"user": USER})
    client.cookies.set("bbb_session", "fejk.signatur")
    assert client.get("/api/me").status_code == 401


def test_saml_endpoints_404_utan_saml_lage(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("AUTH_MODE", "access_code")
    get_settings.cache_clear()
    assert client.get("/api/auth/saml/login").status_code == 404
    assert client.get("/api/auth/saml/metadata").status_code == 404


def _fake_parse_callback(ava: dict):
    """Ersätter saml.parse_callback — riktig XML-validering kräver IdP:n."""
    from app.auth.saml import CallbackResult

    def fake(_post_data):
        return CallbackResult(ava=ava, name_id="nid", name_id_format=None, session_index="si")

    return fake


ADFS_AVA = {
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": ["Anna"],
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": ["Andersson"],
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": ["anna@example.se"],
    "http://schemas.xmlsoap.org/claims/Group": ["grupp_admin"],
    "urn:oid:0.9.2342.19200300.100.1.1": ["ann01and"],
}


def test_callback_skapar_session_och_redirectar(client, monkeypatch):
    monkeypatch.setattr(auth_router.saml, "parse_callback", _fake_parse_callback(ADFS_AVA))
    response = client.post(
        "/api/auth/saml/callback",
        data={
            "SAMLResponse": "dummy",
            "RelayState": "http://localhost:3399/omraden,http://localhost:3399/login",
        },
    )
    assert response.status_code == 303
    assert response.headers["location"] == "http://localhost:3399/omraden"
    assert "bbb_session=" in response.headers.get("set-cookie", "")

    # Sessionen ska nu ge /api/me — TestClient plockar upp Set-Cookie automatiskt.
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["role"] == "admin"


def test_callback_nekar_fel_grupp(client, monkeypatch):
    ava = dict(ADFS_AVA)
    ava["http://schemas.xmlsoap.org/claims/Group"] = ["obehorig_grupp"]
    monkeypatch.setattr(auth_router.saml, "parse_callback", _fake_parse_callback(ava))
    response = client.post(
        "/api/auth/saml/callback", data={"SAMLResponse": "dummy", "RelayState": ""}
    )
    assert response.status_code == 303
    assert "failMessage=SAML_MISSING_GROUP" in response.headers["location"]
    assert client.get("/api/me").status_code == 401


def test_callback_utan_samlresponse_ger_fail_redirect(client):
    response = client.post("/api/auth/saml/callback", data={"RelayState": ""})
    assert response.status_code == 303
    assert "failMessage=SAML_UNKNOWN_ERROR" in response.headers["location"]


def test_callback_med_ond_relaystate_faller_tillbaka(client, monkeypatch):
    monkeypatch.setattr(auth_router.saml, "parse_callback", _fake_parse_callback(ADFS_AVA))
    response = client.post(
        "/api/auth/saml/callback",
        data={
            "SAMLResponse": "dummy",
            "RelayState": "https://ond.example.com/,https://ond.example.com/login",
        },
    )
    assert response.status_code == 303
    assert response.headers["location"] == "http://localhost:3399/"


def test_logout_river_sessionen(client):
    seed_session(client, {"user": USER})
    assert client.get("/api/me").status_code == 200

    response = client.get("/api/auth/saml/logout")
    # Ingen SAML_IDP_LOGOUT_URL i testmiljön → endast lokal utloggning.
    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:3399/"
    assert client.get("/api/me").status_code == 401


def test_logout_skickar_vidare_till_idp_logout(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("SAML_IDP_LOGOUT_URL", "http://idp.example.test/logout")
    get_settings.cache_clear()

    seed_session(client, {"user": USER})
    response = client.get("/api/auth/saml/logout")
    assert response.status_code == 302
    assert response.headers["location"] == (
        "http://idp.example.test/logout?RelayState=http%3A%2F%2Flocalhost%3A3399%2F"
    )
    assert client.get("/api/me").status_code == 401


def test_logout_callback_redirectar_sakert(client):
    response = client.get(
        "/api/auth/saml/logout/callback",
        params={"RelayState": "https://ond.example.com/"},
    )
    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:3399/"
