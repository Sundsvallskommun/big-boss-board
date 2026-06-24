"""Idempotent seed med fiktiv dummydata (motsvarar prototypen).

Körs i entrypoint efter migrationer. Säker att köra om och om — kontrollerar
existens på naturliga nycklar innan rader skapas. ENDAST fiktiv, öppen information.
"""

from __future__ import annotations

import asyncio
import json
import re
import unicodedata
from pathlib import Path

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
        "info": (
            "Ekonominyckeltalen uppdateras den 7:e varje månad (i januari dröjer det längre, "
            "normalt till den 15:e eller senare). Vid uppdateringen läses all ekonomidata in "
            "med brytdatum föregående månad, och data fylls på löpande under månaden. Helheten "
            "för en månad syns därför först en bit in i nästa — hela maj går till exempel att se "
            "först runt den 8–10 juni, och dessförinnan är bilden ofullständig."
        ),
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
        "info": (
            "Lönekörning sker en gång per månad, runt den 20:e, och då genereras "
            "sjukfrånvarostatistiken för den senaste perioden. Sjukfrånvaro som medarbetare "
            "ännu inte registrerat, eller som chef inte hunnit godkänna/attestera före "
            "lönekörningen, kommer inte med. Eftersom lönekörningen sker den 20:e missas "
            "omkring 10 av månadens cirka 30 dagar — den senaste månaden visar därför "
            "erfarenhetsmässigt bara runt 70–80 % av den slutliga bilden och ser nästan "
            "alltid bättre ut än verkligheten. Tillförlitlig statistik finns först när ett "
            "par månader gått och all registrering kommit med."
        ),
        "questions": [
            "Är det kort- eller långtidsfrånvaro som ökar?",
            "Vilka rehab- och förebyggande insatser pågår?",
            "Behövs stöd från HR-partner eller företagshälsovård?",
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

# Fiktiva mätvärden för de KPI:er som ännu saknar riktig datakälla (per område-key).
# HME byggs istället ur riktig data (se _hme_measurement) och finns medvetet inte här.
MEASUREMENTS: dict[str, dict] = {
    "ekonomi": {
        "value_text": "72", "value_num": 72, "unit": "index", "target_text": "≥ 75",
        "target_num": 75, "bar_max": 100, "status": Status.warn,
        "trend_dir": TrendDir.up, "trend_good": True, "trend_text": "+3 sedan T3",
        "interpretation": "Strax under mål, men i positiv riktning. Håll i de åtgärder som börjat ge effekt.",
    },
    "sjukfranvaro": {
        "value_text": "6,6 %", "value_num": 6.6, "unit": "", "target_text": "≤ 5,5 %",
        "target_num": 5.5, "bar_max": 10, "status": Status.alert,
        "trend_dir": TrendDir.up, "trend_good": False, "trend_text": "+0,8 p.e. sedan T3",
        "interpretation": "Över mål och ökande. Området behöver konkreta åtgärder och tätare uppföljning.",
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

# Riktig HME-2025-data per förvaltning (framräknad ur råfilen av
# scripts/build_hme_aggregate.py). Endast aggregat — inga radnivådata.
HME_DATA_PATH = Path(__file__).resolve().parent / "data" / "hme_2025.json"
HME_TARGET = 75.0


def _slugify(namn: str) -> str:
    """Slug för organisation (hanterar å/ä/ö)."""
    n = namn.lower().replace("å", "a").replace("ä", "a").replace("ö", "o")
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode()
    n = re.sub(r"[^a-z0-9]+", "-", n).strip("-")
    return n


def _hme_status(value: float) -> Status:
    """HME-status mot målet ≥ 75 (warn-band 70–74,9, alert < 70)."""
    if value >= HME_TARGET:
        return Status.good
    if value >= HME_TARGET - 5:
        return Status.warn
    return Status.alert


def _hme_interpretation(status: Status) -> str:
    return {
        Status.good: "Över mål. Lyft fram vad som fungerar så att det går att upprepa.",
        Status.warn: "Nära mål. Bevaka utvecklingen och håll i pågående insatser.",
        Status.alert: "Under mål. Området behöver konkreta åtgärder och tätare uppföljning.",
    }[status]


def _hme_measurement(forv: dict) -> dict:
    """Bygg mätvärdesfält för HME ur en förvaltningspost i aggregatfilen."""
    value = float(forv["hme_total"])
    status = _hme_status(value)
    return {
        "value_text": f"{value:.1f}".replace(".", ","),
        "value_num": value,
        "unit": "index",
        "target_text": "≥ 75",
        "target_num": HME_TARGET,
        "bar_max": 100.0,
        "status": status,
        "trend_dir": None,
        "trend_good": None,
        "trend_text": "Inget jämförelseår (endast 2025)",
        "interpretation": _hme_interpretation(status),
        "details": {
            "typ": "hme",
            "ar": forv.get("ar"),
            "n": forv["n"],
            "delindex": forv["delindex"],
            "segment": forv["segment"],
        },
    }


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
                "info": a.get("info"),
            },
            key=a["key"],
        )
        area_by_key[a["key"]] = area
        for q_ordning, text in enumerate(a["questions"]):
            await _get_or_create(
                session, Question, {"ordning": q_ordning},
                kpi_area_id=area.id, text=text,
            )

    # Gemensam, generisk ansvarig chef (anonym — inga personuppgifter).
    # HME-aggregatet levereras utanför git (monteras vid deploy). Saknas det körs
    # appen vidare med enbart referensdata — väljaren visar då tomt läge i stället
    # för att backend kraschar vid start.
    if not HME_DATA_PATH.exists():
        await session.commit()
        print(
            f"[seed] {HME_DATA_PATH.name} saknas — hoppar över förvaltningsdialoger "
            "(endast referensdata seedad). Montera datafilen för riktig HME."
        )
        return

    person, _ = await _get_or_create(
        session, Person,
        {"roll": "Ansvarig chef", "initialer": "FC"},
        namn="Förvaltningschef (exempel)",
    )

    # En dialog per förvaltning med riktig HME-data; övriga KPI:er är fiktiv dummy.
    hme = json.loads(HME_DATA_PATH.read_text(encoding="utf-8"))
    period = f"Helår {hme['ar']}"

    for forv in hme["forvaltningar"]:
        org, _ = await _get_or_create(
            session, Organisation,
            {"namn": forv["namn"]},
            slug=_slugify(forv["namn"]),
        )
        dialogue, _ = await _get_or_create(
            session, Dialogue,
            {"status": "pagaende"},
            organisation_id=org.id, ansvarig_chef_id=person.id, period=period,
        )

        for key in area_by_key:
            if key == "hme":
                data = _hme_measurement({**forv, "ar": hme["ar"]})
            else:
                data = MEASUREMENTS.get(key)
                if data is None:
                    continue
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
