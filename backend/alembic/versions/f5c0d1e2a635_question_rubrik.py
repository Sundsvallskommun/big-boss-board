"""`rubrik` på question — kort etikett över dialogfrågan

Verksamhetsområdets nya frågor kommer i par: en kort rubrik som säger vad frågan
handlar om ("Uppdraget", "Risker och avvikelser") och själva frågan under. Rubriken
är inte en del av frågan — klämd in i `text` blir den antingen en mening som inte är
en fråga, eller ett kolon mitt i den feta frågetexten.

Nullable: de flesta frågor har ingen rubrik och renderas precis som förut. Fältet är
skilt från `bygger_pa`, som bär påståendet ur medarbetarenkäten en fråga är härledd
ur — det står under frågan, rubriken står över.

Revision ID: f5c0d1e2a635
Revises: e4b9c0d1f524
Create Date: 2026-09-01 09:10:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f5c0d1e2a635"
down_revision: str | None = "e4b9c0d1f524"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("question", sa.Column("rubrik", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("question", "rubrik")
