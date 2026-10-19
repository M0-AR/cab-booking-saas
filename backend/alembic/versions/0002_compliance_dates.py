"""compliance expiry dates + audit feed index

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-19

Adds nullable compliance dates (driver licence, cab insurance, cab
registration) and a composite index backing the tenant activity feed
(newest-first reads over audit_logs).

Columns are nullable and RLS is table-level, so existing policies and
grants in 0001 continue to cover the new columns unchanged.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "drivers", sa.Column("license_expiry", sa.Date(), nullable=True)
    )
    op.add_column(
        "cabs", sa.Column("insurance_expiry", sa.Date(), nullable=True)
    )
    op.add_column(
        "cabs", sa.Column("registration_expiry", sa.Date(), nullable=True)
    )
    op.create_index(
        "ix_audit_logs_tenant_created",
        "audit_logs",
        ["tenant_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_tenant_created", table_name="audit_logs")
    op.drop_column("cabs", "registration_expiry")
    op.drop_column("cabs", "insurance_expiry")
    op.drop_column("drivers", "license_expiry")
