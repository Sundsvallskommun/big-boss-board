"""Läs-API för referensdata (KPI-områden med stödfunktion, verktyg och frågor)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models import KpiArea, SupportFunction
from app.schemas import KpiAreaOut

router = APIRouter(prefix="/api/kpi-areas", tags=["reference"])


@router.get("", response_model=list[KpiAreaOut])
async def list_kpi_areas(session: AsyncSession = Depends(get_session)) -> list[KpiArea]:
    """Områden i ordning, med stödfunktion (inkl. verktyg) och samtalsstöd."""
    result = await session.execute(
        select(KpiArea)
        .order_by(KpiArea.ordning)
        .options(
            selectinload(KpiArea.support_function).selectinload(SupportFunction.tools),
            selectinload(KpiArea.questions),
        )
    )
    return list(result.scalars().all())
