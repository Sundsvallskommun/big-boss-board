"""Claim-mappning: ADFS-URI:er, enkla namn, saknade fält, gruppauktorisation, roller."""

import pytest

from app.auth import claims
from app.config import get_settings

ADFS_PROFILE = {
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": ["Anna"],
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": ["Andersson"],
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": ["anna@example.se"],
    "http://schemas.xmlsoap.org/claims/Group": ["Grupp_Tillaten", "annan_grupp"],
    "urn:oid:0.9.2342.19200300.100.1.1": ["ann01and"],
}

PLAIN_PROFILE = {
    "givenName": ["Bo"],
    "sn": ["Berg"],
    "email": ["bo@example.se"],
    "groups": ["grupp_tillaten,extra_grupp"],
    "uid": ["bo02ber"],
}


def test_adfs_claims_mappas():
    user = claims.build_user(ADFS_PROFILE, get_settings())
    assert user["name"] == "Anna Andersson"
    assert user["username"] == "ann01and"
    assert user["email"] == "anna@example.se"
    # Flervärdesattribut → lista, gemener.
    assert user["groups"] == ["grupp_tillaten", "annan_grupp"]
    assert user["role"] == "user"


def test_enkla_claims_och_kommaseparerade_grupper():
    user = claims.build_user(PLAIN_PROFILE, get_settings())
    assert user["name"] == "Bo Berg"
    assert user["groups"] == ["grupp_tillaten", "extra_grupp"]


def test_admin_grupp_ger_admin_roll():
    profile = dict(PLAIN_PROFILE, groups=["grupp_admin"])
    user = claims.build_user(profile, get_settings())
    assert user["role"] == "admin"


def test_grupp_utanfor_listan_nekas():
    profile = dict(PLAIN_PROFILE, groups=["helt_annan_grupp"])
    with pytest.raises(claims.SamlGroupError):
        claims.build_user(profile, get_settings())


def test_saknade_falt_rapporteras_med_namn():
    profile = {"givenName": ["Cia"]}
    with pytest.raises(claims.SamlAttributeError) as excinfo:
        claims.build_user(profile, get_settings())
    assert set(excinfo.value.missing) == {"surname", "email", "username", "groups"}


def test_gruppjamforelse_ar_skiftlagesokanslig():
    assert claims.authorize_groups(["grupp_tillaten"], "GRUPP_TILLATEN")
    assert claims.resolve_role(["grupp_admin"], "Grupp_Admin") == "admin"
