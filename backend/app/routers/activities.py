"""Skriv-API för aktiviteter/åtgärder.

Flera aktiviteter per (dialog, område). Chefen lägger till fri text och
klarrapporterar med en kort notering.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Activity, Dialogue, KpiArea
from app.schemas import ActivityCreate, ActivityKlar, ActivityOut

router = APIRouter(tags=["activities"])


@router.post(
    "/api/dialogues/{dialogue_id}/areas/{area_id}/activities",
    response_model=ActivityOut,
    status_code=201,
)
async def create_activity(
    dialogue_id: int,
    area_id: int,
    body: ActivityCreate,
    session: AsyncSession = Depends(get_session),
) -> Activity:
    """Lägg till en aktivitet i ett område. Endast fri text."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Aktiviteten saknar text.")
    if await session.get(Dialogue, dialogue_id) is None:
        raise HTTPException(status_code=404, detail="Dialogen hittades inte.")
    if await session.get(KpiArea, area_id) is None:
        raise HTTPException(status_code=404, detail="Området hittades inte.")

    activity = Activity(dialogue_id=dialogue_id, kpi_area_id=area_id, text=text)
    session.add(activity)
    await session.commit()
    await session.refresh(activity)
    return activity


@router.post("/api/activities/{activity_id}/klar", response_model=ActivityOut)
async def mark_activity_klar(
    activity_id: int,
    body: ActivityKlar,
    session: AsyncSession = Depends(get_session),
) -> Activity:
    """Klarrapportera en aktivitet med en kort notering."""
    activity = await session.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Aktiviteten hittades inte.")
    activity.klar = True
    activity.klar_notering = body.notering.strip()
    activity.klar_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(activity)
    return activity
