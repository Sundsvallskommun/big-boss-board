"""Läs-API för dialoger."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models import Agreement, Dialogue, KpiArea, Measurement, SupportFunction
from app.schemas import DialogueArea, DialogueDetail, DialogueSummary

router = APIRouter(prefix="/api/dialogues", tags=["dialogues"])


def _kpi_area_loader():
    return (
        selectinload(KpiArea.support_function).selectinload(SupportFunction.tools),
        selectinload(KpiArea.questions),
    )


@router.get("", response_model=list[DialogueSummary])
async def list_dialogues(session: AsyncSession = Depends(get_session)) -> list[DialogueSummary]:
    """Lista dialoger med org, chef, period, status och progress."""
    dialogues = (
        (
            await session.execute(
                select(Dialogue).options(
                    selectinload(Dialogue.organisation),
                    selectinload(Dialogue.ansvarig_chef),
                    selectinload(Dialogue.measurements),
                    selectinload(Dialogue.agreements),
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
            progress_total=len(d.measurements),
            progress_done=sum(1 for a in d.agreements if a.genomgangen),
        )
        for d in dialogues
    ]


@router.get("/{dialogue_id}", response_model=DialogueDetail)
async def get_dialogue(
    dialogue_id: int, session: AsyncSession = Depends(get_session)
) -> DialogueDetail:
    """Full dialog: områden + mätvärden + verktyg + frågor + överenskommelser.

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
                selectinload(Dialogue.agreements),
            )
        )
    ).scalar_one_or_none()

    if dialogue is None:
        raise HTTPException(status_code=404, detail="Dialogen hittades inte.")

    agreements_by_area: dict[int, Agreement] = {
        a.kpi_area_id: a for a in dialogue.agreements
    }

    measurements = sorted(dialogue.measurements, key=lambda m: m.kpi_area.ordning)
    areas = [
        DialogueArea(
            area=m.kpi_area,
            measurement=m,
            agreement=agreements_by_area.get(m.kpi_area_id),
        )
        for m in measurements
    ]

    return DialogueDetail(
        id=dialogue.id,
        period=dialogue.period,
        status=dialogue.status,
        skapad_at=dialogue.skapad_at,
        organisation=dialogue.organisation,
        ansvarig_chef=dialogue.ansvarig_chef,
        areas=areas,
        progress_total=len(measurements),
        progress_done=sum(1 for a in dialogue.agreements if a.genomgangen),
    )
