"""Blandade filpaket, separat bevarande och läsning genom det riktiga API:t."""
from unicodedata import normalize

import pytest
from sqlalchemy import select

from app.models import Measurement, SjukUnderlag
from app.routers.dialogues import get_dialogue
from tests import test_product_imports

db = test_product_imports.db
import_client = test_product_imports.import_client
personnel = test_product_imports.personnel


def fil(name, period="2026-08-31", total=7, *, r12=True):
    return {"namn": name, "text": personnel(period, total, new=r12)}


async def skicka(client, *filer):
    response = await client.post("/api/import/sjukfranvaro-filer", json={"filer": filer})
    assert response.status_code == 200, response.text
    return response.json()


async def test_mixed_batch_keeps_unknown_values_separate_and_retry_is_idempotent(import_client, db):
    unknown = fil("juni.csv", "2026-04-30", 40, r12=False)
    known = fil("september.csv", "2026-04-30", 7)
    for index in range(2):
        result = await skicka(import_client, unknown, known)
        assert result["filer_importerade"] == result["filer_for_kontroll"] == 1
        assert result["underlag_sparade"] == 1 - index
    measurements = (await db.scalars(select(Measurement))).all()
    assert len(measurements) == 1
    assert measurements[0].value_num == 7
    assert measurements[0].details["serie"][0]["total"] == 7
    originals = (await db.scalars(select(SjukUnderlag))).all()
    assert len(originals) == 1
    await db.refresh(originals[0], ["innehall"])
    assert originals[0].innehall == unknown["text"]
    view = (await get_dialogue(1, db)).areas[2].sjuk_kontroll
    assert view.underlag[0].enhet.total == 40
    assert view.underlag[0].status == "matmetod_okand"
    assert "innehall" not in view.model_dump_json()
    # En annan förvaltning får inte se dess värden.
    assert (await get_dialogue(2, db)).areas[2].sjuk_kontroll.underlag == []


async def test_only_unknown_files_are_preserved_without_creating_a_measurement(import_client, db):
    result = await skicka(import_client, fil("gammal.csv", r12=False))
    assert result["filer_importerade"] == result["skapade"] == result["uppdaterade"] == 0
    assert result["filer_for_kontroll"] == 1
    assert await db.scalar(select(Measurement)) is None
    detail = await get_dialogue(1, db)
    assert detail.areas[2].measurement is None
    assert len(detail.areas[2].sjuk_kontroll.underlag) == 1


@pytest.mark.parametrize("value", ["NaN", "Infinity", "felskrivet", "-1", "101"])
async def test_bad_values_are_archived_and_do_not_block_valid_files(import_client, db, value):
    result = await skicka(import_client, fil("ny.csv", total=value), fil("giltig.csv"))
    assert result["filer_for_kontroll"] == result["filer_importerade"] == 1
    assert (await db.scalar(select(Measurement))).value_num == 7
    row = await db.scalar(select(SjukUnderlag))
    assert row.status == "ogiltigt_underlag" and row.enheter == []
    assert (await get_dialogue(1, db)).areas[2].sjuk_kontroll.underlag[0].enhet is None


async def test_corrected_file_clears_warning_without_deleting_original(import_client, db):
    name = "förvaltning.csv"
    await skicka(import_client, fil(normalize("NFD", name), r12=False))
    await skicka(import_client, fil(name, total=8))
    row = await db.scalar(select(SjukUnderlag))
    assert row.filnamn == name and not row.aktuell
    assert (await get_dialogue(1, db)).areas[2].sjuk_kontroll.underlag == []
    assert (await db.scalar(select(Measurement))).value_num == 8


async def test_changed_unknown_file_retains_previous_original(import_client, db):
    await skicka(import_client, fil("okand.csv", total=8, r12=False))
    await skicka(import_client, fil("okand.csv", total=9, r12=False))
    rows = (await db.scalars(select(SjukUnderlag).order_by(SjukUnderlag.id))).all()
    assert len(rows) == 2
    assert [r.aktuell for r in rows] == [False, True]
    assert [r.enheter[0]["total"] for r in rows] == [8, 9]


async def test_missing_values_stay_null_and_history_survives(import_client, db):
    await skicka(import_client, fil("juli.csv", "2026-07-31", 7))
    partial = fil("augusti.csv", total="")
    partial["text"] = partial["text"].replace("K9,100", "K9,") + "\n2026-08-31,23,SK.P.SJ.001,K12,5"
    await skicka(import_client, partial)
    m = await db.scalar(select(Measurement))
    assert m.value_num is None and m.status is None and m.trend_dir is None
    assert m.details["anstallda"] is None and m.details["kvinnor"] == 5
    assert [p["total"] for p in m.details["serie"]] == [7, None]
    await skicka(import_client, fil("rattad.csv", total=6))
    assert m.value_num == 6
    assert [p["total"] for p in m.details["serie"]] == [7, 6]


async def test_absent_total_row_still_preserves_other_sickness_values(import_client, db):
    text = "Period,Enhet,Mått,Kolumn,Mätvärde\n2026-08-31,23,SK.P.SJ.002,K20,45\n2026-08-31,23,SK.P.AM.001,K9,100"
    result = await skicka(import_client, {"namn": "delvis.csv", "text": text})
    assert result["filer_importerade"] == 1
    m = await db.scalar(select(Measurement))
    assert m.value_num is None and m.status is None
    assert m.details["langtidsandel"] == 45


async def test_bad_historical_staffing_cannot_hide_behind_newer_valid_period(import_client, db):
    bad = fil("bad.csv")
    bad["text"] += "\n2026-07-31,23,SK.P.AM.001,K9,10.5"
    result = await skicka(import_client, bad, fil("good.csv"))
    assert result["filer_for_kontroll"] == result["filer_importerade"] == 1
    assert (await db.scalar(select(Measurement))).value_num == 7


async def test_duplicate_unicode_equivalent_filenames_are_rejected_before_writes(import_client, db):
    response = await import_client.post("/api/import/sjukfranvaro-filer", json={"filer": [
        fil("förvaltning.csv"), fil(normalize("NFD", "förvaltning.csv"), r12=False),
    ]})
    assert response.status_code == 422
    assert await db.scalar(select(SjukUnderlag)) is None
    assert await db.scalar(select(Measurement)) is None


async def test_unrecognised_method_cannot_be_injected_in_an_unrelated_column(import_client, db):
    text = personnel("2026-08-31", 7, new=False) + "\n2026-08-31,13,irrelevant,K9,SK.P.AM."
    result = await skicka(import_client, {"namn": "okand.csv", "text": text})
    assert result["filer_importerade"] == 0 and result["filer_for_kontroll"] == 1
    assert await db.scalar(select(Measurement)) is None


async def test_control_view_is_bounded_and_does_not_load_originals(import_client, db):
    await skicka(import_client, *(fil(f"fil-{i}.csv", r12=False) for i in range(51)))
    view = (await get_dialogue(1, db)).areas[2].sjuk_kontroll
    assert len(view.underlag) == 50 and view.fler_finns


async def test_database_failure_rolls_back_original_and_measurement_together(import_client, db, monkeypatch):
    from app.services import sjukfranvaro_import

    async def fail(*args, **kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(sjukfranvaro_import, "import_sjukfranvaro", fail)
    with pytest.raises(RuntimeError, match="database unavailable"):
        await skicka(import_client, fil("okand.csv", r12=False), fil("giltig.csv"))
    # Samma rollback som när requestens session stängs vid fel i verklig drift.
    await db.rollback()
    assert await db.scalar(select(SjukUnderlag)) is None
    assert await db.scalar(select(Measurement)) is None
