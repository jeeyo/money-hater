"""open-ended trips

Revision ID: b41c7d2a58e9
Revises: 3be6ae992ffe
Create Date: 2026-08-08 12:05:11.902314

"""
from alembic import op
import sqlalchemy as sa

revision = 'b41c7d2a58e9'
down_revision = '3be6ae992ffe'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A trip you are still on has no ending expense yet; its window runs to now.
    op.alter_column('trips', 'end_expense_id', existing_type=sa.Integer(), nullable=True)
    # "The trip I am on right now" is singular — enforced in the database, not
    # just in the service, so a concurrent create cannot slip a second one past.
    op.create_index(
        'uq_trips_one_open_per_user', 'trips', ['user_id'], unique=True,
        postgresql_where=sa.text('end_expense_id IS NULL'),
        sqlite_where=sa.text('end_expense_id IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_trips_one_open_per_user', table_name='trips')
    # Trips still running have no end to go back to; ending them at their start
    # would silently rewrite what the user recorded, so they are dropped.
    op.execute('DELETE FROM trips WHERE end_expense_id IS NULL')
    op.alter_column('trips', 'end_expense_id', existing_type=sa.Integer(), nullable=False)
