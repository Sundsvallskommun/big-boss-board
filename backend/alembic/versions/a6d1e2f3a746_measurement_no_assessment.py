"""Saknad prognos är ingen bedömning: null i stället för ett påhittat noll/grönt värde.

Revision ID: a6d1e2f3a746
Revises: f5c0d1e2a635
"""
from alembic import op

revision = "a6d1e2f3a746"
down_revision = "f5c0d1e2a635"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("measurement", "value_num", nullable=True)
    op.alter_column("measurement", "status", nullable=True)


def downgrade():
    # Vägrar hellre återtagning än att förvandla saknad bedömning till grön status.
    # Återställ databassnapshot om den äldre versionen måste tas i bruk efter import.
    op.alter_column("measurement", "value_num", nullable=False)
    op.alter_column("measurement", "status", nullable=False)
