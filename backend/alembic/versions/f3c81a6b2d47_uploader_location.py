"""where the phone was when a photo was uploaded

Revision ID: f3c81a6b2d47
Revises: e7a4c1f9d3b2
Create Date: 2026-09-17 09:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'f3c81a6b2d47'
down_revision = 'e7a4c1f9d3b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable and never backfilled: rows written before this shipped have no
    # answer, and a guessed one is worse than none.
    op.add_column('images', sa.Column('upload_lat', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('upload_lng', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('images', 'upload_lng')
    op.drop_column('images', 'upload_lat')
