"""measurement: details (JSONB) + nullbar trend

Lägger till en valfri ``details``-kolumn (JSONB) för nedbrytningar som HME:s
delindex + chef/medarbetare-segment, och gör trend-fälten nullbara så ett
nyckeltal kan visas utan trend när jämförelseperiod saknas.

Revision ID: 2b9d1c4e7a01
Revises: 1fa856b3969a
Create Date: 2026-06-24 09:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '2b9d1c4e7a01'
down_revision: str | None = '1fa856b3969a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('measurement', sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.alter_column('measurement', 'trend_dir', existing_type=sa.Enum('up', 'down', name='trend_dir'), nullable=True)
    op.alter_column('measurement', 'trend_good', existing_type=sa.Boolean(), nullable=True)


def downgrade() -> None:
    op.alter_column('measurement', 'trend_good', existing_type=sa.Boolean(), nullable=False)
    op.alter_column('measurement', 'trend_dir', existing_type=sa.Enum('up', 'down', name='trend_dir'), nullable=False)
    op.drop_column('measurement', 'details')
