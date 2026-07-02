"""Läs-API för dialoger."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models import Activity, Dialogue, KpiArea, Measurement, SupportFunction
from app.schemas import DialogueArea, DialogueDetail, DialogueSummary

router = APIRouter(prefix="/api/dialogues", tags=["dialogues"])


def _kpi_area_loader():
    return (
        selectinload(KpiArea.support_function).selectinload(SupportFunction.tools),
        selectinload(KpiArea.questions),
    )


@router.get("", response_model=list[DialogueSummary])
async def list_dialogues(session: AsyncSession = Depends(get_session)) -> list[DialogueSummary]:
    """Lista dialoger med org, chef, period och status."""
    dialogues = (
        (
            await session.execute(
                select(Dialogue).options(
                    selectinload(Dialogue.organisation),
                    selectinload(Dialogue.ansvarig_chef),
                )
            )
        )
        .scalars()
        .all()
    )

    return [
        DialogueSummary(
            id=d.id,
            period=d.period,
            status=d.status,
            organisation=d.organisation,
            ansvarig_chef=d.ansvarig_chef,
        )
        for d in dialogues
    ]


@router.get("/{dialogue_id}", response_model=DialogueDetail)
async def get_dialogue(
    dialogue_id: int, session: AsyncSession = Depends(get_session)
) -> DialogueDetail:
    """Full dialog: områden + mätvärden + verktyg + frågor + aktiviteter.

    Detta är det enda anrop frontend behöver för dashboarden.
    """
    dialogue = (
        await session.execute(
            select(Dialogue)
            .where(Dialogue.id == dialogue_id)
            .options(
                selectinload(Dialogue.organisation),
                selectinload(Dialogue.ansvarig_chef),
                selectinload(Dialogue.measurements)
                .selectinload(Measurement.kpi_area)
                .options(*_kpi_area_loader()),
                selectinload(Dialogue.activities),
            )
        )
    ).scalar_one_or_none()

    if dialogue is None:
        raise HTTPException(status_code=404, detail="Dialogen hittades inte.")

    # Aktiviteter per område, äldst först (skapad-ordning).
    activities_by_area: dict[int, list[Activity]] = {}
    for act in sorted(dialogue.activities, key=lambda a: a.id):
        activities_by_area.setdefault(act.kpi_area_id, []).append(act)

    # Alla KPI-områden returneras — även de utan mätvärde (BYGGPLAN §17: nyckeltal som
    # följs upp genom dialogfrågor i stället för siffror). measurement = None då.
    all_areas = (
        await session.execute(
            select(KpiArea).options(*_kpi_area_loader()).order_by(KpiArea.ordning)
        )
    ).scalars().all()
    meas_by_area = {m.kpi_area_id: m for m in dialogue.measurements}
    areas = [
        DialogueArea(
            area=area,
            measurement=meas_by_area.get(area.id),
            activities=activities_by_area.get(area.id, []),
        )
        for area in all_areas
    ]

    return DialogueDetail(
        id=dialogue.id,
        period=dialogue.period,
        status=dialogue.status,
        skapad_at=dialogue.skapad_at,
        organisation=dialogue.organisation,
        ansvarig_chef=dialogue.ansvarig_chef,
        areas=areas,
    )
