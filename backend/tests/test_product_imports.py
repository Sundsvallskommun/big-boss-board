"""Beteendeprov för importer och publika dialogkontrakt, utan en server eller externa data.

SQLite verifierar upsert/läsflöden. PostgreSQL-migrationer verifieras separat som SQL.
"""
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.db import Base
from app.models import Dialogue, KpiArea, Measurement, Organisation, Person, Question, SupportFunction
from app.routers.dialogues import get_dialogue
from app.schemas import EkonomiImport, ExportFil, HmeImport, MeasurementOut, SjukImport, StatusrapportCreate
from app.services.ekonomi_import import csv_to_payload, import_ekonomi
from app.services.hme_import import import_hme, report_to_payload
from app.services.sjukfranvaro_import import csv_to_payload as sjuk_payload, filer_to_payload, import_sjukfranvaro
from app.services.status_content import create_rapport, list_published
from tests.test_ekonomi_import import export


@compiles(JSONB, "sqlite")
def sqlite_json(_type, compiler, **kwargs):
    return "JSON"


@pytest.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        session.add_all([
            Organisation(id=1, kod="23", namn="Testförvaltning", slug="test"),
            Organisation(id=2, kod="14", namn="Testförbund", slug="forbund", ar_forvaltning=False),
            Person(id=1, namn="Testfunktion", roll="Testroll", initialer="TF"),
            SupportFunction(id=1, key="test", namn="Teststöd", ikon="test"),
        ])
        await session.flush()
        session.add_all([
            KpiArea(id=i, key=key, namn=key, ikon="test", lower_better=False, ordning=i, support_function_id=1)
            for i, key in enumerate(["ekonomi", "hme", "sjukfranvaro"], 1)
        ])
        session.add_all([Dialogue(id=i, organisation_id=i, ansvarig_chef_id=1, period="Testperiod") for i in (1, 2)])
        await session.commit()
        yield session
    await engine.dispose()


async def test_economy_older_upload_preserves_current_value_and_idempotence(db):
    await import_ekonomi(db, EkonomiImport(**csv_to_payload(export("2026-06-30", -130))))
    await import_ekonomi(db, EkonomiImport(**csv_to_payload(export("2026-04-30", -100))))
    await import_ekonomi(db, EkonomiImport(**csv_to_payload(export("2026-04-30", -105))))
    measurements = (await db.scalars(select(Measurement))).all()
    assert len(measurements) == 1
    m = measurements[0]
    assert m.details["period"] == "2026-06-30"
    assert [p["period"] for p in m.details["serie"]] == ["2026-04-30", "2026-06-30"]
    assert m.details["serie"][0]["utfall"] == -105
    assert m.details["resultatrakning"][0]["utfall"] == -130


async def test_economy_missing_forecast_has_no_fabricated_status(db):
    payload = csv_to_payload(export().replace("K18,-1200", "K18,0"))
    result = await import_ekonomi(db, EkonomiImport(**payload))
    assert result["enheter"][0]["status"] is None
    detail = await get_dialogue(1, db)
    m = detail.areas[0].measurement
    assert m.value_num is None and m.status is None and m.value_text == "–"


def personnel(period, value, *, new=True, delimiter=","):
    lines = ["Period,Enhet,Mått,Kolumn,Mätvärde", f"{period},23,SK.P.SJ.001,K20,{value}"]
    if new:
        lines.append(f"{period},23,SK.P.AM.001,K9,100")
    return "\n".join(lines).replace(",", delimiter)


@pytest.mark.parametrize("delimiter", [",", "\t"])
def test_r12_export_method_and_staff_count(delimiter):
    payload = SjukImport(**sjuk_payload(personnel("2026-04-30", 7.2, delimiter=delimiter)))
    assert payload.matmetod == "rullande12"
    assert payload.enheter[0].anstallda == 100


def test_old_personnel_export_is_rejected_by_backend():
    with pytest.raises(ValueError, match="R12"):
        sjuk_payload(personnel("2026-04-30", 7.2, new=False))
    with pytest.raises(ValidationError):
        SjukImport(matmetod="tertial", enheter=[])


async def test_r12_backfill_updates_quarter_trend_without_rewinding_headline(db):
    for period, value in [("2026-07-31", 7.2), ("2026-04-30", 5.5)]:
        await import_sjukfranvaro(db, SjukImport(**sjuk_payload(personnel(period, value))))
    m = await db.scalar(select(Measurement))
    assert m.details["period"] == "2026-07-31" and m.value_num == 7.2
    assert len(m.details["serie"]) == 2
    assert m.status.value == "alert"  # +1.7 på exakt tre månader, trots nivå under 7.5.
    assert "takten" in m.interpretation


async def test_r12_does_not_mix_persisted_tertiary_history(db):
    await import_sjukfranvaro(db, SjukImport(**sjuk_payload(personnel("2026-04-30", 5))))
    m = await db.scalar(select(Measurement))
    m.details = {**m.details, "matmetod": "tertial"}
    await db.commit()
    assert MeasurementOut.model_validate(m).value_text == "Inväntar R12"
    await import_sjukfranvaro(db, SjukImport(**sjuk_payload(personnel("2026-07-31", 7))))
    assert [p["period"] for p in m.details["serie"]] == ["2026-07-31"]
    assert m.trend_dir is None


def test_multiple_personnel_exports_preserve_multimonth_history():
    files = [
        ExportFil(namn="personal_2026-08-01.csv", text=personnel("2026-04-30", 5) + "\n2026-07-31,23,SK.P.SJ.001,K20,6"),
        ExportFil(namn="personal_2026-08-09.csv", text=personnel("2026-07-31", 7)),
    ]
    series = filer_to_payload(files)["enheter"][0]["serie"]
    assert [(p["period"], p["total"]) for p in series] == [("2026-04-30", 5), ("2026-07-31", 7)]


async def test_hme_perspectives_survive_later_total_only_import(db):
    report = {"dimensioner": {"Enhet": [{"grupp": "Testförvaltning", "orgId": 23, "matningar": {"2025": 80}}]}}
    perspectives = {"perspektiv": {"Motivation": [{"grupp": "Testförvaltning", "matningar": {"2023": 72, "2025": 81}}]}}
    await import_hme(db, HmeImport(**report_to_payload(report, delindex=perspectives)))
    await import_hme(db, HmeImport(**report_to_payload(report)))
    m = await db.scalar(select(Measurement))
    assert m.details["perspektiv"]["motivation"] == {"2023": 72, "2025": 81}


async def test_organisation_questions_replace_only_their_own_area(db):
    db.add_all([
        Question(kpi_area_id=1, text="Allmän ekonomifråga", ordning=0),
        Question(kpi_area_id=1, organisation_id=2, text="Förbundets fråga", rubrik="Prognos", ordning=0),
        Question(kpi_area_id=2, text="Allmän HME-fråga", bygger_pa="Enkätpåstående", ordning=0),
    ])
    await db.commit()
    forbund = await get_dialogue(2, db)
    forvaltning = await get_dialogue(1, db)
    assert not forbund.organisation.ar_forvaltning
    assert [q.text for q in forbund.areas[0].area.questions] == ["Förbundets fråga"]
    assert forbund.areas[1].area.questions[0].bygger_pa == "Enkätpåstående"
    assert [q.text for q in forvaltning.areas[0].area.questions] == ["Allmän ekonomifråga"]


async def test_published_report_includes_remaining_activities(db):
    await create_rapport(db, StatusrapportCreate(datum="2026-09-09", rubrik="Teststatus", text="Test", aterstaende=["Följ upp"] ))
    result = await list_published(db)
    assert result["rapporter"][0].aterstaende == ["Följ upp"]


async def test_import_http_contract_keeps_token_auth_and_accepts_hme_reports(db, monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.db import get_session
    from app.config import get_settings
    monkeypatch.setenv("IMPORT_TOKEN", "test-import-token")
    get_settings.cache_clear()

    async def database():
        yield db

    app.dependency_overrides[get_session] = database
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            body = {"rapport": {"dimensioner": {"Enhet": [{"grupp": "Testförvaltning", "orgId": 23, "matningar": {"2025": 80}}]}}}
            denied = await client.post("/api/import/hme-rapport", json=body)
            assert denied.status_code == 401
            accepted = await client.post("/api/import/hme-rapport", json=body, headers={"Authorization": "Bearer test-import-token"})
            assert accepted.status_code == 200
            assert accepted.json()["skapade"] == 1
            old = await client.post("/api/import/sjukfranvaro-csv", content=personnel("2026-04-30", 5, new=False), headers={"Authorization": "Bearer test-import-token"})
            assert old.status_code == 400 and "R12" in old.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_session, None)


async def test_seed_can_restart_with_old_personnel_file_without_importing_it(db, monkeypatch, tmp_path, capsys):
    from app import seed as seed_module
    for name in ["HME_REPORT_PATH", "HME_DELINDEX_PATH", "EKONOMI_CSV_PATH", "EKONOMI_REPORT_PATH"]:
        monkeypatch.setattr(seed_module, name, tmp_path / "missing")
    old = tmp_path / "old.csv"
    old.write_text(personnel("2026-04-30", 5, new=False))
    monkeypatch.setattr(seed_module, "SJUK_CSV_PATH", old)
    await seed_module.seed(db)
    await seed_module.seed(db)
    assert "Importera nytt R12-underlag" in capsys.readouterr().out
    for org in (await db.scalars(select(Organisation))).all():
        if org.kod in ("14", "4705"):
            assert not org.ar_forvaltning


async def test_backfill_of_pre_upgrade_measurement_keeps_headline_point_and_projects_result(db):
    await import_ekonomi(db, EkonomiImport(**csv_to_payload(export("2026-06-30").replace("K18,-1200", "K18,-1300"))))
    m = await db.scalar(select(Measurement))
    from app.models import Status
    m.details = {**m.details, "serie": []}  # Persisted shape before series-preserving imports.
    m.value_text, m.value_num, m.status = "Gammalt ackumulerat värde", 100, Status.good
    await db.commit()
    result = await import_ekonomi(db, EkonomiImport(**csv_to_payload(export("2026-04-30"))))
    assert [p["period"] for p in m.details["serie"]] == ["2026-04-30", "2026-06-30"]
    assert result["enheter"][0]["value"] == "−100 mnkr"
    assert result["enheter"][0]["status"] == "alert"


@pytest.fixture
async def import_client(db, monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.db import get_session
    from app.config import get_settings
    monkeypatch.setenv("IMPORT_TOKEN", "test-import-token")
    get_settings.cache_clear()

    async def database():
        yield db

    app.dependency_overrides[get_session] = database
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                               headers={"Authorization": "Bearer test-import-token"}) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_session, None)
        get_settings.cache_clear()


async def test_file_uploads_merge_history_and_keep_newest_headline(import_client, db):
    for period, value in [("2026-06-30", -130), ("2026-04-30", -100), ("2026-04-30", -105)]:
        response = await import_client.post("/api/import/ekonomi-filer", json={"filer": [
            {"namn": "ekonomi.csv", "text": export(period, value)},
        ]})
        assert response.status_code == 200
    m = await db.scalar(select(Measurement))
    assert m.details["period"] == "2026-06-30"
    assert [(p["period"], p["utfall"]) for p in m.details["serie"]] == [
        ("2026-04-30", -105), ("2026-06-30", -130),
    ]
    # The separately documented explicit replacement endpoint still replaces.
    response = await import_client.post("/api/import/ekonomi-serie", json={"perioder": [export()]})
    assert response.status_code == 200
    assert len(m.details["serie"]) == 1


def test_multi_period_economy_retains_organisations_missing_from_last_file():
    from app.services.ekonomi_import import csvs_to_serie_payload
    from app.schemas import EkonomiImport
    april = export().replace(',23,', ',25,')
    payload = EkonomiImport(**csvs_to_serie_payload([april, export("2026-06-30")]))
    assert {e.kod: e.period for e in payload.enheter} == {"25": "2026-04-30", "23": "2026-06-30"}


@pytest.mark.parametrize("report", [
    {"dimensioner": []},
    {"dimensioner": {"Enhet": ["invalid"]}},
    {"dimensioner": {"Enhet": [{"grupp": "test", "matningar": None}]}},
    {"dimensioner": {"Enhet": [{"grupp": "test", "matningar": {"invalid": 70}}]}},
])
async def test_malformed_hme_is_a_client_error(import_client, report):
    response = await import_client.post("/api/import/hme-rapport", json={"rapport": report})
    assert response.status_code == 400


async def test_hme_suppressed_unit_does_not_abort_valid_units(import_client):
    report = {"dimensioner": {"Enhet": [
        {"grupp": "Testförbund", "orgId": 14, "matningar": {"2025": None}},
        {"grupp": "Testförvaltning", "orgId": 23, "matningar": {"2025": 80}},
    ]}}
    response = await import_client.post("/api/import/hme-rapport", json={"rapport": report})
    assert response.status_code == 200
    assert response.json()["skapade"] == 1
    assert response.json()["hoppade_over"] == 1


@pytest.mark.parametrize("bad_value", ["NaN", "Infinity", "felskrivet"])
async def test_non_numeric_import_cannot_poison_stored_data(import_client, db, bad_value):
    for path, content in [
        ("ekonomi-csv", export().replace("K18,-1200", f"K18,{bad_value}")),
        ("sjukfranvaro-csv", personnel("2026-07-31", bad_value)),
    ]:
        response = await import_client.post(f"/api/import/{path}", content=content)
        assert response.status_code == 400
    assert await db.scalar(select(Measurement)) is None


def test_staff_only_newer_period_does_not_hide_last_sickness_measurement():
    payload = sjuk_payload(personnel("2026-06-30", 7) + "\n2026-07-31,23,SK.P.AM.001,K9,110")
    e = payload["enheter"][0]
    assert e["period"] == "2026-06-30" and e["total"] == 7
    assert len(e["serie"]) == 1


async def test_normalized_sickness_import_preserves_headline_in_series(db):
    for period, total in [("2026-07-31", 7.2), ("2026-04-30", 5.5)]:
        await import_sjukfranvaro(db, SjukImport(period=period, matmetod="rullande12", enheter=[{
            "kod": "23", "namn": "Test", "period": period, "total": total,
        }]))
    m = await db.scalar(select(Measurement))
    assert m.value_num == 7.2 and m.status.value == "alert"
    assert [p["period"] for p in m.details["serie"]] == ["2026-04-30", "2026-07-31"]


def test_hme_cli_posts_total_and_perspectives(tmp_path, monkeypatch):
    import importlib.util
    import io
    import json
    from pathlib import Path
    spec = importlib.util.spec_from_file_location("hme_cli", Path(__file__).parents[2] / "scripts/import_hme.py")
    cli = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli)
    total = tmp_path / "total.json"
    total.write_text('\ufeff{"dimensioner": {"Enhet": []}}', encoding="utf-8")
    perspectives = tmp_path / "perspectives.json"
    perspectives.write_text('{"perspektiv": {}}')
    monkeypatch.setattr("sys.argv", ["import_hme.py", "--file", str(total), "--delindex", str(perspectives), "--token", "test"])
    sent = []

    def post(request, timeout):
        sent.append(json.loads(request.data))
        assert request.full_url.endswith("/api/import/hme-rapport")
        return io.BytesIO(b'{"skapade":0,"uppdaterade":0,"forvaltningar":[]}')

    monkeypatch.setattr(cli.urllib.request, "urlopen", post)
    cli.main()
    assert sent == [{"rapport": {"dimensioner": {"Enhet": []}}, "delindex": {"perspektiv": {}}}]


async def test_invalid_report_period_and_encoding_return_client_errors(import_client):
    response = await import_client.post("/api/import/ekonomi", json={"dataset": {"period": "fel"}, "poster": []})
    assert response.status_code == 400
    for path in ("ekonomi-csv", "sjukfranvaro-csv"):
        response = await import_client.post(f"/api/import/{path}", content=b'\xff')
        assert response.status_code == 400
