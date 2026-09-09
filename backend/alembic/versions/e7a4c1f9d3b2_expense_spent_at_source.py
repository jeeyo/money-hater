"""track whether an expense's spent_at came from its photo or was set by hand

Revision ID: e7a4c1f9d3b2
Revises: d0bf3433ad92
Create Date: 2026-09-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'e7a4c1f9d3b2'
down_revision = 'd0bf3433ad92'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'expenses',
        sa.Column('spent_at_source', sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('expenses', 'spent_at_source')
