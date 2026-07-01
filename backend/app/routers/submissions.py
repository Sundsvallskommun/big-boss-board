"""Publikt skriv-API för inkorgen (inkomna synpunkter/frågor/aktiviteter).

Gatas av access-koden i frontend-middleware (samma som resten av UI:t). Ingen
maskin-token — projektdeltagare lämnar in fri text. Arbetsgruppen läser och
triagerar via de token-skyddade /api/admin/submissions-endpointerna.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Submission
from app.schemas import SubmissionCreate, SubmissionOut
from app.services.submissions import create_submission

router = APIRouter(tags=["submissions"])


@router.post("/api/submissions", response_model=SubmissionOut, status_code=201)
async def post_submission(
    body: SubmissionCreate,
    session: AsyncSession = Depends(get_session),
) -> Submission:
    """Ta emot en inlämning (fri text) och lägg den i inkorgen."""
    try:
        return await create_submission(session, body.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
