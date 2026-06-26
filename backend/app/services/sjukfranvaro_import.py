"""Import/upsert av sjukfrånvaro (personal-CSV från Qlik).

Speglar ekonomi-importen: rå CSV (Period,Enhet,Mått,Kolumn,Mätvärde) normaliseras och
upsertas per förvaltning, kopplat via masterdata-koden (`enhet_kod` ↔ `Organisation.kod`).

Måtten (ur datasetets metadata):
- SK.P.SJ.001 = Total sjukfrånvaro i % av ordinarie arbetstid (kortets huvudvärde)
- SK.P.SJ.002 = Andel sjukfrånvaro i sammanhängande tid ≥ 60 dagar (långtidsandel)
- SK.P.SJ.003/004/005 = Sjukfrånvaro per åldersgrupp (≤29 / 30–49 / ≥50)
Kolumner: K20 = Totalt %, K12 = Kvinnor andel i %, K13 = Män andel i %.
"""

from __future__ import annotations

import csv
import io

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dialogue, KpiArea, Measurement, Organisation, Status
from app.schemas import SjukEnhet, SjukImport
from app.services.ekonomi_import import ENHET_NAMN
from app.services.hme_import import sjukfranvaro_status

TOTAL = "SK.P.SJ.001"
LANGTID = "SK.P.SJ.002"
ALDER = {
    "SK.P.SJ.003": "29 år eller yngre",
    "SK.P.SJ.004": "30–49 år",
    "SK.P.SJ.005": "50 år eller äldre",
}
MAL = 6.0  # samma mål/tröskel som tidigare: grön ≤6,0 · gul 6,1–7,5 · röd >7,5


def _pct(v: float) -> str:
    """Procent med en svensk decimal: 5.5 → '5,5'."""
    return f"{float(v):.1f}".replace(".", ",")


def csv_to_payload(text: str, kalla: str = "Personaluppföljning (Qlik-export, CSV)") -> dict:
    """Personal-CSV → normaliserad SjukImport-payload (BOM/CRLF hanteras; kommun 13 hoppas)."""
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or "Enhet" not in reader.fieldnames or "Mått" not in reader.fieldnames:
        raise ValueError("CSV saknar förväntade kolumner (Period, Enhet, Mått, Kolumn, Mätvärde).")

    # kod -> period -> mått -> {kolumn: värde}
    raw: dict[str, dict[str, dict[str, dict[str, float | None]]]] = {}
    alla_perioder: set[str] = set()
    for row in reader:
        kod = (row.get("Enhet") or "").strip()
        if not kod or kod == "13":
            continue
        period = (row.get("Period") or "").strip()
        alla_perioder.add(period)
        matt = (row.get("Mått") or "").strip()
        kol = (row.get("Kolumn") or "").strip()
        ravarde = (row.get("Mätvärde") or "").strip()
        try:
            varde = float(ravarde) if ravarde else None
        except ValueError:
            varde = None
        raw.setdefault(kod, {}).setdefault(period, {}).setdefault(matt, {})[kol] = varde

    enheter = []
    for kod, perioder in raw.items():
        sorterade = sorted(perioder)
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
        enheter.append(
            {
                "kod": kod,
                "namn": ENHET_NAMN.get(kod, f"Enhet {kod}"),
                "period": senaste,
                "total": sj001.get("K20"),
                "kvinnor": sj001.get("K12"),
                "man": sj001.get("K13"),
                "langtidsandel": lm.get(LANGTID, {}).get("K20"),
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
        "enheter": enheter,
    }


def _measurement_fields(enhet: SjukEnhet, period: str, kalla: str) -> dict:
    total = enhet.total
    if total is None:
        raise ValueError(f"{enhet.namn!r} saknar total sjukfrånvaro (SK.P.SJ.001 / K20).")
    status = sjukfranvaro_status(total)
    vt = f"{_pct(total)} %"
    interp = {
        Status.good: f"Sjukfrånvaron ({vt}) ligger på eller under målet (grön nivå – följa planen). Fortsätt det ordinarie hälsofrämjande arbetet.",
        Status.warn: f"Sjukfrånvaron ({vt}) ligger strax över målet (gul nivå – reagera). Analysera mönstret, t.ex. korttids- kontra långtidsfrånvaro.",
        Status.alert: f"Sjukfrånvaron ({vt}) är hög (röd nivå – agera). Starta skarpa, strukturerade åtgärder och följ upp tätare.",
    }[status]

    return {
        "value_text": vt,
        "value_num": total,
        "unit": "",
        "target_text": "≤ 6,0 %",
        "target_num": MAL,
        "bar_max": 10.0,
        "status": status,
        "trend_dir": None,
        "trend_good": None,
        "trend_text": "Ingen jämförelseperiod",
        "interpretation": interp,
        "details": {
            "typ": "sjukfranvaro",
            "period": enhet.period or period,
            "kalla": kalla,
            "kvinnor": enhet.kvinnor,
            "man": enhet.man,
            "langtidsandel": enhet.langtidsandel,
            "aldersgrupper": [{"grupp": a.grupp, "varde": a.varde} for a in enhet.aldersgrupper],
            "serie": [
                {"period": p.period, "total": p.total, "kvinnor": p.kvinnor, "man": p.man}
                for p in enhet.serie
            ],
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
        try:
            fields = _measurement_fields(enhet, payload.period, payload.kalla)
        except ValueError:
            rader.append({"namn": enhet.namn, "kod": enhet.kod, "atgard": "saknar_total"})
            hoppade_over += 1
            continue

        m = (
            await session.execute(
                select(Measurement).filter_by(dialogue_id=dialogue.id, kpi_area_id=area.id)
            )
        ).scalar_one_or_none()
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
        print(f"[sjukfranvaro] {enhet.namn} ({enhet.kod}): {fields['value_text']} [{atgard}]")

    await session.commit()
    print(
        f"[sjukfranvaro] klart: {skapade} skapade, {uppdaterade} uppdaterade, "
        f"{hoppade_over} hoppade över."
    )
    return {"skapade": skapade, "uppdaterade": uppdaterade, "hoppade_over": hoppade_over, "enheter": rader}
