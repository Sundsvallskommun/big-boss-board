"""Idempotent seed med fiktiv dummydata (motsvarar prototypen).

Körs i entrypoint efter migrationer. Säker att köra om och om — kontrollerar
existens på naturliga nycklar innan rader skapas. ENDAST fiktiv, öppen information.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models import KpiArea, Organisation, Question, SupportFunction, Tool
from app.schemas import EkonomiImport, HmeImport, SjukImport
from app.services.ekonomi_import import csv_to_payload as ekonomi_csv_to_payload
from app.services.ekonomi_import import import_ekonomi
from app.services.ekonomi_import import report_to_payload as ekonomi_report_to_payload
from app.services.hme_import import import_hme, report_to_payload
from app.services.sjukfranvaro_import import csv_to_payload as sjuk_csv_to_payload
from app.services.sjukfranvaro_import import import_sjukfranvaro

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

# Officiella HME-totalindexrapporten (flerårig, per enhet/förvaltning). Levereras utanför
# git och monteras lokalt/vid deploy; i drift uppdateras HME istället via /api/import/hme.
HME_REPORT_PATH = Path(__file__).resolve().parent / "data" / "hme_totalindex.json"

# Ekonomirapporten (resultaträkning per förvaltning) levereras utanför git, samma väg som HME.
# Qlik-exporten är CSV framåt; JSON stöds som tidigare format. CSV prioriteras om båda finns.
EKONOMI_CSV_PATH = Path(__file__).resolve().parent / "data" / "ekonomi.csv"
EKONOMI_REPORT_PATH = Path(__file__).resolve().parent / "data" / "ekonomi.json"

# Sjukfrånvaro (personal-CSV från Qlik) — levereras utanför git, samma väg.
SJUK_CSV_PATH = Path(__file__).resolve().parent / "data" / "sjukfranvaro.csv"

# Masterdata-organisationsid → org-slug (de slugar HME redan skapat). Sätter Organisation.kod
# så att ekonomi (och framtida dataset) kan kopplas på koden. Räddningstjänsten/Stadsbacken
# saknas i masterdatan här och får därför ingen kod ännu.
KOD_TILL_SLUG: dict[str, str] = {
    "24": "barn-och-utbildningsforvaltning",
    "23": "vard-och-omsorgsforvaltningen",
    "31": "individ-och-arbetsmarknadsforvaltning",
    "28": "kommunstyrelsekontoret",
    "30": "kultur-och-fritid",
    "26": "stadsbyggnadskontoret",
    "25": "miljokontoret",
    "29": "overformyndarkontoret",
    "27": "lantmaterikontoret",
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

    await session.commit()

    # HME-rapporten levereras utanför git (monteras lokalt/vid deploy). Finns den
    # importeras förvaltningsdialogerna via samma väg som /api/import/hme. Saknas den
    # kör appen vidare med enbart referensdata (väljaren visar tomt läge) — i drift
    # fylls HME på via import-endpointen.
    if HME_REPORT_PATH.exists():
        report = json.loads(HME_REPORT_PATH.read_text(encoding="utf-8"))
        payload = HmeImport(**report_to_payload(report))
        resultat = await import_hme(session, payload)
        print(
            f"[seed] HME importerad ur {HME_REPORT_PATH.name}: "
            f"{resultat['skapade']} skapade, {resultat['uppdaterade']} uppdaterade."
        )
    else:
        print(
            f"[seed] {HME_REPORT_PATH.name} saknas — hoppar över HME-import "
            "(importera via /api/import/hme)."
        )

    # Sätt masterdata-kod på förvaltningsorganisationerna (kanonisk nyckel som dataset kopplar mot).
    # Körs alltid (även utan HME-fil) så att redan seedade orgs får sin kod och ekonomi kan kopplas.
    for kod, slug in KOD_TILL_SLUG.items():
        org = (await session.execute(select(Organisation).filter_by(slug=slug))).scalar_one_or_none()
        if org is not None and org.kod != kod:
            org.kod = kod
    await session.commit()

    # Ekonomirapporten levereras utanför git (samma som HME). Finns den importeras ekonomidata
    # per förvaltning via samma väg som /api/import/ekonomi (matchar på masterdata-koden).
    ek = kalla = None
    if EKONOMI_CSV_PATH.exists():
        text = EKONOMI_CSV_PATH.read_text(encoding="utf-8-sig")
        ek = await import_ekonomi(session, EkonomiImport(**ekonomi_csv_to_payload(text)))
        kalla = EKONOMI_CSV_PATH.name
    elif EKONOMI_REPORT_PATH.exists():
        rapport = json.loads(EKONOMI_REPORT_PATH.read_text(encoding="utf-8"))
        ek = await import_ekonomi(session, EkonomiImport(**ekonomi_report_to_payload(rapport)))
        kalla = EKONOMI_REPORT_PATH.name

    if ek is not None:
        print(
            f"[seed] Ekonomi importerad ur {kalla}: "
            f"{ek['skapade']} skapade, {ek['uppdaterade']} uppdaterade, {ek['hoppade_over']} hoppade över."
        )
    else:
        print("[seed] ingen ekonomifil (ekonomi.csv/ekonomi.json) — hoppar över ekonomidata.")

    # Sjukfrånvaro (personal-CSV). Finns den importeras den per förvaltning (matchar på kod).
    if SJUK_CSV_PATH.exists():
        sj = await import_sjukfranvaro(
            session, SjukImport(**sjuk_csv_to_payload(SJUK_CSV_PATH.read_text(encoding="utf-8-sig")))
        )
        print(
            f"[seed] Sjukfrånvaro importerad ur {SJUK_CSV_PATH.name}: "
            f"{sj['skapade']} skapade, {sj['uppdaterade']} uppdaterade, {sj['hoppade_over']} hoppade över."
        )
    else:
        print(f"[seed] {SJUK_CSV_PATH.name} saknas — hoppar över sjukfrånvarodata.")


async def main() -> None:
    async with SessionLocal() as session:
        await seed(session)
    print("[seed] klart (idempotent).")


if __name__ == "__main__":
    asyncio.run(main())
