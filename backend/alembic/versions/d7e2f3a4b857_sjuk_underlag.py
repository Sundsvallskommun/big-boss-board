"""Bevara sjukfrånvarofiler som behöver kontrolleras separat från R12."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d7e2f3a4b857"
down_revision = "a6d1e2f3a746"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "sjuk_underlag",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("filnamn", sa.String(255), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("innehall", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("enheter", postgresql.JSONB(), nullable=False),
        sa.Column("aktuell", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("skapad_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("filnamn", "sha256", name="uq_sjuk_underlag_fil"),
    )


def downgrade():
    # Nedgradering får inte tyst radera de bevarade originalen.
    raise RuntimeError("Behåll sjuk_underlag vid återgång till äldre image; exportera arkivet före borttagning.")
