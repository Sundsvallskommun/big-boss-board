"""Avgränsad data-administration (maskin-till-maskin, token-skyddad).

Tre operationer, generiska över alla nyckeltal:
- läs nuläge (diagnos): vilka nyckeltal finns och vilka mätvärden bär varje dialog,
- upserta mätvärden per nyckeltal över förvaltningar (PATCH — endast angivna fält ändras),
- rensa ett obsolet nyckeltal + dess data (mätvärden, frågor, aktiviteter).

Avsiktligt mindre mäktig än fri CRUD: skapar/raderar inte dialoger eller organisationer,
bara mätvärden för befintliga (skapade via HME-importen/seeden). Endast öppen, publik,
fiktiv data — samma dataregel som resten av tjänsten.
"""

from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Activity,
    Dialogue,
    KpiArea,
    Measurement,
    Organisation,
    Question,
)
from app.schemas import AdminMeasurementIn

# Fält som måste finnas när ett mätvärde skapas från grunden (övriga har defaultvärden).
PAKRAVDA_VID_NYSKAPANDE = {"value_text", "value_num", "target_text", "target_num", "status"}

# Defaultvärden för NOT NULL-kolumner utan DB-default (sätts om de inte anges).
SKAPA_DEFAULTS: dict = {
    "unit": "",
    "bar_max": 100.0,
    "trend_dir": None,
    "trend_good": None,
    "trend_text": "",
    "interpretation": "",
    "details": None,
}


async def read_state(session: AsyncSession) -> dict:
    """Nulägesbild för diagnos: alla nyckeltal (även obsoleta) + mätvärden per dialog."""
    areas = (
        await session.execute(select(KpiArea).order_by(KpiArea.ordning, KpiArea.id))
    ).scalars().all()

    counts = dict(
        (
            await session.execute(
                select(Measurement.kpi_area_id, func.count()).group_by(Measurement.kpi_area_id)
            )
        ).all()
    )

    dialogues = (
        await session.execute(
            select(Dialogue)
            .order_by(Dialogue.id)
            .options(
                selectinload(Dialogue.organisation),
                selectinload(Dialogue.measurements).selectinload(Measurement.kpi_area),
            )
        )
    ).scalars().all()

    return {
        "kpi_areas": [
            {
                "key": a.key,
                "namn": a.namn,
                "ordning": a.ordning,
                "measurement_count": counts.get(a.id, 0),
            }
            for a in areas
        ],
        "dialogues": [
            {
                "id": d.id,
                "organisation": d.organisation.namn,
                "slug": d.organisation.slug,
                "period": d.period,
                "status": d.status,
                "measurements": sorted(
                    (
                        {
                            "kpi_key": m.kpi_area.key,
                            "value_text": m.value_text,
                            "value_num": m.value_num,
                            "unit": m.unit,
                            "target_text": m.target_text,
                            "status": m.status.value,
                            "trend_text": m.trend_text,
                        }
                        for m in d.measurements
                    ),
                    key=lambda x: x["kpi_key"],
                ),
            }
            for d in dialogues
        ],
    }


async def _resolve_dialogue(session: AsyncSession, forvaltning: str) -> Dialogue | None:
    """Hitta dialogen för en förvaltning, via org-slug eller org-namn."""
    org = (
        await session.execute(select(Organisation).filter_by(slug=forvaltning))
    ).scalar_one_or_none()
    if org is None:
        org = (
            await session.execute(select(Organisation).filter_by(namn=forvaltning))
        ).scalar_one_or_none()
    if org is None:
        return None
    return (
        await session.execute(select(Dialogue).filter_by(organisation_id=org.id))
    ).scalars().first()


async def upsert_kpi(session: AsyncSession, key: str, rader: list[AdminMeasurementIn]) -> dict:
    """Upserta mätvärden för nyckeltal `key` över angivna förvaltningar.

    PATCH-semantik: endast fält som anges i en rad ändras på befintliga mätvärden.
    Saknas mätvärdet skapas det — då krävs PAKRAVDA_VID_NYSKAPANDE. Höjer LookupError
    om nyckeltalet inte finns.
    """
    area = (await session.execute(select(KpiArea).filter_by(key=key))).scalar_one_or_none()
    if area is None:
        raise LookupError(f"Okänt nyckeltal: {key!r}")

    skapade = uppdaterade = hoppade_over = 0
    resultat: list[dict] = []

    for rad in rader:
        data = rad.model_dump(exclude_unset=True)
        data.pop("forvaltning", None)

        dialogue = await _resolve_dialogue(session, rad.forvaltning)
        if dialogue is None:
            resultat.append({"forvaltning": rad.forvaltning, "atgard": "ingen_dialog_eller_org"})
            hoppade_over += 1
            continue

        m = (
            await session.execute(
                select(Measurement).filter_by(dialogue_id=dialogue.id, kpi_area_id=area.id)
            )
        ).scalar_one_or_none()

        if m is None:
            saknas = PAKRAVDA_VID_NYSKAPANDE - set(data)
            if saknas:
                resultat.append(
                    {
                        "forvaltning": rad.forvaltning,
                        "atgard": "ofullstandig_for_nyskapande",
                        "saknar": sorted(saknas),
                    }
                )
                hoppade_over += 1
                continue
            fields = {**SKAPA_DEFAULTS, **data}
            session.add(Measurement(dialogue_id=dialogue.id, kpi_area_id=area.id, **fields))
            skapade += 1
            resultat.append({"forvaltning": rad.forvaltning, "atgard": "skapad"})
        else:
            for fält, värde in data.items():
                setattr(m, fält, värde)
            uppdaterade += 1
            resultat.append(
                {"forvaltning": rad.forvaltning, "atgard": "uppdaterad", "andrade": sorted(data)}
            )

    await session.commit()
    return {
        "kpi": key,
        "skapade": skapade,
        "uppdaterade": uppdaterade,
        "hoppade_over": hoppade_over,
        "rader": resultat,
    }


async def prune_kpi_area(session: AsyncSession, key: str, dry_run: bool = False) -> dict:
    """Ta bort ett obsolet nyckeltal och all dess data (mätvärden, frågor, aktiviteter).

    Med dry_run=True görs ingen radering — bara en sammanfattning av vad som skulle tas bort.
    Höjer LookupError om nyckeltalet inte finns.
    """
    area = (await session.execute(select(KpiArea).filter_by(key=key))).scalar_one_or_none()
    if area is None:
        raise LookupError(f"Okänt nyckeltal: {key!r}")

    async def _count(model) -> int:
        return (
            await session.execute(
                select(func.count()).select_from(model).filter_by(kpi_area_id=area.id)
            )
        ).scalar_one()

    sammanfattning = {
        "key": key,
        "namn": area.namn,
        "matvarden": await _count(Measurement),
        "fragor": await _count(Question),
        "aktiviteter": await _count(Activity),
        "dry_run": dry_run,
    }

    if dry_run:
        sammanfattning["borttaget"] = False
        return sammanfattning

    await session.execute(delete(Activity).where(Activity.kpi_area_id == area.id))
    await session.execute(delete(Measurement).where(Measurement.kpi_area_id == area.id))
    await session.execute(delete(Question).where(Question.kpi_area_id == area.id))
    await session.delete(area)
    await session.commit()

    sammanfattning["borttaget"] = True
    return sammanfattning
