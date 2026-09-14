"""`ar_forvaltning` på organisation

Listan på startsidan blandade förvaltningar med koncernens övriga verksamheter,
eftersom den bara sorterade på namn: Medelpads Räddningstjänstförbund hamnade under
M och Stadsbacken under S, mitt bland kontoren. De är inte förvaltningar och ska
ligga för sig.

Egenskapen kan inte härledas ur att mätdata saknas. Det är två skilda saker:
`dialogbaserad` i organisationsmastern säger att verksamheten följs upp utan siffror,
medan den här kolumnen säger var den hör hemma i organisationen. Får MRF mätdata
längre fram slutar den vara dialogbaserad men är fortfarande ingen förvaltning — hade
grupperingen hängt på datat hade den då hoppat upp bland kontoren igen.

Default true: alla befintliga rader är förvaltningar. Seeden sätter sedan värdet ur
organisationer.json vid varje start.

Revision ID: d3a8b9c0e413
Revises: c2f7a8b9d312
Create Date: 2026-08-31 10:40:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d3a8b9c0e413"
down_revision: str | None = "c2f7a8b9d312"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organisation",
        sa.Column(
            "ar_forvaltning",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("organisation", "ar_forvaltning")
