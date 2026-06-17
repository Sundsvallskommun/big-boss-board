"""Skriv-API för överenskommelser och genomgången-status.

Överenskommelsen är unik per (dialog, område) och skapas lazy via upsert.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Agreement, Dialogue, KpiArea
from app.schemas import AgreementOut, AgreementUpsert, AreaReviewPatch

router = APIRouter(tags=["agreements"])


async def _get_or_create_agreement(
    session: AsyncSession, dialogue_id: int, area_id: int
) -> Agreement:
    """Hämta överenskommelsen för (dialog, område) eller skapa en tom."""
    if await session.get(Dialogue, dialogue_id) is None:
        raise HTTPException(status_code=404, detail="Dialogen hittades inte.")
    if await session.get(KpiArea, area_id) is None:
        raise HTTPException(status_code=404, detail="Området hittades inte.")

    agreement = (
        await session.execute(
            select(Agreement).where(
                Agreement.dialogue_id == dialogue_id,
                Agreement.kpi_area_id == area_id,
            )
        )
    ).scalar_one_or_none()

    if agreement is None:
        agreement = Agreement(dialogue_id=dialogue_id, kpi_area_id=area_id)
        session.add(agreement)

    return agreement


@router.post(
    "/api/dialogues/{dialogue_id}/areas/{area_id}/agreement",
    response_model=AgreementOut,
)
async def upsert_agreement(
    dialogue_id: int,
    area_id: int,
    body: AgreementUpsert,
    session: AsyncSession = Depends(get_session),
) -> Agreement:
    """Skapa eller uppdatera överenskommelsen för ett område i en dialog."""
    agreement = await _get_or_create_agreement(session, dialogue_id, area_id)
    agreement.text = body.text
    agreement.ansvarig = body.ansvarig
    agreement.klart_senast = body.klart_senast
    await session.commit()
    await session.refresh(agreement)
    return agreement


@router.put("/api/agreements/{agreement_id}", response_model=AgreementOut)
async def update_agreement(
    agreement_id: int,
    body: AgreementUpsert,
    session: AsyncSession = Depends(get_session),
) -> Agreement:
    """Uppdatera en befintlig överenskommelse via id."""
    agreement = await session.get(Agreement, agreement_id)
    if agreement is None:
        raise HTTPException(status_code=404, detail="Överenskommelsen hittades inte.")
    agreement.text = body.text
    agreement.ansvarig = body.ansvarig
    agreement.klart_senast = body.klart_senast
    await session.commit()
    await session.refresh(agreement)
    return agreement


@router.patch("/api/dialogues/{dialogue_id}/areas/{area_id}", response_model=AgreementOut)
async def patch_area_review(
    dialogue_id: int,
    area_id: int,
    body: AreaReviewPatch,
    session: AsyncSession = Depends(get_session),
) -> Agreement:
    """Markera ett område som genomgånget eller ångra."""
    agreement = await _get_or_create_agreement(session, dialogue_id, area_id)
    agreement.genomgangen = body.genomgangen
    await session.commit()
    await session.refresh(agreement)
    return agreement
