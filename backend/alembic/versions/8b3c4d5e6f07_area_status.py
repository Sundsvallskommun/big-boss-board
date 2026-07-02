"""manuell status per dialog + område (area_status, BYGGPLAN §16)

Lagrar en manuellt satt status (grön/gul/röd) + valfri kommentar per förvaltning
(dialog) för nyckeltal utan mätdata (Verksamhet, Kommunikativt ledarskap, Digital
transformation). En rad per (dialog, område) — upsertas via
PUT /api/dialogues/{id}/areas/{area_id}/status.

Revision ID: 8b3c4d5e6f07
Revises: 7a2b3c4d5e06
Create Date: 2026-07-02 14:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "8b3c4d5e6f07"
down_revision: str | None = "7a2b3c4d5e06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "area_status",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dialogue_id", sa.Integer(), nullable=False),
        sa.Column("kpi_area_id", sa.Integer(), nullable=False),
        # Återanvänder den befintliga PG-enumen "status" (skapades i initial-migreringen).
        sa.Column(
            "status",
            postgresql.ENUM("good", "warn", "alert", name="status", create_type=False),
            nullable=False,
        ),
        sa.Column("kommentar", sa.Text(), nullable=True),
        sa.Column(
            "uppdaterad_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["dialogue_id"], ["dialogue.id"]),
        sa.ForeignKeyConstraint(["kpi_area_id"], ["kpi_area.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dialogue_id", "kpi_area_id", name="uq_area_status_area"),
    )


def downgrade() -> None:
    op.drop_table("area_status")
