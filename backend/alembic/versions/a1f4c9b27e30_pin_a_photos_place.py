"""pin a photo's place

Revision ID: a1f4c9b27e30
Revises: 558b18139eee
Create Date: 2026-08-10 04:10:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1f4c9b27e30'
down_revision = '558b18139eee'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'images',
        sa.Column(
            'place_pinned', sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column('images', 'place_pinned')
