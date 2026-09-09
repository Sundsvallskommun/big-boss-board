"""Import/upsert av ekonomidata (resultaträkning per förvaltning, mnkr).

Delad logik som både import-endpointen (`routers/import_data.py`) och seed använder,
så det bara finns EN väg in i databasen för ekonomi — speglar `hme_import.py`.

Kopplar enheter till organisationer via **masterdata-koden** (`enhet_kod` ↔
`Organisation.kod`), inte via namn. Endast öppen, publik, aggregerad ekonomidata.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dialogue, KpiArea, Measurement, Organisation, Status, TrendDir
from app.schemas import EkonomiEnhet, EkonomiImport, ExportFil

# Resultaträkningens mått (RR.005 = Verksamhetens nettokostnad är kortets huvudvärde).
NETTOKOSTNAD = "SK.EK.RR.005"

# Kolumnkod → fältnamn i normaliserad payload.
KOLUMN_FALT = {
    "K14": "budget_helar",
    "K15": "budget_ack",
    "K16": "utfall",
    "K17": "utfall_fg",
    "K18": "prognos",
}

# Klartext för mått-/enhetskoder (CSV-exporten skickar bara koder, inte namn).
MATT_NAMN = {
    "SK.EK.RR.001": "Verksamhetens intäkter",
    "SK.EK.RR.002": "Personalkostnader",
    "SK.EK.RR.003": "Verksamhetens övriga kostnader",
    "SK.EK.RR.004": "Avskrivningar",
    "SK.EK.RR.005": "Verksamhetens nettokostnad",
    "SK.EK.RR.006": "Skattemedel",
    "SK.EK.RR.007": "Finansiella intäkter",
    "SK.EK.RR.008": "Finansiella kostnader",
    "SK.EK.RR.009": "RESULTAT",
}
ENHET_NAMN = {
    "13": "Sundsvalls kommun (totalt)",
    "23": "Vård och omsorg",
    "24": "Barn och utbildning",
    "25": "Miljökontoret",
    "26": "Stadsbyggnadskontoret",
    "27": "Lantmäterikontoret",
    "28": "Kommunstyrelsekontoret",
    "29": "Överförmyndarkontoret",
    "30": "Kultur och fritid",
    "31": "Individ och arbetsmarknad",
}

# Förvaltningsnivån — den enda nivå appen visar. Kommun total (13) har ingen dialog och
# ingår därför inte. Exporten innehåller även sektion och enhet; de filtreras bort vid
# parsningen (se csv_to_payload).
FORVALTNING_KODER = frozenset(ENHET_NAMN) - {"13"}

# Tröskelvärden för färg (nettokostnad mot ackumulerad budget, lägre är bättre).
EK_BUDGET = 100.0   # på/under budget
EK_GUL_TAK = 102.0  # svagt över


def ekonomi_status(pct_av_budget: float) -> Status:
    """Färgnivå för nettokostnad mot budget: ≤100 % grön, ≤102 % gul, annars röd."""
    if pct_av_budget <= EK_BUDGET:
        return Status.good
    if pct_av_budget <= EK_GUL_TAK:
        return Status.warn
    return Status.alert


def _num(value: float) -> str:
    """mnkr med svensk decimal (en decimal), heltal utan decimal."""
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}".replace(".", ",")


def report_to_payload(report: dict) -> dict:
    """Rå ekonomirapport (`poster` i long-format) → normaliserad EkonomiImport-payload.

    Grupperar per enhet (niva=förvaltning; kommun total hoppas — saknar dialog), och
    samlar huvudmått (mått × kolumn) samt nettokostnad per verksamhetsområde.
    """
    dataset = report.get("dataset", {}) or {}
    poster = report.get("poster", []) or []

    enheter: dict[str, dict] = {}
    for p in poster:
        if p.get("niva") != "förvaltning":
            continue  # kommun total (13) har ingen dialog
        kod = str(p["enhet_kod"])
        e = enheter.setdefault(
            kod, {"kod": kod, "namn": p["enhet_namn"], "niva": "förvaltning", "matt": {}, "omrade": []}
        )
        varde = p.get("matvarde_mnkr")
        if p.get("matt_typ") == "huvudmått":
            m = e["matt"].setdefault(p["matt_kod"], {"namn": p["matt_namn"]})
            falt = KOLUMN_FALT.get(p["kolumn_kod"])
            if falt:
                m[falt] = varde
        elif p.get("matt_typ") == "nettokostnad_per_område":
            falt = KOLUMN_FALT.get(p["kolumn_kod"])
            # Bara utfall (K16) och ack budget (K15) är intressanta för nedbrytningen.
            if falt in ("utfall", "budget_ack"):
                rad = next((o for o in e["omrade"] if o["omrade_kod"] == p.get("omrade_kod")), None)
                if rad is None:
                    rad = {"omrade_kod": p.get("omrade_kod"), "namn": None}
                    e["omrade"].append(rad)
                rad[falt] = varde

    return {
        "kpi": "ekonomi",
        "period": dataset.get("period", ""),
        "kalla": dataset.get("kalla", "Ekonomisk uppföljning (resultaträkning)"),
        "enheter": list(enheter.values()),
    }


def las_rader(text: str) -> csv.DictReader:
    """DictReader över Qlik-exporten, oavsett om den är komma- eller tabbseparerad.

    Källan levereras i två skepnader: kommaseparerad `.csv` och tabbseparerad `.txt`
    (den senare är formatet den officiella uppföljningen använder). Avgränsaren läses
    av rubrikraden — `csv.Sniffer` gissar fel på filer där fältvärden innehåller punkt
    och bindestreck. Hanterar BOM och CRLF.
    """
    rubrik = text.lstrip("﻿").split("\n", 1)[0]
    delimiter = "\t" if "\t" in rubrik else ","
    return csv.DictReader(io.StringIO(text.lstrip("\ufeff")), delimiter=delimiter)


def csv_to_payload(text: str, kalla: str = "Ekonomisk uppföljning (Qlik-export, CSV)") -> dict:
    """CSV-exporten (Period,Enhet,Mått,Kolumn,Mätvärde) → normaliserad EkonomiImport-payload.

    Exporten bär bara koder (inte namn/typ) — mått-/enhetsnamn slås upp ur MATT_NAMN/ENHET_NAMN,
    och huvudmått vs nettokostnad-per-område avgörs av kodens form (4 vs 5 delar). Hanterar
    BOM, CRLF och både komma- och tabbseparerad export.

    Endast förvaltningsnivån (FORVALTNING_KODER) tas med. Den officiella exporten
    innehåller hela organisationen — förvaltning, sektion och enhet, ~780 enheter — och
    utan filtret hamnar varje sektion i payloaden som en påhittad "förvaltning" som
    upserten sedan hoppar över med `ingen_org_for_kod`. Kommun total (13) hoppas också
    (ingen dialog).
    """
    reader = las_rader(text)
    if reader.fieldnames is None or "Enhet" not in reader.fieldnames or "Mått" not in reader.fieldnames:
        raise ValueError("CSV saknar förväntade kolumner (Period, Enhet, Mått, Kolumn, Mätvärde).")

    enheter: dict[str, dict] = {}
    period = ""
    for row in reader:
        kod = (row.get("Enhet") or "").strip()
        if kod not in FORVALTNING_KODER:
            continue
        falt = KOLUMN_FALT.get((row.get("Kolumn") or "").strip())
        if not falt:
            continue
        rad_period = (row.get("Period") or "").strip()
        if period and rad_period != period:
            raise ValueError("Ekonomifilen innehåller flera rapportperioder. Använd en fil per period.")
        period = rad_period
        matt_kod = (row.get("Mått") or "").strip()
        ravarde = (row.get("Mätvärde") or "").strip()
        try:
            varde = float(ravarde) if ravarde else None
        except ValueError:
            varde = None

        e = enheter.setdefault(
            kod,
            {"kod": kod, "namn": ENHET_NAMN.get(kod, f"Enhet {kod}"), "niva": "förvaltning", "matt": {}, "omrade": []},
        )
        delar = matt_kod.split(".")
        if len(delar) >= 5:  # SK.EK.RR.005.XX → nettokostnad per område
            if falt in ("utfall", "budget_ack"):
                omrade_kod = delar[-1]
                rad = next((o for o in e["omrade"] if o["omrade_kod"] == omrade_kod), None)
                if rad is None:
                    rad = {"omrade_kod": omrade_kod, "namn": None}
                    e["omrade"].append(rad)
                rad[falt] = varde
        else:  # huvudmått
            m = e["matt"].setdefault(matt_kod, {"namn": MATT_NAMN.get(matt_kod, matt_kod)})
            m[falt] = varde

    return {"kpi": "ekonomi", "period": period, "kalla": kalla, "enheter": list(enheter.values())}


def valj_ekonomifiler(filer: list[ExportFil]) -> list[str]:
    """Senaste ordinarie uttag dag 1–9 månaden efter perioden, annars senaste tillgängliga.

    Filnamnet används bara för uttagsdatum. Perioden läses alltid ur filinnehållet.
    Samma urval används av webb och CLI via /ekonomi-filer.
    """
    valda: dict[str, tuple[tuple[bool, str, str], str]] = {}
    for fil in filer:
        payload = csv_to_payload(fil.text)
        period = payload["period"]
        if not period:
            raise ValueError(f"{fil.namn}: ingen rapportperiod på förvaltningsnivå.")
        datum = re.findall(r"\d{4}-\d{2}-\d{2}", fil.namn)
        uttag = date.fromisoformat(datum[-1]) if datum else None
        stangning = date.fromisoformat(period)
        ordinarie = bool(
            uttag and 1 <= uttag.day <= 9
            and uttag.year * 12 + uttag.month == stangning.year * 12 + stangning.month + 1
        )
        prioritet = (ordinarie, uttag.isoformat() if uttag else "", fil.namn)
        if period not in valda or prioritet > valda[period][0]:
            valda[period] = (prioritet, fil.text)
    return [valda[p][1] for p in sorted(valda)]


def csvs_to_serie_payload(
    period_texts: list[str], kalla: str = "Ekonomisk uppföljning (Qlik-export, CSV)"
) -> dict:
    """Flera CSV-perioder → EN normaliserad payload med månadsserie per förvaltning.

    `period_texts`: rå CSV-text, EN per rapportperiod (dagsuttaget som är mest komplett
    för perioden). Senaste periodens matt/omrade blir kortets huvudvärde (headline);
    utöver det får varje enhet en `serie` av nettokostnad (RR.005) över alla perioder,
    kronologiskt. Grafen ritar serien; saknas fler perioder faller den tillbaka på headline.
    """
    per_period = [csv_to_payload(t, kalla) for t in period_texts]
    per_period = [p for p in per_period if p.get("period") and p.get("enheter")]
    if not per_period:
        return {"kpi": "ekonomi", "period": "", "kalla": kalla, "enheter": []}

    per_period.sort(key=lambda p: p["period"])  # äldst först → serien går jan→…

    # Nettokostnadsserie per enhet-kod, en punkt per period.
    serie_by_kod: dict[str, list[dict]] = {}
    for p in per_period:
        for e in p["enheter"]:
            netto = e["matt"].get(NETTOKOSTNAD)
            if netto is None:
                continue
            serie_by_kod.setdefault(e["kod"], []).append(
                {
                    "period": p["period"],
                    "budget_helar": netto.get("budget_helar"),
                    "budget_ack": netto.get("budget_ack"),
                    "utfall": netto.get("utfall"),
                    "utfall_fg": netto.get("utfall_fg"),
                    "prognos": netto.get("prognos"),
                }
            )

    latest = per_period[-1]
    for e in latest["enheter"]:
        e["serie"] = serie_by_kod.get(e["kod"], [])
    return latest


def _serie_med_period(befintlig: list[dict], enhet: EkonomiEnhet, period: str) -> list[dict]:
    """Uppsertera den här periodens nettokostnad i en redan importerad månadsserie.

    Används vid **enkelperiod-import** (en CSV via GUI/`/ekonomi-csv`), där payloaden
    saknar serie. Utan detta skulle en enskild uppladdning nolla hela månadsserien.
    Samma period igen → punkten ersätts (korrigerat dagsuttag vinner).
    """
    netto = enhet.matt.get(NETTOKOSTNAD)
    if netto is None or not period:
        return list(befintlig)
    per_period = {str(p.get("period")): p for p in befintlig if p.get("period")}
    per_period[period] = {
        "period": period,
        "budget_helar": netto.budget_helar,
        "budget_ack": netto.budget_ack,
        "utfall": netto.utfall,
        "utfall_fg": netto.utfall_fg,
        "prognos": netto.prognos,
    }
    return [per_period[p] for p in sorted(per_period)]


def _measurement_fields(
    enhet: EkonomiEnhet,
    period: str,
    kalla: str,
    befintlig_serie: list[dict] | None = None,
) -> dict:
    """Bygg mätvärdesfält: nettokostnad mot budget + resultaträkning/områden i details."""
    netto = enhet.matt.get(NETTOKOSTNAD)
    if netto is None or not netto.budget_ack:
        raise ValueError(f"{enhet.namn!r} saknar nettokostnad/budget — kan inte beräkna utfall mot budget.")

    utfall = netto.utfall or 0.0
    budget_ack = netto.budget_ack
    kostnad = abs(utfall)
    budget = abs(budget_ack)
    pct = round(kostnad / budget * 100, 1)
    status = ekonomi_status(pct)
    # Headline: avvikelse mot ackumulerad budget i mnkr, med tecken enligt kommunal
    # konvention — minus = över budget (spenderat mer än budget), plus = under budget.
    avvikelse = round(budget - kostnad, 1)
    if avvikelse > 0:
        value_text = f"+{_num(avvikelse)} mnkr"
    elif avvikelse < 0:
        value_text = f"−{_num(abs(avvikelse))} mnkr"
    else:
        value_text = "±0 mnkr"

    # Trend: nettokostnad i år mot fg år (ack, jämförbar period). Högre kostnad = sämre.
    trend_dir: TrendDir | None = None
    trend_good: bool | None = None
    trend_text = "Inget jämförelseår"
    if netto.utfall_fg:
        diff = round(abs(utfall) - abs(netto.utfall_fg), 1)
        if diff > 0:
            trend_dir, trend_good = TrendDir.up, False
            trend_text = f"+{_num(diff)} mnkr vs fg år"
        elif diff < 0:
            trend_dir, trend_good = TrendDir.down, True
            trend_text = f"−{_num(abs(diff))} mnkr vs fg år"
        else:
            trend_text = "Oförändrat vs fg år"

    interp = {
        Status.good: f"Nettokostnaden ligger inom budget (avvikelse {value_text} mot ackumulerad budget). Fortsätt följa kostnadsutvecklingen.",
        Status.warn: f"Nettokostnaden ligger något över budget (avvikelse {value_text}). Bevaka utvecklingen.",
        Status.alert: f"Nettokostnaden överskrider budget (avvikelse {value_text}). Vidta åtgärder och följ upp tätare.",
    }[status]

    resultatrakning = [
        {
            "matt_kod": kod,
            "namn": m.namn,
            "budget_helar": m.budget_helar,
            "budget_ack": m.budget_ack,
            "utfall": m.utfall,
            "utfall_fg": m.utfall_fg,
            "prognos": m.prognos,
        }
        for kod, m in sorted(enhet.matt.items())
    ]
    omraden = [
        {"omrade_kod": o.omrade_kod, "namn": o.namn, "utfall": o.utfall, "budget_ack": o.budget_ack}
        for o in enhet.omrade
    ]

    # Serieimport (flera perioder) är auktoritativ och ersätter serien. Enkelperiod-import
    # har tom serie i payloaden — då behålls den befintliga och periodens punkt uppserteras.
    serie = [p.model_dump() for p in enhet.serie]
    if not serie:
        serie = _serie_med_period(befintlig_serie or [], enhet, period)

    return {
        "value_text": value_text,
        # Mätaren visar ackumulerat utfall mot ack. budget (mållinje) i mnkr —
        # stapel förbi mållinjen = över budget. Färgen styrs av samma tröskel som förr.
        "value_num": kostnad,
        "unit": "mnkr",
        "target_text": f"{_num(budget)} mnkr",
        "target_num": budget,
        "bar_max": round(max(kostnad, budget) * 1.15, 1),
        "status": status,
        "trend_dir": trend_dir,
        "trend_good": trend_good,
        "trend_text": trend_text,
        "interpretation": interp,
        "details": {
            "typ": "ekonomi",
            "enhet": "mnkr",
            "kalla": kalla,
            "period": period,
            "resultatrakning": resultatrakning,
            "nettokostnad_per_omrade": omraden,
            # Månadsserie av nettokostnad (RR.005) över året. Tom → grafen visar bara headline.
            "serie": serie,
        },
    }


async def import_ekonomi(session: AsyncSession, payload: EkonomiImport) -> dict:
    """Upserta ekonomi per förvaltning (matchar Organisation på masterdata-kod)."""
    ekonomi_area = (
        await session.execute(select(KpiArea).filter_by(key="ekonomi"))
    ).scalar_one_or_none()
    if ekonomi_area is None:
        raise RuntimeError("KPI-området 'ekonomi' saknas — referensdata måste seedas först.")

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
                select(Measurement).filter_by(dialogue_id=dialogue.id, kpi_area_id=ekonomi_area.id)
            )
        ).scalar_one_or_none()
        # Befintlig månadsserie plockas fram före uppdateringen — enkelperiod-import
        # ska bygga vidare på den, inte skriva över den med tomt.
        befintlig_serie = list((m.details or {}).get("serie") or []) if m is not None else []

        try:
            fields = _measurement_fields(enhet, payload.period, payload.kalla, befintlig_serie)
            if m is not None and not enhet.serie and (m.details or {}).get("period", "") > payload.period:
                fields = {"details": {**m.details, "serie": fields["details"]["serie"]}}
        except ValueError:
            rader.append({"namn": enhet.namn, "kod": enhet.kod, "atgard": "ofullstandig"})
            hoppade_over += 1
            continue

        if m is None:
            session.add(Measurement(dialogue_id=dialogue.id, kpi_area_id=ekonomi_area.id, **fields))
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
                "value": m.value_text if m is not None else fields["value_text"],
                "status": (m.status if m is not None else fields["status"]).value,
                "atgard": atgard,
            }
        )
        print(f"[ekonomi] {enhet.namn} ({enhet.kod}): [{atgard}]")

    await session.commit()
    print(
        f"[ekonomi] klart: {skapade} skapade, {uppdaterade} uppdaterade, "
        f"{hoppade_over} hoppade över."
    )
    return {"skapade": skapade, "uppdaterade": uppdaterade, "hoppade_over": hoppade_over, "enheter": rader}
