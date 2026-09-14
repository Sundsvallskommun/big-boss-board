"""Initiering får aldrig återställa eller rensa en använd databas."""

import json

import pytest
from sqlalchemy import delete, event, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.ext.compiler import compiles

from app import seed
from app.db import Base
from app.models import (
    Activity,
    AreaStatus,
    Dialogue,
    KpiArea,
    Measurement,
    Organisation,
    Question,
    Status,
    StatusFraga,
    Statusrapport,
    Submission,
)
from app.schemas import EkonomiImport
from app.routers.dialogues import get_dialogue
from app.services.ekonomi_import import csv_to_payload, import_ekonomi
from tests.test_ekonomi_import import export


@compiles(JSONB, "sqlite")
def sqlite_json(_type, compiler, **kwargs):
    return "JSON"


@pytest.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
        await connection.execute(text("INSERT INTO alembic_version VALUES ('a6d1e2f3a746')"))
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
    await engine.dispose()


async def snapshot(db):
    """Jämför lagrade fält i samtliga tabeller, inklusive JSON och historik."""
    return {
        table.name: (await db.execute(select(table).order_by(table.c.id))).all()
        for table in Base.metadata.sorted_tables
    }


async def test_empty_database_gets_reference_data_and_dialogues_without_measurements(db):
    assert await seed.seed(db) is True
    organisations = (await db.scalars(select(Organisation))).all()
    areas = (await db.scalars(select(KpiArea))).all()
    assert len(organisations) == 11
    assert {area.key for area in areas} == {
        "ekonomi", "hme", "sjukfranvaro", "verksamhet", "digital", "kommunikativt",
    }
    assert len((await db.scalars(select(Dialogue))).all()) == 11
    assert (await db.scalars(select(Measurement))).all() == []
    assert await db.scalar(select(StatusFraga.id)) is not None
    assert await db.scalar(select(Statusrapport.id)) is not None
    assert await db.scalar(text("SELECT version_num FROM alembic_version")) == "a6d1e2f3a746"
    dialogue_id = await db.scalar(select(Dialogue.id))
    detail = await get_dialogue(dialogue_id, db)
    assert len(detail.areas) == 6
    assert all(area.measurement is None and area.area.questions for area in detail.areas)
    questions = (await db.scalars(select(Question))).all()
    for org in organisations:
        specific_areas = {
            q.kpi_area_id for q in questions if q.organisation_id == org.id
        }
        assert specific_areas == (
            {area.id for area in areas if area.key in {"ekonomi", "sjukfranvaro"}}
            if org.kod in {"14", "4705"} else set()
        )


async def test_rerun_preserves_imports_edits_custom_organisations_and_history(db):
    await seed.seed(db)
    await import_ekonomi(db, EkonomiImport(**csv_to_payload(export("2026-06-30", -130))))
    org = await db.scalar(select(Organisation).where(Organisation.kod == "23"))
    org.namn = "Redigerad verksamhet"
    org.slug = "redigerad-verksamhet"
    org.ar_forvaltning = False
    # Den gamla seeden tog bort organisationer utanför mallfilen och deras dialogdata.
    org.kod = "99999"
    question = await db.scalar(select(Question))
    question.text = "Redigerad dialogfråga"
    area = await db.scalar(select(KpiArea).where(KpiArea.key == "digital"))
    area.info = "Redigerad beskrivning"
    dialogue = await db.scalar(select(Dialogue).where(Dialogue.organisation_id == org.id))
    dialogue.period = "Beslutad period"
    db.add_all([
        Activity(dialogue_id=dialogue.id, kpi_area_id=area.id, text="Följ upp resultat",
                 klar=True, klar_notering="Genomfört"),
        AreaStatus(dialogue_id=dialogue.id, kpi_area_id=area.id,
                   status=Status.warn, kommentar="Manuell bedömning"),
        AreaStatus(dialogue_id=dialogue.id, kpi_area_id=area.id,
                   status=Status.good, kommentar="Senare bedömning"),
        # Äldre mätdata för ett dialogområde får inte rensas vid återkörning.
        Measurement(dialogue_id=dialogue.id, kpi_area_id=area.id,
                    value_text="Lagrad uppgift", target_text="Mål", target_num=100,
                    trend_text="", interpretation="Bevaras", details={"källa": "test"}),
        Submission(text="Öppen fråga från verksamheten"),
    ])
    card = await db.scalar(select(StatusFraga))
    card.fraga, card.svar = "Redigerad statusfråga", "Besvarad"
    report = await db.scalar(select(Statusrapport))
    report.text = "Redigerad rapport"
    await db.commit()
    before = await snapshot(db)
    await db.commit()
    assert await seed.seed(db) is False
    assert await seed.seed(db) is False
    assert await snapshot(db) == before


async def test_deleted_content_is_not_recreated_in_used_database(db):
    await seed.seed(db)
    for model in (StatusFraga, Statusrapport, Question):
        await db.execute(delete(model))
    await db.commit()
    before = await snapshot(db)
    await db.commit()
    assert await seed.seed(db) is False
    assert await snapshot(db) == before


@pytest.mark.parametrize("existing", ["submission", "status_fraga", "statusrapport"])
async def test_partial_database_is_left_untouched(db, existing, monkeypatch, tmp_path):
    records = {
        "submission": Submission(text="Öppen fråga"),
        "status_fraga": StatusFraga(nummer=1, fraga="Befintlig fråga"),
        "statusrapport": Statusrapport(datum="2026-09-14", rubrik="Status", text="Befintlig"),
    }
    db.add(records[existing])
    await db.commit()
    before = await snapshot(db)
    await db.commit()
    # Ingen mall behöver läsas om det redan finns data.
    monkeypatch.setattr(seed, "ORG_MASTER_PATH", tmp_path / "missing.json")
    assert await seed.seed(db) is False
    assert await snapshot(db) == before


async def test_failed_initialisation_rolls_back_all_tables_and_can_be_retried(
    db, monkeypatch, tmp_path
):
    original_master = seed.ORG_MASTER_PATH
    invalid_master = tmp_path / "organisationer.json"
    invalid_master.write_text(json.dumps({"organisationer": [
        {"orgId": 23, "namn": "Testförvaltning"},
        {"orgId": 23, "namn": "Dubbel organisationskod"},
    ]}), encoding="utf-8")
    monkeypatch.setattr(seed, "ORG_MASTER_PATH", invalid_master)
    with pytest.raises(IntegrityError):
        await seed.seed(db)
    assert all(not rows for rows in (await snapshot(db)).values())
    await db.commit()
    monkeypatch.setattr(seed, "ORG_MASTER_PATH", original_master)
    assert await seed.seed(db) is True
