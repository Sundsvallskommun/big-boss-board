"""återstående aktiviteter (`aterstaende`) på statusrapport

En lägesrapport har två sorters punkter: vad som är gjort och vad som återstår. Med
en enda `punkter`-lista tvingas det som återstår in i samma uppräkning, prefixat med
"Återstår:" — läsaren får leta reda på dem. Egen kolumn ger sektionen en egen rubrik
i kortet. Nullable: de flesta rapporter har inga återstående aktiviteter.

Revision ID: c2f7a8b9d312
Revises: b1e6f7a8c210
Create Date: 2026-08-17 19:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c2f7a8b9d312"
down_revision: str | None = "b1e6f7a8c210"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "statusrapport",
        sa.Column("aterstaende", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("statusrapport", "aterstaende")
