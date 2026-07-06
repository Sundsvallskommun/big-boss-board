"""Redirect-/RelayState-validering (skydd mot open redirect)."""

from app.auth import redirects
from app.config import get_settings


def test_egen_origin_tillats():
    s = get_settings()
    assert redirects.is_allowed_url("http://localhost:3399/dialog/5", s)


def test_frammande_origin_avvisas():
    s = get_settings()
    assert not redirects.is_allowed_url("https://ond.example.com/", s)
    assert not redirects.is_allowed_url("javascript:alert(1)", s)
    assert not redirects.is_allowed_url("//ond.example.com", s)
    assert not redirects.is_allowed_url(None, s)


def test_relay_state_roundtrip():
    s = get_settings()
    relay = redirects.build_relay_state(
        "http://localhost:3399/dialog/5", "http://localhost:3399/login?fail", s
    )
    success, failure = redirects.split_relay_state(relay, s)
    assert success == "http://localhost:3399/dialog/5"
    assert failure == "http://localhost:3399/login?fail"


def test_ogiltig_relay_state_faller_tillbaka_pa_konfig():
    s = get_settings()
    success, failure = redirects.split_relay_state("https://ond.example.com/,x", s)
    assert success == s.saml_success_redirect
    assert failure == s.saml_failure_redirect


def test_fail_message_laggs_som_query():
    url = redirects.with_fail_message("http://localhost:3399/login", "SAML_MISSING_GROUP")
    assert url == "http://localhost:3399/login?failMessage=SAML_MISSING_GROUP"
    url2 = redirects.with_fail_message("http://localhost:3399/login?a=1", "X")
    assert url2.endswith("a=1&failMessage=X")
