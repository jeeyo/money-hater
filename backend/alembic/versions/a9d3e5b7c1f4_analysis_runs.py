"""analysis_runs: count vision calls for the daily cap

Revision ID: a9d3e5b7c1f4
Revises: f3c81a6b2d47
"""

import sqlalchemy as sa
from alembic import op

revision = "a9d3e5b7c1f4"
down_revision = "f3c81a6b2d47"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "ran_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_analysis_runs_user_ran_at", "analysis_runs", ["user_id", "ran_at"])


def downgrade() -> None:
    op.drop_index("ix_analysis_runs_user_ran_at", table_name="analysis_runs")
    op.drop_table("analysis_runs")
