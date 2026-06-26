"""Lägg masterdata-kod på organisation (kanonisk nyckel för dataset-koppling).

Revision ID: 5e3b8c1d9f42
Revises: 4d2a7f9c6b30
Create Date: 2026-06-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "5e3b8c1d9f42"
down_revision: str | None = "4d2a7f9c6b30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organisation", sa.Column("kod", sa.String(length=16), nullable=True))
    op.create_index(op.f("ix_organisation_kod"), "organisation", ["kod"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_organisation_kod"), table_name="organisation")
    op.drop_column("organisation", "kod")
