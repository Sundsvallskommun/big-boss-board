"""Import/upsert av ekonomidata (resultaträkning per förvaltning, mnkr).

Delad logik som både import-endpointen (`routers/import_data.py`) och seed använder,
så det bara finns EN väg in i databasen för ekonomi — speglar `hme_import.py`.

Kopplar enheter till organisationer via **masterdata-koden** (`enhet_kod` ↔
`Organisation.kod`), inte via namn. Endast öppen, publik, aggregerad ekonomidata.
"""

from __future__ import annotations

import csv
import io

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dialogue, KpiArea, Measurement, Organisation, Status, TrendDir
from app.schemas import EkonomiEnhet, EkonomiImport

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


def csv_to_payload(text: str, kalla: str = "Ekonomisk uppföljning (Qlik-export, CSV)") -> dict:
    """CSV-exporten (Period,Enhet,Mått,Kolumn,Mätvärde) → normaliserad EkonomiImport-payload.

    CSV:n bär bara koder (inte namn/typ) — mått-/enhetsnamn slås upp ur MATT_NAMN/ENHET_NAMN,
    och huvudmått vs nettokostnad-per-område avgörs av kodens form (4 vs 5 delar). Hanterar
    BOM och CRLF. Kommun total (13) hoppas (ingen dialog).
    """
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or "Enhet" not in reader.fieldnames or "Mått" not in reader.fieldnames:
        raise ValueError("CSV saknar förväntade kolumner (Period, Enhet, Mått, Kolumn, Mätvärde).")

    enheter: dict[str, dict] = {}
    period = ""
    for row in reader:
        kod = (row.get("Enhet") or "").strip()
        if not kod or kod == "13":
            continue
        falt = KOLUMN_FALT.get((row.get("Kolumn") or "").strip())
        if not falt:
            continue
        period = period or (row.get("Period") or "").strip()
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


def _measurement_fields(enhet: EkonomiEnhet, period: str, kalla: str) -> dict:
    """Bygg mätvärdesfält: nettokostnad mot budget + resultaträkning/områden i details."""
    netto = enhet.matt.get(NETTOKOSTNAD)
    if netto is None or not netto.budget_ack:
        raise ValueError(f"{enhet.namn!r} saknar nettokostnad/budget — kan inte beräkna utfall mot budget.")

    utfall = netto.utfall or 0.0
    budget_ack = netto.budget_ack
    pct = round(abs(utfall) / abs(budget_ack) * 100, 1)
    status = ekonomi_status(pct)
    value_text = f"{_num(round(pct))} % av budget"

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
        Status.good: f"Nettokostnaden ligger inom budget ({value_text}). Fortsätt följa kostnadsutvecklingen.",
        Status.warn: f"Nettokostnaden ligger något över budget ({value_text}). Bevaka utvecklingen.",
        Status.alert: f"Nettokostnaden överskrider budget ({value_text}). Vidta åtgärder och följ upp tätare.",
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

    return {
        "value_text": value_text,
        "value_num": pct,
        "unit": "% av budget",
        "target_text": "100 % (budget)",
        "target_num": EK_BUDGET,
        "bar_max": 120.0,
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
            "serie": [p.model_dump() for p in enhet.serie],
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

        try:
            fields = _measurement_fields(enhet, payload.period, payload.kalla)
        except ValueError:
            rader.append({"namn": enhet.namn, "kod": enhet.kod, "atgard": "ofullstandig"})
            hoppade_over += 1
            continue

        m = (
            await session.execute(
                select(Measurement).filter_by(dialogue_id=dialogue.id, kpi_area_id=ekonomi_area.id)
            )
        ).scalar_one_or_none()
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
                "value": fields["value_text"],
                "status": fields["status"].value,
                "atgard": atgard,
            }
        )
        print(f"[ekonomi] {enhet.namn} ({enhet.kod}): {fields['value_text']} [{atgard}]")

    await session.commit()
    print(
        f"[ekonomi] klart: {skapade} skapade, {uppdaterade} uppdaterade, "
        f"{hoppade_over} hoppade över."
    )
    return {"skapade": skapade, "uppdaterade": uppdaterade, "hoppade_over": hoppade_over, "enheter": rader}
