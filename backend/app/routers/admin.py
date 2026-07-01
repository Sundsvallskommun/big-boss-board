"""Avgränsad data-administration (maskin-till-maskin).

Nås publikt via frontend-proxyn (`/api/*`) men kräver samma import-token som
HME-importen (`IMPORT_TOKEN` i env). Avsiktligt smal yta: läs nuläge, upserta
mätvärden per nyckeltal, rensa obsolet nyckeltal. Inga personuppgifter — endast
öppen och publik (fiktiv) data, samma dataregel som resten av tjänsten.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_import_token
from app.db import get_session
from app.models import Submission
from app.schemas import AdminKpiUpsert, SubmissionOut, SubmissionUpdate
from app.services.admin_data import prune_kpi_area, read_state, upsert_kpi
from app.services.submissions import list_submissions, update_submission

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_import_token)],
)


@router.get("/state")
async def get_state(session: AsyncSession = Depends(get_session)) -> dict:
    """Nulägesbild för diagnos: alla nyckeltal (även obsoleta) + mätvärden per dialog."""
    return await read_state(session)


@router.post("/kpi/{key}")
async def upsert_kpi_endpoint(
    key: str,
    payload: AdminKpiUpsert,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upserta mätvärden för nyckeltal `key` över förvaltningar (PATCH per rad)."""
    try:
        return await upsert_kpi(session, key, payload.rader)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/kpi/{key}")
async def prune_kpi_endpoint(
    key: str,
    dry_run: bool = False,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Ta bort ett obsolet nyckeltal + dess data. `?dry_run=true` visar bara omfattning."""
    try:
        return await prune_kpi_area(session, key, dry_run=dry_run)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ---- Inkorg (intake): läs och triagera inkomna inlämningar ---------------


@router.get("/submissions", response_model=list[SubmissionOut])
async def list_submissions_endpoint(
    status_filter: str | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_session),
) -> list[Submission]:
    """Lista inkomna inlämningar (nyast först). Filtrera valfritt på `?status=ny`."""
    return await list_submissions(session, status_filter)


@router.patch("/submissions/{submission_id}", response_model=SubmissionOut)
async def update_submission_endpoint(
    submission_id: int,
    payload: SubmissionUpdate,
    session: AsyncSession = Depends(get_session),
) -> Submission:
    """Triagera en inlämning: sätt status (ny/granskad/publicerad/arkiverad) och/eller notering."""
    try:
        return await update_submission(session, submission_id, payload.status, payload.notering)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
