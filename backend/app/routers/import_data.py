"""Autentiserad dataimport (maskin-till-maskin).

Nås publikt via frontend-proxyn (`/api/*`) men kräver dedikerat import-token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_import_token
from app.db import get_session
from app.schemas import (
    EkonomiCsvSerie,
    EkonomiImport,
    EkonomiRapport,
    EkonomiResultat,
    HmeImport,
    ImportResultat,
    SjukImport,
    SjukResultat,
)
from app.services.ekonomi_import import (
    csv_to_payload,
    csvs_to_serie_payload,
    import_ekonomi,
    report_to_payload,
)
from app.services.hme_import import import_hme
from app.services.sjukfranvaro_import import csv_to_payload as sjuk_csv_to_payload
from app.services.sjukfranvaro_import import import_sjukfranvaro

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/hme", response_model=ImportResultat, dependencies=[Depends(require_import_token)])
async def import_hme_endpoint(
    payload: HmeImport,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upserta HME per förvaltning (flerårig serie → senaste värde + trend + historik)."""
    return await import_hme(session, payload)


@router.post("/ekonomi", response_model=EkonomiResultat, dependencies=[Depends(require_import_token)])
async def import_ekonomi_endpoint(
    rapport: EkonomiRapport,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upserta ekonomi per förvaltning ur den råa resultaträkningsrapporten (long-format)."""
    payload = EkonomiImport(**report_to_payload(rapport.model_dump()))
    return await import_ekonomi(session, payload)


@router.post("/ekonomi-csv", response_model=EkonomiResultat, dependencies=[Depends(require_import_token)])
async def import_ekonomi_csv_endpoint(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upserta ekonomi från Qlik CSV-export (Period,Enhet,Mått,Kolumn,Mätvärde). Rå CSV i body."""
    text = (await request.body()).decode("utf-8-sig")
    try:
        payload = EkonomiImport(**csv_to_payload(text))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return await import_ekonomi(session, payload)


@router.post("/ekonomi-serie", response_model=EkonomiResultat, dependencies=[Depends(require_import_token)])
async def import_ekonomi_serie_endpoint(
    body: EkonomiCsvSerie,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upserta ekonomi ur flera CSV-perioder → månadsserie per förvaltning.

    `perioder`: en rå CSV-text per rapportperiod (senaste, mest kompletta dagsuttaget).
    Senaste perioden blir kortets huvudvärde; serien ritas i nettokostnadsdiagrammet.
    """
    try:
        payload = EkonomiImport(**csvs_to_serie_payload(body.perioder, body.kalla))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return await import_ekonomi(session, payload)


@router.post("/sjukfranvaro-csv", response_model=SjukResultat, dependencies=[Depends(require_import_token)])
async def import_sjukfranvaro_csv_endpoint(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upserta sjukfrånvaro från personal-CSV (Period,Enhet,Mått,Kolumn,Mätvärde). Rå CSV i body."""
    text = (await request.body()).decode("utf-8-sig")
    try:
        payload = SjukImport(**sjuk_csv_to_payload(text))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return await import_sjukfranvaro(session, payload)
