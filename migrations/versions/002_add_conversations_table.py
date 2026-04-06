"""Add conversations table

Revision ID: 002
Revises: 001
Create Date: 2026-04-05 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create conversations table
    op.create_table(
        'conversations',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('tenant_id', sa.Integer(), nullable=False, index=True),
        sa.Column('user_message', sa.String(length=2000), nullable=False),
        sa.Column('assistant_message', sa.String(length=4000), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for efficient querying
    op.create_index('ix_conversations_tenant_id', 'conversations', ['tenant_id'])
    op.create_index('ix_conversations_created_at', 'conversations', ['created_at'])


def downgrade() -> None:
    # Drop indexes first
    op.drop_index('ix_conversations_created_at', table_name='conversations')
    op.drop_index('ix_conversations_tenant_id', table_name='conversations')

    # Drop table
    op.drop_table('conversations')
