"""Idempotent seed med fiktiv dummydata (motsvarar prototypen).

Körs i entrypoint efter migrationer. Säker att köra om och om — kontrollerar
existens på naturliga nycklar innan rader skapas. ENDAST fiktiv, öppen information.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models import (
    Dialogue,
    KpiArea,
    Measurement,
    Organisation,
    Person,
    Question,
    Status,
    SupportFunction,
    Tool,
    TrendDir,
)

# Stödfunktioner + verktygslåda (key, namn, ikon, [verktyg]).
SUPPORT_FUNCTIONS: list[tuple[str, str, str, list[str]]] = [
    ("Ekonomi", "Ekonomi", "landmark", [
        "Budgetprocess", "Styrmodell", "Redovisning", "Fakturahantering",
        "Delrapport & uppföljning", "Planeringsförutsättningar", "Controller",
    ]),
    ("HR", "HR", "users", [
        "HR-partner", "Företagshälsovård", "AG-riktlinjer", "Ledarutbildning",
        "Riktlinjer & stödmaterial", "Lön/Pension", "Rekrytering/Bemanning",
    ]),
    ("Kommunikation", "Kommunikation", "megaphone", [
        "Stöd i mediakontakter", "Sociala medier", "Kommunikationsstöd",
        "Tillgänglighetsanpassning", "Varumärke", "Kommunikationsplan", "Kampanjer",
    ]),
    ("Verksamhet", "Verksamhet", "target", [
        "Resultat", "Kundnöjdhet", "Roll", "Verksamhetsutveckling",
        "Måluppfyllelse", "Public 360", "MRP",
    ]),
    ("Digitalisering", "Digitalisering", "cpu", [
        "Digital strategi", "E-tjänster", "Systemförvaltning", "Informationssäkerhet",
        "Dataskydd (GDPR)", "Automatisering", "IT-stöd",
    ]),
]

# KPI-områden (key, namn, short, ikon, lower_better, support-key, frågor).
KPI_AREAS: list[dict] = [
    {
        "key": "ekonomi", "namn": "Ekonomi", "short": None, "ikon": "landmark",
        "lower_better": False, "support": "Ekonomi",
        "questions": [
            "Vad förklarar nuläget mot budget och prognos?",
            "Vilka åtgärder är beslutade — och när får de effekt?",
            "Var finns den största osäkerheten framåt?",
        ],
    },
    {
        "key": "hme", "namn": "Hållbart medarbetarengagemang", "short": "HME", "ikon": "users",
        "lower_better": False, "support": "HR",
        "questions": [
            "Vad driver engagemanget på enheten just nu?",
            "Hur följs medarbetarsamtalen upp i praktiken?",
            "Finns tidiga signaler att bevaka inför nästa mätning?",
        ],
    },
    {
        "key": "sjukfranvaro", "namn": "Sjukfrånvaro", "short": None, "ikon": "heart-pulse",
        "lower_better": True, "support": "HR",
        "questions": [
            "Är det kort- eller långtidsfrånvaro som ökar?",
            "Vilka rehab- och förebyggande insatser pågår?",
            "Behövs stöd från HR-partner eller företagshälsovård?",
        ],
    },
    {
        "key": "kommunikativt", "namn": "Kommunikativt ledarskap", "short": None, "ikon": "megaphone",
        "lower_better": False, "support": "Kommunikation",
        "questions": [
            "Hur når budskapen ut i organisationen?",
            "Vilken återkoppling får du från medarbetarna?",
            "Vad vill du stärka till nästa mätning?",
        ],
    },
    {
        "key": "verksamhet", "namn": "Verksamhet", "short": None, "ikon": "target",
        "lower_better": False, "support": "Verksamhet",
        "questions": [
            "Hur ligger ni mot uppsatta verksamhetsmål?",
            "Vad säger kundnöjdheten just nu?",
            "Vilken utveckling prioriterar du framåt?",
        ],
    },
    {
        "key": "digital", "namn": "Digital transformation", "short": None, "ikon": "cpu",
        "lower_better": False, "support": "Digitalisering",
        "questions": [
            "Vilka digitala initiativ pågår – och vilken nytta ger de?",
            "Hur tas medarbetarna med i förändringen?",
            "Var finns hindren: kompetens, system eller resurser?",
        ],
    },
]

# Mätvärden för exempeldialogen (per område-key).
MEASUREMENTS: dict[str, dict] = {
    "ekonomi": {
        "value_text": "72", "value_num": 72, "unit": "index", "target_text": "≥ 75",
        "target_num": 75, "bar_max": 100, "status": Status.warn,
        "trend_dir": TrendDir.up, "trend_good": True, "trend_text": "+3 sedan T3",
        "interpretation": "Strax under mål, men i positiv riktning. Håll i de åtgärder som börjat ge effekt.",
    },
    "hme": {
        "value_text": "77", "value_num": 77, "unit": "index", "target_text": "≥ 75",
        "target_num": 75, "bar_max": 100, "status": Status.good,
        "trend_dir": TrendDir.up, "trend_good": True, "trend_text": "+2 sedan T3",
        "interpretation": "Över mål och stigande. Lyft fram vad som fungerar så att det går att upprepa.",
    },
    "sjukfranvaro": {
        "value_text": "6,6 %", "value_num": 6.6, "unit": "", "target_text": "≤ 5,5 %",
        "target_num": 5.5, "bar_max": 10, "status": Status.alert,
        "trend_dir": TrendDir.up, "trend_good": False, "trend_text": "+0,8 p.e. sedan T3",
        "interpretation": "Över mål och ökande. Området behöver konkreta åtgärder och tätare uppföljning.",
    },
    "kommunikativt": {
        "value_text": "71", "value_num": 71, "unit": "index", "target_text": "≥ 75",
        "target_num": 75, "bar_max": 100, "status": Status.warn,
        "trend_dir": TrendDir.up, "trend_good": True, "trend_text": "+1 sedan T3",
        "interpretation": "Under mål, svagt stigande. Tydliggör budskap och vilka kanaler som når fram.",
    },
    "verksamhet": {
        "value_text": "62", "value_num": 62, "unit": "index", "target_text": "≥ 70",
        "target_num": 70, "bar_max": 100, "status": Status.warn,
        "trend_dir": TrendDir.down, "trend_good": False, "trend_text": "−2 sedan T3",
        "interpretation": "Under mål och vikande. Prioritera utvecklingsinsatser där effekten blir störst.",
    },
    "digital": {
        "value_text": "58", "value_num": 58, "unit": "index", "target_text": "≥ 70",
        "target_num": 70, "bar_max": 100, "status": Status.warn,
        "trend_dir": TrendDir.up, "trend_good": True, "trend_text": "+4 sedan T3",
        "interpretation": "I ett tidigt skede men på rätt väg. Säkra förflyttningen från pilot till bred användning.",
    },
}

ORG_SLUG = "kommunstyrelsekontoret"
PERSON_NAMN = "Lennart Andersson"
DIALOGUE_PERIOD = "Tertial 1 · 2026"


async def _get_or_create(session: AsyncSession, model, defaults: dict | None = None, **filters):
    """Hämta rad på filters eller skapa den. Returnerar (objekt, skapad?)."""
    existing = (await session.execute(select(model).filter_by(**filters))).scalar_one_or_none()
    if existing is not None:
        return existing, False
    obj = model(**{**filters, **(defaults or {})})
    session.add(obj)
    await session.flush()
    return obj, True


async def seed(session: AsyncSession) -> None:
    # Stödfunktioner + verktyg.
    support_by_key: dict[str, SupportFunction] = {}
    for key, namn, ikon, tools in SUPPORT_FUNCTIONS:
        sf, _ = await _get_or_create(
            session, SupportFunction, {"namn": namn, "ikon": ikon}, key=key
        )
        support_by_key[key] = sf
        for ordning, tool_namn in enumerate(tools):
            await _get_or_create(
                session, Tool, {"ordning": ordning},
                support_function_id=sf.id, namn=tool_namn,
            )

    # KPI-områden + frågor.
    area_by_key: dict[str, KpiArea] = {}
    for ordning, a in enumerate(KPI_AREAS):
        area, _ = await _get_or_create(
            session, KpiArea,
            {
                "namn": a["namn"], "short": a["short"], "ikon": a["ikon"],
                "lower_better": a["lower_better"], "ordning": ordning,
                "support_function_id": support_by_key[a["support"]].id,
            },
            key=a["key"],
        )
        area_by_key[a["key"]] = area
        for q_ordning, text in enumerate(a["questions"]):
            await _get_or_create(
                session, Question, {"ordning": q_ordning},
                kpi_area_id=area.id, text=text,
            )

    # Organisation + ansvarig chef (fiktiv).
    org, _ = await _get_or_create(
        session, Organisation, {"namn": "Kommunstyrelsekontoret"}, slug=ORG_SLUG
    )
    person, _ = await _get_or_create(
        session, Person,
        {"roll": "Förvaltningschef", "initialer": "LA"},
        namn=PERSON_NAMN,
    )

    # Exempeldialog.
    dialogue, _ = await _get_or_create(
        session, Dialogue,
        {"status": "pagaende"},
        organisation_id=org.id, ansvarig_chef_id=person.id, period=DIALOGUE_PERIOD,
    )

    # Mätvärden per område.
    for key, data in MEASUREMENTS.items():
        await _get_or_create(
            session, Measurement, data,
            dialogue_id=dialogue.id, kpi_area_id=area_by_key[key].id,
        )

    await session.commit()


async def main() -> None:
    async with SessionLocal() as session:
        await seed(session)
    print("[seed] klart — fiktiv dummydata på plats (idempotent).")


if __name__ == "__main__":
    asyncio.run(main())
