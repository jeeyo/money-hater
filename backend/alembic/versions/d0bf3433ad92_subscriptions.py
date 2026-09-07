"""subscriptions

Revision ID: d0bf3433ad92
Revises: c6d8492b701a
Create Date: 2026-09-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd0bf3433ad92'
down_revision = 'c6d8492b701a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('merchant', sa.String(length=255), nullable=True),
        sa.Column('place_id', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('amount_minor', sa.BigInteger(), nullable=False),
        sa.Column('interval', sa.String(length=16), nullable=False),
        sa.Column('day_of_month', sa.SmallInteger(), nullable=False),
        sa.Column('month', sa.SmallInteger(), nullable=True),
        sa.Column('next_run_on', sa.Date(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.CheckConstraint("interval in ('monthly','yearly')", name='ck_subscriptions_interval'),
        sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_subscriptions_user_id'), 'subscriptions', ['user_id'], unique=False
    )
    op.create_index(
        op.f('ix_subscriptions_next_run_on'), 'subscriptions', ['next_run_on'], unique=False
    )

    op.add_column('expenses', sa.Column('subscription_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_expenses_subscription_id_subscriptions', 'expenses', 'subscriptions',
        ['subscription_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index(
        op.f('ix_expenses_subscription_id'), 'expenses', ['subscription_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_expenses_subscription_id'), table_name='expenses')
    op.drop_constraint(
        'fk_expenses_subscription_id_subscriptions', 'expenses', type_='foreignkey'
    )
    op.drop_column('expenses', 'subscription_id')

    op.drop_index(op.f('ix_subscriptions_next_run_on'), table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_user_id'), table_name='subscriptions')
    op.drop_table('subscriptions')
