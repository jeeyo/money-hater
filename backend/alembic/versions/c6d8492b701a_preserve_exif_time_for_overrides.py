"""preserve EXIF time for user overrides

Revision ID: c6d8492b701a
Revises: a1f4c9b27e30
"""
from alembic import op
import sqlalchemy as sa

revision = "c6d8492b701a"
down_revision = "a1f4c9b27e30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("images", sa.Column("exif_taken_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE images SET exif_taken_at = taken_at WHERE taken_at_source = 'exif'")


def downgrade() -> None:
    op.drop_column("images", "exif_taken_at")
