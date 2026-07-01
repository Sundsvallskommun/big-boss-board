"""Inkorgen: inkomna synpunkter/frågor/aktiviteter från projektdeltagare.

Publik create (gatad av access-koden i frontend-middleware) + token-skyddad
admin-läsning/triage. Posterna hålls i en egen kö, skild från de kurerade
kolumnerna på status-sidan — arbetsgruppen knådar och publicerar manuellt.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Submission

# Maxlängd på en inlämning (skydd mot oavsiktliga jättetexter/missbruk).
MAX_LEN = 4000

# Giltiga triage-lägen. "ny" är default vid inlämning.
ALLOWED_STATUS = {"ny", "granskad", "publicerad", "arkiverad"}


async def create_submission(session: AsyncSession, text: str) -> Submission:
    """Skapa en inlämning ur fri text. Kastar ValueError vid tom/för lång text."""
    rensad = text.strip()
    if not rensad:
        raise ValueError("Texten saknas.")
    if len(rensad) > MAX_LEN:
        raise ValueError(f"Texten är för lång (max {MAX_LEN} tecken).")
    sub = Submission(text=rensad)
    session.add(sub)
    await session.commit()
    await session.refresh(sub)
    return sub


async def list_submissions(
    session: AsyncSession, status: str | None = None
) -> list[Submission]:
    """Lista inlämningar, nyast först. Filtrera valfritt på status."""
    stmt = select(Submission).order_by(Submission.skapad_at.desc())
    if status:
        stmt = stmt.where(Submission.status == status)
    return list((await session.execute(stmt)).scalars().all())


async def update_submission(
    session: AsyncSession,
    submission_id: int,
    status: str | None,
    notering: str | None,
) -> Submission:
    """Triagera en inlämning: sätt status och/eller notering (endast angivna fält).

    Kastar LookupError om id saknas, ValueError vid ogiltig status.
    """
    sub = await session.get(Submission, submission_id)
    if sub is None:
        raise LookupError("Inlämningen hittades inte.")
    if status is not None:
        if status not in ALLOWED_STATUS:
            raise ValueError(
                f"Ogiltig status '{status}'. Tillåtna: {', '.join(sorted(ALLOWED_STATUS))}."
            )
        sub.status = status
    if notering is not None:
        sub.notering = notering.strip() or None
    sub.uppdaterad_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(sub)
    return sub
