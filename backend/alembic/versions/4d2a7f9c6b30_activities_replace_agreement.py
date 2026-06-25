"""ersätt agreement med activity

Tar bort överenskommelse-/genomgången-modellen och inför aktiviteter (flera per
dialog+område, med klar-status och klarnotering).

Revision ID: 4d2a7f9c6b30
Revises: 3c1e8f5a2b14
Create Date: 2026-06-24 12:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d2a7f9c6b30'
down_revision: str | None = '3c1e8f5a2b14'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'activity',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dialogue_id', sa.Integer(), nullable=False),
        sa.Column('kpi_area_id', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('klar', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('klar_notering', sa.Text(), nullable=True),
        sa.Column('skapad_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('klar_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['dialogue_id'], ['dialogue.id'], ),
        sa.ForeignKeyConstraint(['kpi_area_id'], ['kpi_area.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.drop_table('agreement')


def downgrade() -> None:
    op.create_table(
        'agreement',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dialogue_id', sa.Integer(), nullable=False),
        sa.Column('kpi_area_id', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('ansvarig', sa.String(length=200), nullable=False),
        sa.Column('klart_senast', sa.Date(), nullable=True),
        sa.Column('genomgangen', sa.Boolean(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['dialogue_id'], ['dialogue.id'], ),
        sa.ForeignKeyConstraint(['kpi_area_id'], ['kpi_area.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('dialogue_id', 'kpi_area_id', name='uq_agreement_area'),
    )
    op.drop_table('activity')
