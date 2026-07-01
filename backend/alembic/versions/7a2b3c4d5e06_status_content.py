"""status-innehåll i DB: status_fraga + statusrapport (Fas B)

Flyttar status-sidans kort från hårdkodad frontend-fil (data.ts) till databasen,
så att inkorgen (submission) kan triageras och publiceras som kort via API.
Kurerade kort skapas/redigeras via /api/admin/status-cards och /api/admin/status-rapporter
och läses publikt via /api/status-cards (endast publicerade).

Revision ID: 7a2b3c4d5e06
Revises: 6f4a1b2c8d05
Create Date: 2026-07-01 13:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = "7a2b3c4d5e06"
down_revision: str | None = "6f4a1b2c8d05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "status_fraga",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nummer", sa.Integer(), nullable=False),
        sa.Column("kategori", sa.String(length=32), server_default="fraga", nullable=False),
        sa.Column("fraga", sa.Text(), nullable=False),
        sa.Column("bakgrund", sa.Text(), nullable=True),
        sa.Column("svar", sa.Text(), nullable=True),
        sa.Column("forum", sa.String(length=200), nullable=True),
        sa.Column("datum", sa.String(length=32), nullable=True),
        sa.Column("forslag", sa.Text(), nullable=True),
        sa.Column("mer", JSONB(), nullable=True),
        sa.Column("ordning", sa.Integer(), server_default="0", nullable=False),
        sa.Column("publicerad", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=True),
        sa.Column("skapad_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("uppdaterad_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("publicerad_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["submission_id"], ["submission.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_status_fraga_nummer", "status_fraga", ["nummer"], unique=True)
    op.create_index("ix_status_fraga_publicerad", "status_fraga", ["publicerad"])

    op.create_table(
        "statusrapport",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("datum", sa.String(length=32), nullable=False),
        sa.Column("rubrik", sa.String(length=300), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("punkter", JSONB(), nullable=True),
        sa.Column("ordning", sa.Integer(), server_default="0", nullable=False),
        sa.Column("publicerad", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("skapad_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("uppdaterad_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_statusrapport_publicerad", "statusrapport", ["publicerad"])


def downgrade() -> None:
    op.drop_index("ix_statusrapport_publicerad", table_name="statusrapport")
    op.drop_table("statusrapport")
    op.drop_index("ix_status_fraga_publicerad", table_name="status_fraga")
    op.drop_index("ix_status_fraga_nummer", table_name="status_fraga")
    op.drop_table("status_fraga")
