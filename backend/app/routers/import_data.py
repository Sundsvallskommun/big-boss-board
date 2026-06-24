"""Autentiserad dataimport (maskin-till-maskin).

Nås publikt via frontend-proxyn (`/api/*`) men kräver dedikerat import-token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_import_token
from app.db import get_session
from app.schemas import HmeImport, ImportResultat
from app.services.hme_import import import_hme

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/hme", response_model=ImportResultat, dependencies=[Depends(require_import_token)])
async def import_hme_endpoint(
    payload: HmeImport,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upserta HME per förvaltning (flerårig serie → senaste värde + trend + historik)."""
    return await import_hme(session, payload)
