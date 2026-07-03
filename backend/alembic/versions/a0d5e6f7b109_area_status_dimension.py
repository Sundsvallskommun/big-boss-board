"""underdimension på area_status (Verksamhet: grunduppdrag/fullmäktigemål, BYGGPLAN §16)

Lägger en valfri kolumn `dimension` på area_status. För Verksamhet delas den manuella
statusen i två dimensioner ("grunduppdrag"/"fullmaktigemal") med var sin historik; None
för nyckeltal med en enda status (Digital, Kommunikativt).

Revision ID: a0d5e6f7b109
Revises: 9c4d5e6f7a08
Create Date: 2026-07-03 11:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a0d5e6f7b109"
down_revision: str | None = "9c4d5e6f7a08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("area_status", sa.Column("dimension", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("area_status", "dimension")
