"""add business info fields to tenants

Revision ID: 9116f4ceb21c
Revises: 68439177800d
Create Date: 2026-09-17 19:50:39.325986

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9116f4ceb21c'
down_revision: Union[str, None] = '68439177800d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('business_type', sa.String(length=50), nullable=True))
    op.add_column('tenants', sa.Column('industry', sa.String(length=100), nullable=True))
    op.add_column('tenants', sa.Column('business_category', sa.String(length=100), nullable=True))
    op.add_column('tenants', sa.Column('employee_count', sa.String(length=20), nullable=True))
    op.add_column('tenants', sa.Column('business_location', sa.String(length=255), nullable=True))
    op.add_column('tenants', sa.Column('heard_about', sa.String(length=100), nullable=True))
    op.add_column('tenants', sa.Column('referral_code', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'referral_code')
    op.drop_column('tenants', 'heard_about')
    op.drop_column('tenants', 'business_location')
    op.drop_column('tenants', 'employee_count')
    op.drop_column('tenants', 'business_category')
    op.drop_column('tenants', 'industry')
    op.drop_column('tenants', 'business_type')
