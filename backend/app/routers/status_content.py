"""Publikt läs-API för status-sidans kort (Fas B).

Returnerar endast PUBLICERADE frågor + statusrapporter. Skrivning (skapa/redigera/
publicera) sker via de token-skyddade /api/admin/status-cards|status-rapporter.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.schemas import StatusContentOut
from app.services.status_content import list_published

router = APIRouter(prefix="/api/status-cards", tags=["status"])


@router.get("", response_model=StatusContentOut)
async def get_status_cards(session: AsyncSession = Depends(get_session)) -> dict:
    """Publicerade frågor + statusrapporter — allt status-sidan behöver i ett anrop."""
    return await list_published(session)
