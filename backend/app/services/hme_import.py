"""Import/upsert av HME-data (officiella rapportens fleråriga format).

Delad logik som både import-endpointen (`routers/import_data.py`) och seed
(`seed.py`) använder, så det bara finns EN väg in i databasen för HME.

Till skillnad från seedens `_get_or_create` *uppdaterar* importen befintliga rader
(idempotent upsert), så en ny årsmätning kan läsas in om och om igen utan dubbletter
och utan att nollställa databasen.
"""

from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Dialogue,
    KpiArea,
    Measurement,
    Organisation,
    Person,
    Status,
    TrendDir,
)
from app.schemas import HmeForvaltning, HmeImport

HME_TARGET = 75.0

# Sjukfrånvaro — tröskelvärden för färgnivåer (lägre är bättre). Styr status (och därmed
# all färgsättning: kort, mätare, fördelningsstapel). Måste hållas i synk med frontendens
# SjukfranvaroNivaer-komponent som visar samma nivåer för chefen.
SJUK_MAL = 6.0           # Grön (följa planen): ≤ 6,0 % — på eller under målet.
SJUK_GUL_TAK = 7.5       # Gul (reagera): 6,1–7,5 % — strax över målet eller stigande.
SJUK_KVARTAL_LARM = 1.5  # Röd (agera) även vid ökning > 1,5 p.e. på ett kvartal.


def sjukfranvaro_status(value: float, kvartalsokning: float | None = None) -> Status:
    """Färgnivå för sjukfrånvaro enligt fastställda tröskelvärden (lägre är bättre).

    Grön ≤ 6,0 % · Gul 6,1–7,5 % · Röd > 7,5 % eller kvartalsökning > 1,5 p.e.
    """
    if kvartalsokning is not None and kvartalsokning > SJUK_KVARTAL_LARM:
        return Status.alert
    if value <= SJUK_MAL:
        return Status.good
    if value <= SJUK_GUL_TAK:
        return Status.warn
    return Status.alert


# Fiktiva platshållarvärden för KPI:er som ännu saknar riktig källa (QlikSense, fråga #4).
# Skapas bara när en dialog nyskapas, så dashboarden är komplett tills källan finns.
FICTIV_MEASUREMENTS: dict[str, dict] = {
    "ekonomi": {
        "value_text": "72", "value_num": 72, "unit": "index", "target_text": "≥ 75",
        "target_num": 75, "bar_max": 100, "status": Status.warn,
        "trend_dir": TrendDir.up, "trend_good": True, "trend_text": "+3 sedan T3",
        "interpretation": "Strax under mål, men i positiv riktning. Håll i de åtgärder som börjat ge effekt.",
    },
    "sjukfranvaro": {
        "value_text": "6,6 %", "value_num": 6.6, "unit": "", "target_text": "≤ 6,0 %",
        "target_num": SJUK_MAL, "bar_max": 10,
        # Färgnivå sätts av tröskelvärdena: 6,6 % med +0,8 p.e./kvartal → gul (reagera).
        "status": sjukfranvaro_status(6.6, 0.8),
        "trend_dir": TrendDir.up, "trend_good": False, "trend_text": "+0,8 p.e. sedan T3",
        "interpretation": (
            "Strax över målet och svagt stigande (gul nivå – reagera). Analysera mönstret, "
            "t.ex. korttids- kontra långtidsfrånvaro, och håll tätare uppföljning."
        ),
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


def slugify(namn: str) -> str:
    """Slug för organisation (hanterar å/ä/ö)."""
    n = namn.lower().replace("å", "a").replace("ä", "a").replace("ö", "o")
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", n).strip("-")


def hme_status(value: float, target: float = HME_TARGET) -> Status:
    """HME-status mot målet (good ≥ mål, warn inom 5 p.e. under, annars alert)."""
    if value >= target:
        return Status.good
    if value >= target - 5:
        return Status.warn
    return Status.alert


def _interpretation(status: Status) -> str:
    return {
        Status.good: "Över mål. Lyft fram vad som fungerar så att det går att upprepa.",
        Status.warn: "Nära mål. Bevaka utvecklingen och håll i pågående insatser.",
        Status.alert: "Under mål. Området behöver konkreta åtgärder och tätare uppföljning.",
    }[status]


def _num(value: float) -> str:
    """Heltal utan decimal, annars svensk decimal med komma."""
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}".replace(".", ",")


def report_to_payload(
    report: dict, *, enhet: str = "index", mal: float = HME_TARGET,
    kalla: str = "HME-mätning (officiell rapport)",
) -> dict:
    """Officiella rapporten (`dimensioner.Förvaltning`) → normaliserad importpayload.

    Per-enhetsdimensionen heter "Enhet" (totalindex-filen) eller "Förvaltning"
    (äldre rapport). Ålder/Kön är koncernnivå och tas inte med.
    """
    dims = report.get("dimensioner", {})
    forv = dims.get("Enhet") or dims.get("Förvaltning") or []
    return {
        "kpi": "hme",
        "enhet": enhet,
        "mal": mal,
        "kalla": kalla,
        "forvaltningar": [
            {
                "namn": f["grupp"],
                "matningar": {str(k): v for k, v in f.get("matningar", {}).items()},
                "antal_svar": f.get("antal_svar_2025"),
            }
            for f in forv
        ],
    }


def _measurement_fields(f: HmeForvaltning, enhet: str, mal: float, kalla: str) -> dict:
    """Bygg mätvärdesfält ur en förvaltnings årsserie: senaste värde + verklig trend + historik."""
    serie = {int(y): float(v) for y, v in f.matningar.items() if v is not None}
    if not serie:
        raise ValueError(f"Förvaltningen {f.namn!r} saknar mätvärden.")
    years = sorted(serie)
    senaste = years[-1]
    value = serie[senaste]
    status = hme_status(value, mal)

    trend_dir: TrendDir | None = None
    trend_good: bool | None = None
    trend_text = "Inget jämförelseår"
    trend_meta = None
    if len(years) >= 2:
        prev = years[-2]
        diff = round(value - serie[prev], 1)
        trend_meta = {"from_ar": prev, "till_ar": senaste, "diff": diff}
        if diff > 0:
            trend_dir, trend_good = TrendDir.up, True
            trend_text = f"+{_num(diff)} sedan {prev}"
        elif diff < 0:
            trend_dir, trend_good = TrendDir.down, False
            trend_text = f"−{_num(abs(diff))} sedan {prev}"
        else:
            trend_text = f"Oförändrat sedan {prev}"

    return {
        # HME mäts i procent → visa %-tecken i kort/detaljpanel (value_text/target_text renderas direkt).
        "value_text": f"{_num(value)} %",
        "value_num": value,
        "unit": "%",
        "target_text": f"≥ {_num(mal)} %",
        "target_num": mal,
        "bar_max": 100.0,
        "status": status,
        "trend_dir": trend_dir,
        "trend_good": trend_good,
        "trend_text": trend_text,
        "interpretation": _interpretation(status),
        "details": {
            "typ": "hme",
            "enhet": enhet,
            "kalla": kalla,
            "antal_svar": f.antal_svar,
            "senaste_ar": senaste,
            "matningar": {str(y): serie[y] for y in years},
            "trend": trend_meta,
        },
    }, senaste


async def import_hme(session: AsyncSession, payload: HmeImport) -> dict:
    """Upserta HME per förvaltning (org + dialog + mätvärde). Returnerar sammanfattning."""
    areas = {a.key: a for a in (await session.execute(select(KpiArea))).scalars()}
    hme_area = areas.get("hme")
    if hme_area is None:
        raise RuntimeError("KPI-området 'hme' saknas — referensdata måste seedas först.")

    # Gemensam, generisk ansvarig chef (anonym — inga personuppgifter).
    person = (
        await session.execute(select(Person).filter_by(namn="Förvaltningschef (exempel)"))
    ).scalar_one_or_none()
    if person is None:
        person = Person(namn="Förvaltningschef (exempel)", roll="Ansvarig chef", initialer="FC")
        session.add(person)
        await session.flush()

    skapade = uppdaterade = 0
    rader: list[dict] = []

    for f in payload.forvaltningar:
        fields, senaste = _measurement_fields(f, payload.enhet, payload.mal, payload.kalla)

        # Organisation (på slug).
        slug = slugify(f.namn)
        org = (
            await session.execute(select(Organisation).filter_by(slug=slug))
        ).scalar_one_or_none()
        if org is None:
            org = Organisation(namn=f.namn, slug=slug)
            session.add(org)
            await session.flush()

        # En dialog per förvaltning (period speglar senaste mätår).
        period = f"Senaste mätning {senaste}"
        dialogue = (
            await session.execute(select(Dialogue).filter_by(organisation_id=org.id))
        ).scalars().first()
        ny_dialog = dialogue is None
        if ny_dialog:
            dialogue = Dialogue(
                organisation_id=org.id, ansvarig_chef_id=person.id,
                period=period, status="pagaende",
            )
            session.add(dialogue)
            await session.flush()
        else:
            dialogue.period = period

        # HME-mätvärde: uppdatera befintligt eller skapa nytt.
        m = (
            await session.execute(
                select(Measurement).filter_by(dialogue_id=dialogue.id, kpi_area_id=hme_area.id)
            )
        ).scalar_one_or_none()
        if m is None:
            session.add(Measurement(dialogue_id=dialogue.id, kpi_area_id=hme_area.id, **fields))
            skapade += 1
            atgard = "skapad"
        else:
            for key, val in fields.items():
                setattr(m, key, val)
            uppdaterade += 1
            atgard = "uppdaterad"

        # Fiktiva platshållare för övriga KPI:er — bara när dialogen är ny.
        if ny_dialog:
            for key, data in FICTIV_MEASUREMENTS.items():
                area = areas.get(key)
                if area is not None:
                    session.add(Measurement(dialogue_id=dialogue.id, kpi_area_id=area.id, **data))

        rad = {
            "namn": f.namn,
            "atgard": atgard,
            "value": fields["value_text"],
            "senaste_ar": senaste,
            "trend": fields["trend_text"],
            "status": fields["status"].value,
            "antal_svar": f.antal_svar,
            "ar": sorted(str(y) for y in fields["details"]["matningar"]),
        }
        rader.append(rad)
        print(
            f"[import] {f.namn}: {rad['value']} ({senaste}), {rad['trend']}, "
            f"status {rad['status']}, {rad['antal_svar']} svar [{atgard}] "
            f"— år {', '.join(rad['ar'])}"
        )

    await session.commit()
    print(f"[import] klart: {skapade} skapade, {uppdaterade} uppdaterade, {len(rader)} förvaltningar.")
    return {"skapade": skapade, "uppdaterade": uppdaterade, "forvaltningar": rader}
