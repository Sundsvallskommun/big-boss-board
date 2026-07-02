"""area_status som append-only historik (BYGGPLAN §16)

Varje ny manuell status blir en egen rad (historik) i stället för en upsertad rad per
(dialog, område). Tar bort unik-constrainten, lägger ett vanligt index för uppslag och
byter kolumnnamn uppdaterad_at → satt_at (raderna uppdateras aldrig).

Revision ID: 9c4d5e6f7a08
Revises: 8b3c4d5e6f07
Create Date: 2026-07-02 15:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9c4d5e6f7a08"
down_revision: str | None = "8b3c4d5e6f07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("uq_area_status_area", "area_status", type_="unique")
    op.create_index(
        "ix_area_status_dialogue_area", "area_status", ["dialogue_id", "kpi_area_id"]
    )
    op.alter_column("area_status", "uppdaterad_at", new_column_name="satt_at")


def downgrade() -> None:
    op.alter_column("area_status", "satt_at", new_column_name="uppdaterad_at")
    op.drop_index("ix_area_status_dialogue_area", table_name="area_status")
    op.create_unique_constraint(
        "uq_area_status_area", "area_status", ["dialogue_id", "kpi_area_id"]
    )
