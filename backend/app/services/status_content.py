"""Status-sidans kurerade kort (Fas B): frågor + statusrapporter i DB.

Skild från inkorgen (`submission`): en submission triageras och publiceras manuellt
som ett `StatusFraga`-kort. Publikt läses endast publicerade kort; skrivning sker via
de token-skyddade admin-endpointerna. Endast öppen och publik information.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Statusrapport, StatusFraga, Submission
from app.schemas import (
    StatusFragaCreate,
    StatusFragaUpdate,
    StatusrapportCreate,
    StatusrapportUpdate,
)


async def list_published(session: AsyncSession) -> dict:
    """Publicerade frågor (ordning, nummer) + publicerade rapporter (nyast först)."""
    fragor = (
        await session.execute(
            select(StatusFraga)
            .where(StatusFraga.publicerad.is_(True))
            .order_by(StatusFraga.ordning, StatusFraga.nummer)
        )
    ).scalars().all()
    rapporter = (
        await session.execute(
            select(Statusrapport)
            .where(Statusrapport.publicerad.is_(True))
            .order_by(Statusrapport.datum.desc())
        )
    ).scalars().all()
    return {"fragor": list(fragor), "rapporter": list(rapporter)}


async def list_all_fragor(session: AsyncSession) -> list[StatusFraga]:
    """Alla frågekort (även opublicerade) — för admin-läsning/diagnos."""
    return list(
        (
            await session.execute(
                select(StatusFraga).order_by(StatusFraga.ordning, StatusFraga.nummer)
            )
        ).scalars().all()
    )


async def next_nummer(session: AsyncSession) -> int:
    """Nästa lediga publika "#N" (max+1, återanvänds aldrig)."""
    hogsta = (await session.execute(select(func.max(StatusFraga.nummer)))).scalar()
    return (hogsta or 0) + 1


async def create_fraga(session: AsyncSession, data: StatusFragaCreate) -> StatusFraga:
    """Skapa ett frågekort. Vid `submission_id` markeras källan som 'publicerad'."""
    fields = data.model_dump()
    submission_id = fields.pop("submission_id", None)
    fraga = StatusFraga(nummer=await next_nummer(session), submission_id=submission_id, **fields)
    if fraga.publicerad:
        fraga.publicerad_at = datetime.now(timezone.utc)
    session.add(fraga)
    if submission_id is not None:
        sub = await session.get(Submission, submission_id)
        if sub is not None:
            sub.status = "publicerad"
            sub.uppdaterad_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(fraga)
    return fraga


async def update_fraga(
    session: AsyncSession, fraga_id: int, data: StatusFragaUpdate
) -> StatusFraga:
    """PATCH: endast angivna fält ändras. Kastar LookupError om id saknas."""
    fraga = await session.get(StatusFraga, fraga_id)
    if fraga is None:
        raise LookupError("Frågekortet hittades inte.")
    changes = data.model_dump(exclude_unset=True)
    var_publicerad = fraga.publicerad
    for falt, varde in changes.items():
        setattr(fraga, falt, varde)
    fraga.uppdaterad_at = datetime.now(timezone.utc)
    if changes.get("publicerad") and not var_publicerad:
        fraga.publicerad_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(fraga)
    return fraga


async def delete_fraga(session: AsyncSession, fraga_id: int) -> None:
    """Ta bort ett frågekort. Kastar LookupError om id saknas."""
    fraga = await session.get(StatusFraga, fraga_id)
    if fraga is None:
        raise LookupError("Frågekortet hittades inte.")
    await session.delete(fraga)
    await session.commit()


async def create_rapport(session: AsyncSession, data: StatusrapportCreate) -> Statusrapport:
    rapport = Statusrapport(**data.model_dump())
    session.add(rapport)
    await session.commit()
    await session.refresh(rapport)
    return rapport


async def update_rapport(
    session: AsyncSession, rapport_id: int, data: StatusrapportUpdate
) -> Statusrapport:
    rapport = await session.get(Statusrapport, rapport_id)
    if rapport is None:
        raise LookupError("Statusrapporten hittades inte.")
    for falt, varde in data.model_dump(exclude_unset=True).items():
        setattr(rapport, falt, varde)
    rapport.uppdaterad_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(rapport)
    return rapport
