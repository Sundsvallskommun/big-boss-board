"""`organisation_id` på question — frågor som bara gäller en verksamhet

Frågeställningarna hörde till nyckeltalet och delades av alla verksamheter. De är
skrivna mot grafen bredvid: "Vad förklarar nuläget mot budget och prognos?" förutsätter
att en prognos syns på kortet. För Medelpads Räddningstjänstförbund och Stadsbacken finns
ingen — alla deras sex kort följs upp genom dialog — och frågan blir då obesvarbar.

Nullable och index: `NULL` betyder allmän fråga som gäller alla (så gott som alla rader),
ett värde betyder att frågan bara visas för den verksamheten. Läsvägen tar verksamhetens
egna frågor när det finns några, annars de allmänna — så ett nyckeltal aldrig blir utan
samtalsstöd.

Revision ID: e4b9c0d1f524
Revises: d3a8b9c0e413
Create Date: 2026-08-31 11:20:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4b9c0d1f524"
down_revision: str | None = "d3a8b9c0e413"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("question", sa.Column("organisation_id", sa.Integer(), nullable=True))
    op.create_index("ix_question_organisation_id", "question", ["organisation_id"])
    op.create_foreign_key(
        "fk_question_organisation", "question", "organisation", ["organisation_id"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint("fk_question_organisation", "question", type_="foreignkey")
    op.drop_index("ix_question_organisation_id", table_name="question")
    op.drop_column("question", "organisation_id")
