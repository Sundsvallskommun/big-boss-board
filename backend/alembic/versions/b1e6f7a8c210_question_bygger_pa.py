"""dialogfrågans ursprung (`bygger_pa`) på question

Flera dialogfrågor är härledda ur en påstående i medarbetarenkäten — frågan är vad
chefen ska prata om, påståendet är vad medarbetarna faktiskt svarat på. Att klämma in
båda i `text` gör kortet till en vägg av text; med en egen kolumn kan gränssnittet
visa dem med olika tyngd. Nullable: de flesta frågor saknar ett sådant ursprung.

Revision ID: b1e6f7a8c210
Revises: a0d5e6f7b109
Create Date: 2026-08-14 10:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1e6f7a8c210"
down_revision: str | None = "a0d5e6f7b109"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("question", sa.Column("bygger_pa", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("question", "bygger_pa")
