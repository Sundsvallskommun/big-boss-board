"""inkorg: tabell för inkomna inlämningar (submission)

Inför en egen kö för synpunkter/frågor/aktiviteter som projektdeltagare lämnar in
via det publika formuläret. Skild från de kurerade kolumnerna på status-sidan;
arbetsgruppen läser och triagerar via /api/admin/submissions.

Revision ID: 6f4a1b2c8d05
Revises: 5e3b8c1d9f42
Create Date: 2026-06-30 09:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6f4a1b2c8d05"
down_revision: str | None = "5e3b8c1d9f42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "submission",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="ny", nullable=False),
        sa.Column("notering", sa.Text(), nullable=True),
        sa.Column("skapad_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("uppdaterad_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_submission_status", "submission", ["status"])


def downgrade() -> None:
    op.drop_index("ix_submission_status", table_name="submission")
    op.drop_table("submission")
