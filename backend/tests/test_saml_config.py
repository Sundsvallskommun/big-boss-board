"""SAML-/auth-konfiguration ska faila stängt och kräva signerade SAML-svar."""

import pytest

from app.auth import saml
from app.config import Settings, get_settings, validate_runtime_settings


def test_saml_settings_kraver_signerad_assertion():
    settings = saml.build_saml_settings(get_settings())

    assert settings["security"]["wantAssertionsSigned"] is True
    assert settings["security"]["wantMessagesSigned"] is False
    assert settings["security"]["rejectDeprecatedAlgorithm"] is True


def test_login_redirect_lagger_sigalg_fore_signature_utan_att_andra_vardena(monkeypatch):
    raw_url = (
        "https://adfs.sundsvall.se/adfs/ls/?"
        "SAMLRequest=request%2Bmed%2Fencoding%3D"
        "&RelayState=https%3A%2F%2Fchefdialog.sundsvall.se%2Clogin%3Ffail"
        "&Signature=signatur%2Bmed%2Fencoding%3D"
        "&SigAlg=http%3A%2F%2Fwww.w3.org%2F2001%2F04%2Fxmldsig-more%23rsa-sha256"
    )

    class FakeAuth:
        def login(self, return_to: str) -> str:
            assert return_to == "relay-state"
            return raw_url

    monkeypatch.setattr(saml, "_auth", lambda: FakeAuth())

    redirect_url = saml.login_redirect("relay-state")

    assert redirect_url == (
        "https://adfs.sundsvall.se/adfs/ls/?"
        "SAMLRequest=request%2Bmed%2Fencoding%3D"
        "&RelayState=https%3A%2F%2Fchefdialog.sundsvall.se%2Clogin%3Ffail"
        "&SigAlg=http%3A%2F%2Fwww.w3.org%2F2001%2F04%2Fxmldsig-more%23rsa-sha256"
        "&Signature=signatur%2Bmed%2Fencoding%3D"
    )


def test_login_redirect_lamnar_osignerad_url_orord(monkeypatch):
    raw_url = "https://idp.example.test/sso?SAMLRequest=abc%2Bdef&RelayState=return%2Fto"

    class FakeAuth:
        def login(self, return_to: str) -> str:
            return raw_url

    monkeypatch.setattr(saml, "_auth", lambda: FakeAuth())

    assert saml.login_redirect("relay-state") == raw_url


def test_runtime_settings_avvisar_okant_auth_lage():
    settings = Settings(auth_mode="felskrivet")

    with pytest.raises(RuntimeError, match="Ogiltigt AUTH_MODE"):
        validate_runtime_settings(settings)


def test_runtime_settings_avvisar_saml_utan_signaturkrav():
    settings = get_settings().model_copy(
        update={
            "saml_want_assertions_signed": False,
            "saml_want_messages_signed": False,
        }
    )

    with pytest.raises(RuntimeError, match="SAML måste kräva signerad"):
        validate_runtime_settings(settings)
