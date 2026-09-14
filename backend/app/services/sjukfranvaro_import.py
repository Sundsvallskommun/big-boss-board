"""Import/upsert av sjukfrånvaro (personal-CSV från Qlik) — rullande 12 månader.

Speglar ekonomi-importen: rå CSV (Period,Enhet,Mått,Kolumn,Mätvärde) normaliseras och
upsertas per förvaltning, kopplat via masterdata-koden (`enhet_kod` ↔ `Organisation.kod`).

**Rullande 12 (R12).** Personalexporten levererar sedan 2026-08 varje månadsstängning som
ett snitt av de tolv månader som slutar där — inte längre tertialackumulerat utfall. Samma
period kan därför ha två helt olika tal beroende på uttag (Vård och omsorg 2026-04-30:
7,7 % ackumulerat, 9,0 % rullande 12). Aggregaten får aldrig blandas i samma serie; se
`_serie_med_perioder`, som slänger en befintlig serie som byggts med en annan metod.

Måtten (ur datasetets metadata):
- SK.P.SJ.001 = Total sjukfrånvaro i % av ordinarie arbetstid (kortets huvudvärde)
- SK.P.SJ.002 = Andel sjukfrånvaro i sammanhängande tid ≥ 60 dagar (långtidsandel)
- SK.P.SJ.003/004/005 = Sjukfrånvaro per åldersgrupp (≤29 / 30–49 / ≥50)
- SK.P.AM.001 = Antal tillsvidareanställda (underlag för kostnadsuppskattningen)
Kolumner: K20 = Totalt %, K12 = Kvinnor andel i %, K13 = Män andel i %, K9 = antal.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date
from math import isfinite

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dialogue, KpiArea, Measurement, Organisation, Status, TrendDir
from app.schemas import SjukEnhet, SjukImport, ExportFil
from app.services.ekonomi_import import ENHET_NAMN, las_rader
from app.services.hme_import import (
    SJUK_GUL_TAK,
    SJUK_KVARTAL_LARM,
    SJUK_MAL,
    sjukfranvaro_status,
)

TOTAL = "SK.P.SJ.001"
LANGTID = "SK.P.SJ.002"
ANSTALLDA = "SK.P.AM.001"  # tillsvidareanställda, kolumn K9
ALDER = {
    "SK.P.SJ.003": "29 år eller yngre",
    "SK.P.SJ.004": "30–49 år",
    "SK.P.SJ.005": "50 år eller äldre",
}
# Mål och tröskelvärden ägs av hme_import (samma källa som färgregeln) — aldrig egna tal här.
MAL = SJUK_MAL  # grön ≤6,0 · gul 6,1–7,5 · röd >7,5 eller kvartalsökning >1,5 p.e.

#: Hur datat är aggregerat. Sparas i `details` så att en import aldrig ärver serie­punkter
#: från ett annat aggregat (tertialackumulerat ≠ rullande 12 för samma period).
MATMETOD = "rullande12"

#: Antal månader bakåt som kortets trend och kvartalsregeln jämför mot. Ett R12-värde rör
#: sig bara en tolftedel per månad — en enskild månads förändring är för liten för att
#: bära kortets trendtext, medan ett kvartal är samma fönster som färgregeln använder.
KVARTAL = 3

MANADER = [
    "jan", "feb", "mar", "apr", "maj", "jun",
    "jul", "aug", "sep", "okt", "nov", "dec",
]


def _pct(v: float) -> str:
    """Procent med en svensk decimal: 5.5 → '5,5'."""
    return f"{float(v):.1f}".replace(".", ",")


def _manadsindex(period: str) -> int | None:
    """ISO-datum → löpande månadsnummer (år*12+månad), för avstånd mellan perioder."""
    try:
        ar, man = int(period[0:4]), int(period[5:7])
    except (ValueError, IndexError):
        return None
    return ar * 12 + man if 1 <= man <= 12 else None


def _manadsetikett(period: str) -> str:
    """ISO-datum → 'apr 2026'. Används i trendtexten på kortet."""
    i = _manadsindex(period)
    if i is None:
        return period
    return f"{MANADER[(i - 1) % 12]} {(i - 1) // 12}"


class SjukExportMetodError(ValueError):
    """Exporten kan inte identifieras som R12 och får inte användas som sådant underlag."""


def csv_to_payload(text: str, kalla: str = "Personaluppföljning (Qlik-export, CSV)") -> dict:
    """Personal-CSV → normaliserad SjukImport-payload (BOM/CRLF hanteras; kommun 13 hoppas).

    Flera månadsstängningar i samma CSV blir en R12-serie per förvaltning. Skicka in hela
    årets uttag på en gång — enkelperiod-import fyller bara på en punkt i befintlig serie.
    """
    if not re.search(r"SK\.P\.AM\.", text):
        raise SjukExportMetodError("Gammal eller okänd personalexport. Använd ett R12-uttag med personalmått (SK.P.AM.).")
    reader = las_rader(text)
    if not {"Period", "Enhet", "Mått", "Kolumn", "Mätvärde"}.issubset(reader.fieldnames or []):
        raise ValueError("CSV saknar förväntade kolumner (Period, Enhet, Mått, Kolumn, Mätvärde).")

    # kod -> period -> mått -> {kolumn: värde}
    raw: dict[str, dict[str, dict[str, dict[str, float | None]]]] = {}
    alla_perioder: set[str] = set()
    for row in reader:
        kod = (row.get("Enhet") or "").strip()
        if not kod or kod == "13":
            continue
        period = (row.get("Period") or "").strip()
        date.fromisoformat(period)
        alla_perioder.add(period)
        matt = (row.get("Mått") or "").strip()
        kol = (row.get("Kolumn") or "").strip()
        ravarde = (row.get("Mätvärde") or "").strip()
        try:
            varde = float(ravarde) if ravarde else None
        except ValueError as exc:
            raise ValueError(f"Ogiltigt mätvärde för {kod}, {period}: {ravarde!r}.") from exc
        if varde is not None and not isfinite(varde):
            raise ValueError("Mätvärden måste vara ändliga tal.")
        raw.setdefault(kod, {}).setdefault(period, {}).setdefault(matt, {})[kol] = varde

    enheter = []
    for kod, perioder in raw.items():
        # Personalantal kan finnas för en nyare månad än sjukfrånvaron. Det får
        # varken dölja sista sjukmätningen eller skapa en tom punkt efter den.
        sorterade = sorted(p for p, matt in perioder.items() if matt.get(TOTAL, {}).get("K20") is not None)
        if not sorterade:
            continue
        serie = [
            {
                "period": p,
                "total": perioder[p].get(TOTAL, {}).get("K20"),
                "kvinnor": perioder[p].get(TOTAL, {}).get("K12"),
                "man": perioder[p].get(TOTAL, {}).get("K13"),
            }
            for p in sorterade
        ]
        senaste = sorterade[-1]
        lm = perioder[senaste]
        sj001 = lm.get(TOTAL, {})
        # Antalet tillsvidareanställda finns bara i den nyare exporten. Saknas det får
        # kostnadsrutan falla tillbaka på sin egen tabell hellre än att gissa.
        antal = lm.get(ANSTALLDA, {}).get("K9")
        if antal is not None and (antal < 0 or not antal.is_integer()):
            raise ValueError("Antal anställda måste vara ett icke-negativt heltal.")
        enheter.append(
            {
                "kod": kod,
                "namn": ENHET_NAMN.get(kod, f"Enhet {kod}"),
                "period": senaste,
                "total": sj001.get("K20"),
                "kvinnor": sj001.get("K12"),
                "man": sj001.get("K13"),
                "langtidsandel": lm.get(LANGTID, {}).get("K20"),
                "anstallda": int(antal) if antal is not None else None,
                "aldersgrupper": [
                    {"grupp": namn, "varde": lm.get(code, {}).get("K20")}
                    for code, namn in ALDER.items()
                ],
                "serie": serie,
            }
        )
    return {
        "kpi": "sjukfranvaro",
        "period": max(alla_perioder) if alla_perioder else "",
        "kalla": kalla,
        "matmetod": MATMETOD,
        "enheter": enheter,
    }


def filer_to_payload(filer: list[ExportFil]) -> dict:
    """Senaste filuttag vinner per mätpunkt; flermånadsfiler får behålla hela historiken."""
    def uttagsordning(fil: ExportFil) -> tuple[str, str]:
        datum = re.findall(r"\d{4}-\d{2}-\d{2}", fil.namn)
        return (datum[-1] if datum else "", fil.namn)

    rader: dict[tuple[str, str, str, str], dict[str, str]] = {}
    for fil in sorted(filer, key=uttagsordning):
        csv_to_payload(fil.text)  # Validera varje fil innan något skrivs till databasen.
        for rad in las_rader(fil.text):
            key = tuple(rad.get(k, "") for k in ("Period", "Enhet", "Mått", "Kolumn"))
            rader[key] = rad
    body = io.StringIO()
    writer = csv.DictWriter(body, fieldnames=["Period", "Enhet", "Mått", "Kolumn", "Mätvärde"], extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rader.values())
    return csv_to_payload(body.getvalue())


def _serie_med_perioder(befintlig: dict | None, enhet: SjukEnhet) -> list[dict]:
    """Slå ihop importens perioder med en redan importerad R12-serie.

    Utan det nollar en enskild månadsuppladdning hela 12-månadersserien — samma fälla
    som ekonomins `_serie_med_period`. Samma period igen → den nya punkten vinner
    (ett senare uttag är mer komplett).

    En befintlig serie ärvs bara om den byggts med **samma** aggregat. Serier från den
    gamla tertialackumulerade exporten saknar `matmetod` och slängs därför vid första
    R12-importen, i stället för att lämna kvar punkter som ser jämförbara ut men inte är det.
    """
    tidigare: list[dict] = []
    if befintlig and befintlig.get("matmetod") == MATMETOD:
        tidigare = [p for p in (befintlig.get("serie") or []) if p.get("period")]

    per_period = {str(p["period"]): dict(p) for p in tidigare}
    for punkt in enhet.serie:
        if punkt.period:
            per_period[punkt.period] = {
                "period": punkt.period,
                "total": punkt.total,
                "kvinnor": punkt.kvinnor,
                "man": punkt.man,
            }
    # Normaliserade importer behöver inte skicka en separat serie för huvudvärdet.
    per_period[enhet.period] = {
        "period": enhet.period, "total": enhet.total,
        "kvinnor": enhet.kvinnor, "man": enhet.man,
    }
    return [per_period[p] for p in sorted(per_period)]


def _trend(serie: list[dict], total: float) -> tuple[TrendDir | None, bool | None, str, float | None]:
    """Kortets trend + kvartalsförändringen som färgregeln larmar på.

    Jämför mot punkten `KVARTAL` månader bakåt. Finns den inte (kortare serie, hål i
    månaderna) används den äldsta punkt som finns, och texten namnger vilken månad det
    är — trenden ska aldrig påstå ett fönster den inte mätt. Returnerar
    (riktning, är_bra, text, kvartalsökning i p.e. eller None).
    """
    punkter = [p for p in serie if isinstance(p.get("total"), (int, float)) and p.get("period")]
    if len(punkter) < 2:
        return None, None, "Ingen jämförelseperiod", None

    senaste_i = _manadsindex(punkter[-1]["period"])
    kandidater = [p for p in punkter[:-1] if _manadsindex(p["period"]) is not None]
    if senaste_i is None or not kandidater:
        return None, None, "Ingen jämförelseperiod", None

    mal_i = senaste_i - KVARTAL
    exakt = next((p for p in kandidater if _manadsindex(p["period"]) == mal_i), None)
    jmf = exakt or kandidater[0]
    diff = round(total - float(jmf["total"]), 1)
    etikett = _manadsetikett(jmf["period"])
    # Kvartalslarmet får bara utlösas på ett faktiskt kvartal, inte på en godtycklig
    # äldre punkt — annars larmar en lång serie på en förändring som tagit två år.
    kvartalsokning = diff if exakt is not None else None

    if diff > 0:
        return TrendDir.up, False, f"+{_pct(diff)} p.e. sedan {etikett}", kvartalsokning
    if diff < 0:
        return TrendDir.down, True, f"−{_pct(abs(diff))} p.e. sedan {etikett}", kvartalsokning
    return None, None, f"Oförändrat sedan {etikett}", kvartalsokning


def _measurement_fields(
    enhet: SjukEnhet, period: str, kalla: str, befintlig: dict | None = None
) -> dict:
    serie = _serie_med_perioder(befintlig, enhet)
    nyaste = serie[-1] if serie else None

    # Ett uttag av en ÄLDRE månad ska fylla på historiken, aldrig skriva om nuläget.
    # Utan det här föll kortet tillbaka till aprilvärdet när aprilfilen laddades upp
    # igen — samtidigt som kurvan fortsatte sluta i juli. Rubriksiffran och grafens
    # sista punkt sa alltså olika saker om samma förvaltning.
    bakat = bool(
        befintlig and enhet.period and nyaste and str(nyaste["period"]) > enhet.period
    )
    if bakat:
        assert nyaste is not None and befintlig is not None  # för typkontrollen
        total = nyaste.get("total")
        kvinnor, man = nyaste.get("kvinnor"), nyaste.get("man")
        aktuell_period = str(nyaste["period"])
        langtidsandel = befintlig.get("langtidsandel")
        anstallda = befintlig.get("anstallda")
        aldersgrupper = [
            {"grupp": a.get("grupp"), "varde": a.get("varde")}
            for a in (befintlig.get("aldersgrupper") or [])
        ]
    else:
        total = enhet.total
        kvinnor, man = enhet.kvinnor, enhet.man
        aktuell_period = enhet.period or period
        langtidsandel = enhet.langtidsandel
        anstallda = enhet.anstallda
        aldersgrupper = [{"grupp": a.grupp, "varde": a.varde} for a in enhet.aldersgrupper]

    if total is None:
        raise ValueError(f"{enhet.namn!r} saknar total sjukfrånvaro (SK.P.SJ.001 / K20).")
    trend_dir, trend_good, trend_text, kvartalsokning = _trend(serie, total)
    status = sjukfranvaro_status(total, kvartalsokning)

    vt = f"{_pct(total)} %"
    r12 = f"{vt} rullande 12 månader"
    # Röd nivå kan komma av två olika saker. Sätts den av kvartalsökningen medan nivån i
    # sig är godtagbar vore "sjukfrånvaron är hög" fel besked — det är takten som larmar.
    larmar_pa_okning = kvartalsokning is not None and kvartalsokning > SJUK_KVARTAL_LARM
    if status is Status.alert and larmar_pa_okning and total <= SJUK_GUL_TAK:
        interp = (
            f"Sjukfrånvaron ({r12}) har stigit {_pct(kvartalsokning)} procentenheter på ett "
            "kvartal (röd nivå – agera). Nivån i sig är inte kritisk, men takten är det — "
            "ta reda på vad som driver ökningen innan den hinner sätta sig."
        )
    else:
        interp = {
            Status.good: f"Sjukfrånvaron ({r12}) ligger på eller under målet (grön nivå – följa planen). Fortsätt det ordinarie hälsofrämjande arbetet.",
            Status.warn: f"Sjukfrånvaron ({r12}) ligger strax över målet (gul nivå – reagera). Analysera mönstret, t.ex. korttids- kontra långtidsfrånvaro.",
            Status.alert: f"Sjukfrånvaron ({r12}) är hög (röd nivå – agera). Starta skarpa, strukturerade åtgärder och följ upp tätare.",
        }[status]
        if larmar_pa_okning:
            interp += (
                f" Nivån har dessutom stigit {_pct(kvartalsokning)} procentenheter på ett kvartal."
            )

    return {
        "value_text": vt,
        "value_num": total,
        "unit": "",
        "target_text": f"≤ {_pct(MAL)} %",
        "target_num": MAL,
        "bar_max": 10.0,
        "status": status,
        "trend_dir": trend_dir,
        "trend_good": trend_good,
        "trend_text": trend_text,
        "interpretation": interp,
        "details": {
            "typ": "sjukfranvaro",
            "period": aktuell_period,
            "kalla": kalla,
            "matmetod": MATMETOD,
            "kvinnor": kvinnor,
            "man": man,
            "langtidsandel": langtidsandel,
            "anstallda": anstallda,
            "aldersgrupper": aldersgrupper,
            "serie": serie,
        },
    }


async def import_sjukfranvaro(session: AsyncSession, payload: SjukImport) -> dict:
    """Upserta sjukfrånvaro per förvaltning (matchar Organisation på masterdata-kod)."""
    area = (
        await session.execute(select(KpiArea).filter_by(key="sjukfranvaro"))
    ).scalar_one_or_none()
    if area is None:
        raise RuntimeError("KPI-området 'sjukfranvaro' saknas — referensdata måste seedas först.")

    skapade = uppdaterade = hoppade_over = 0
    rader: list[dict] = []

    for enhet in payload.enheter:
        org = (
            await session.execute(select(Organisation).filter_by(kod=enhet.kod))
        ).scalar_one_or_none()
        if org is None:
            rader.append({"namn": enhet.namn, "kod": enhet.kod, "atgard": "ingen_org_for_kod"})
            hoppade_over += 1
            continue
        dialogue = (
            await session.execute(select(Dialogue).filter_by(organisation_id=org.id))
        ).scalars().first()
        if dialogue is None:
            rader.append({"namn": enhet.namn, "kod": enhet.kod, "atgard": "ingen_dialog"})
            hoppade_over += 1
            continue

        m = (
            await session.execute(
                select(Measurement).filter_by(dialogue_id=dialogue.id, kpi_area_id=area.id)
            )
        ).scalar_one_or_none()
        befintlig = m.details if m is not None and isinstance(m.details, dict) else None
        try:
            fields = _measurement_fields(enhet, payload.period, payload.kalla, befintlig)
        except ValueError:
            rader.append({"namn": enhet.namn, "kod": enhet.kod, "atgard": "saknar_total"})
            hoppade_over += 1
            continue

        if m is None:
            session.add(Measurement(dialogue_id=dialogue.id, kpi_area_id=area.id, **fields))
            skapade += 1
            atgard = "skapad"
        else:
            for key, val in fields.items():
                setattr(m, key, val)
            uppdaterade += 1
            atgard = "uppdaterad"

        rader.append(
            {
                "namn": enhet.namn,
                "kod": enhet.kod,
                "value": fields["value_text"],
                "status": fields["status"].value,
                "atgard": atgard,
            }
        )
        # Säg till när uttaget bara fyllde på historiken — annars ser det ut som att
        # kortet ignorerade filen man just laddade upp.
        bakat = fields["details"]["period"] != enhet.period
        print(
            f"[sjukfranvaro] {enhet.namn} ({enhet.kod}): {fields['value_text']} R12 "
            f"({len(fields['details']['serie'])} månader) [{atgard}]"
            + (
                f" — {enhet.period} är äldre än kortets period "
                f"{fields['details']['period']}, bara historiken fylldes på"
                if bakat
                else ""
            )
        )

    await session.commit()
    print(
        f"[sjukfranvaro] klart: {skapade} skapade, {uppdaterade} uppdaterade, "
        f"{hoppade_over} hoppade över."
    )
    return {"skapade": skapade, "uppdaterade": uppdaterade, "hoppade_over": hoppade_over, "enheter": rader}
