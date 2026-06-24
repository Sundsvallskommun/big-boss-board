"""kpi_area: valfri info-faktaruta

Lägger till en valfri ``info``-kolumn på kpi_area för en faktaruta om nyckeltalet
(tolkningshjälp/datakvalitet) som visas i dialogpanelen.

Revision ID: 3c1e8f5a2b14
Revises: 2b9d1c4e7a01
Create Date: 2026-06-24 10:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c1e8f5a2b14'
down_revision: str | None = '2b9d1c4e7a01'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('kpi_area', sa.Column('info', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('kpi_area', 'info')
