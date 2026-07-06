"""SAML-/auth-konfiguration ska faila stängt och kräva signerade SAML-svar."""

import pytest

from app.auth import saml
from app.config import Settings, get_settings, validate_runtime_settings


def test_saml_settings_kraver_signerad_assertion():
    settings = saml.build_saml_settings(get_settings())

    assert settings["security"]["wantAssertionsSigned"] is True
    assert settings["security"]["wantMessagesSigned"] is False
    assert settings["security"]["rejectDeprecatedAlgorithm"] is True


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
