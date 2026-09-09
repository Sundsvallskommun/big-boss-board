"""Publika aggregat: importens periodurval och historik får inte ändra innebörden."""
import pytest

from app.schemas import EkonomiEnhet, ExportFil
from app.services.ekonomi_import import (
    NETTOKOSTNAD, _measurement_fields, csv_to_payload, valj_ekonomifiler,
)


def export(period="2026-04-30", value=-100, delimiter=","):
    rows = [
        ["Period", "Enhet", "Mått", "Kolumn", "Mätvärde"],
        [period, "23", NETTOKOSTNAD, "K15", "-100"],
        [period, "23", NETTOKOSTNAD, "K14", "-1200"],
        [period, "23", NETTOKOSTNAD, "K18", "-1200"],
        [period, "23", NETTOKOSTNAD, "K16", str(value)],
        [period, "9999", NETTOKOSTNAD, "K16", "-900"],
    ]
    return "\ufeff" + "\r\n".join(delimiter.join(row) for row in rows)


@pytest.mark.parametrize("delimiter", [",", "\t"])
def test_reads_public_administration_aggregates_only(delimiter):
    payload = csv_to_payload(export(delimiter=delimiter))
    assert payload["period"] == "2026-04-30"
    assert [e["kod"] for e in payload["enheter"]] == ["23"]
    assert payload["enheter"][0]["matt"][NETTOKOSTNAD]["utfall"] == -100


def test_official_window_beats_later_manual_export_and_filename_prefix():
    files = [
        ExportFil(namn="RR_forvaltning_2026-05-01.csv", text=export(value=-101)),
        ExportFil(namn="RR_2026-05-09.csv", text=export(value=-109)),
        ExportFil(namn="RR_2026-05-20.csv", text=export(value=-120)),
        ExportFil(namn="RR_2026-06-09.csv", text=export(value=-609)),
    ]
    assert valj_ekonomifiler(files) == [files[1].text]


def test_single_period_preserves_history_and_replaces_duplicate():
    entity = EkonomiEnhet(**csv_to_payload(export())["enheter"][0])
    old = [{"period": "2026-03-31", "utfall": -90}, {"period": "2026-04-30", "utfall": -95}]
    fields = _measurement_fields(entity, "2026-04-30", "Test", old)
    assert fields["details"]["serie"][0] == old[0]
    assert len(fields["details"]["serie"]) == 2
    assert fields["details"]["serie"][1]["utfall"] == -100


def test_first_single_period_initialises_history():
    entity = EkonomiEnhet(**csv_to_payload(export())["enheter"][0])
    assert len(_measurement_fields(entity, "2026-04-30", "Test")["details"]["serie"]) == 1


def test_mixed_periods_rejected_instead_of_mislabelling_amounts():
    with pytest.raises(ValueError, match="flera rapportperioder"):
        csv_to_payload(export() + "\n2026-05-31,23,SK.EK.RR.005,K16,-120")


@pytest.mark.parametrize("budget,forecast,expected,status", [
    (-100, -110, -10, "alert"), (-100, -90, 10, "good"),
    (-100, -100, 0, "good"), (0, -100, None, None), (-100, None, None, None),
])
def test_budget_forecast_is_the_canonical_assessment(budget, forecast, expected, status):
    from app.services.ekonomi import bedom_ekonomi
    b = bedom_ekonomi(budget, forecast)
    assert b.diff == expected
    assert (b.status.value if b.status else None) == status


def test_april_correction_is_scoped_and_rejects_changed_budget():
    from app.services.ekonomi_import import korrigerat_underlag
    data = csv_to_payload(export())["enheter"][0]
    data["kod"] = "24"
    data["matt"][NETTOKOSTNAD]["budget_helar"] = -2972.31
    entity = EkonomiEnhet(**data)
    corrected = korrigerat_underlag(entity, "2026-04-30")
    assert corrected.matt[NETTOKOSTNAD].prognos == -2972.31
    assert corrected.matt[NETTOKOSTNAD].korrigerad
    assert not korrigerat_underlag(entity, "2026-05-31").matt[NETTOKOSTNAD].korrigerad
    entity.matt[NETTOKOSTNAD].budget_helar = -3000
    with pytest.raises(ValueError, match="omprövning"):
        korrigerat_underlag(entity, "2026-04-30")
