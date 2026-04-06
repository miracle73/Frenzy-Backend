"""Add classification_reasoning to transactions table.

Revision ID: 003_add_classification_reasoning
Revises: 002_add_conversations_table
Create Date: 2026-04-06 11:30:00.000000+00:00
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003_add_classification_reasoning'
down_revision = '002_add_conversations_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add classification_reasoning column to transactions table."""
    op.add_column(
        'transactions',
        sa.Column('classification_reasoning', sa.String(1000), nullable=True)
    )


def downgrade() -> None:
    """Drop classification_reasoning column from transactions table."""
    op.drop_column('transactions', 'classification_reasoning')
