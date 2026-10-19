"""initial schema + RLS + roles

Revision ID: 0001
Revises:
Create Date: 2026-10-18

Multi-tenancy model (docs/RESEARCH.md):
- Shared schema, tenant_id on every row, Postgres RLS as the hard boundary.
- Policies fail CLOSED: nullif(current_setting('app.current_tenant', true), '')
  yields NULL when no tenant context is set -> no rows, no writes.
- FORCE ROW LEVEL SECURITY so even the table owner is subject to policies.
- refresh_tokens is ENABLE (not FORCE): the SECURITY DEFINER lookup function
  runs as app_privileged (BYPASSRLS) and could not read it otherwise.
- The runtime app connects as app_user (non-owner, no BYPASSRLS).
"""
from __future__ import annotations

import os
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_TABLES = [
    "tenant_settings",
    "users",
    "refresh_tokens",
    "drivers",
    "cabs",
    "customers",
    "bookings",
    "audit_logs",
]
NO_FORCE = {"refresh_tokens"}

TENANT_PREDICATE = (
    "tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid"
)


def _app_password() -> str:
    return os.environ.get("APP_DB_PASSWORD", "app_password").replace("'", "''")


def _now() -> sa.TextClause:
    return sa.text("now()")


def upgrade() -> None:
    # ------------------------------------------------------------------ tables
    op.create_table(
        "tenants",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("slug", sa.String(40), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False, server_default=sa.text("'free'")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
    )

    op.create_table(
        "tenant_domains",
        sa.Column("domain", sa.String(255), primary_key=True),
        sa.Column("tenant_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE",
                                name="fk_tenant_domains_tenant_id_tenants"),
                  nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
    )
    op.create_index("ix_tenant_domains_tenant_id", "tenant_domains", ["tenant_id"])

    op.create_table(
        "tenant_settings",
        sa.Column("tenant_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE",
                                name="fk_tenant_settings_tenant_id_tenants"),
                  primary_key=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default=sa.text("'USD'")),
        sa.Column("timezone", sa.String(64), nullable=False, server_default=sa.text("'UTC'")),
        sa.Column("brand", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("features", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("fare", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE",
                                name="fk_users_tenant_id_tenants"),
                  nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default=sa.text("'viewer'")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        sa.UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        sa.UniqueConstraint("tenant_id", "id", name="uq_users_tenant_id_id"),
        sa.CheckConstraint(
            "role IN ('owner', 'admin', 'manager', 'driver', 'viewer')",
            name="ck_users_role_valid",
        ),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE",
                                name="fk_refresh_tokens_tenant_id_tenants"),
                  nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
    )
    op.create_index("ix_refresh_tokens_tenant_id", "refresh_tokens", ["tenant_id"])
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    op.create_table(
        "drivers",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE",
                                name="fk_drivers_tenant_id_tenants"),
                  nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(32), nullable=False),
        sa.Column("license_no", sa.String(64), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        sa.UniqueConstraint("tenant_id", "id", name="uq_drivers_tenant_id_id"),
    )
    op.create_index("ix_drivers_tenant_id", "drivers", ["tenant_id"])

    op.create_table(
        "cabs",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE",
                                name="fk_cabs_tenant_id_tenants"),
                  nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("plate", sa.String(16), nullable=False),
        sa.Column("capacity", sa.Integer, nullable=False, server_default=sa.text("4")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'available'")),
        sa.Column("driver_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        sa.UniqueConstraint("tenant_id", "plate", name="uq_cabs_tenant_plate"),
        sa.UniqueConstraint("tenant_id", "id", name="uq_cabs_tenant_id_id"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "driver_id"],
            ["drivers.tenant_id", "drivers.id"],
            name="fk_cabs_tenant_driver",
        ),
    )
    op.create_index("ix_cabs_tenant_id", "cabs", ["tenant_id"])
    op.create_index("ix_cabs_driver_id", "cabs", ["driver_id"])

    op.create_table(
        "customers",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE",
                                name="fk_customers_tenant_id_tenants"),
                  nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(32), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        sa.UniqueConstraint("tenant_id", "id", name="uq_customers_tenant_id_id"),
    )
    op.create_index("ix_customers_tenant_id", "customers", ["tenant_id"])

    op.create_table(
        "bookings",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE",
                                name="fk_bookings_tenant_id_tenants"),
                  nullable=False),
        sa.Column("customer_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("driver_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("cab_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("pickup", sa.String(255), nullable=False),
        sa.Column("dropoff", sa.String(255), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("fare", sa.Numeric(10, 2), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        sa.CheckConstraint(
            "status IN ('pending', 'assigned', 'completed', 'cancelled')",
            name="ck_bookings_status_valid",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "customer_id"],
            ["customers.tenant_id", "customers.id"],
            name="fk_bookings_tenant_customer",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "driver_id"],
            ["drivers.tenant_id", "drivers.id"],
            name="fk_bookings_tenant_driver",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "cab_id"],
            ["cabs.tenant_id", "cabs.id"],
            name="fk_bookings_tenant_cab",
        ),
    )
    op.create_index("ix_bookings_tenant_id", "bookings", ["tenant_id"])
    op.create_index("ix_bookings_customer_id", "bookings", ["customer_id"])
    op.create_index("ix_bookings_driver_id", "bookings", ["driver_id"])
    op.create_index("ix_bookings_cab_id", "bookings", ["cab_id"])
    op.create_index("ix_bookings_scheduled_at", "bookings", ["scheduled_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE",
                                name="fk_audit_logs_tenant_id_tenants"),
                  nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity", sa.String(32), nullable=False),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("meta", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
    )
    op.create_index("ix_audit_logs_tenant_id", "audit_logs", ["tenant_id"])

    # ------------------------------------------------------- roles & privileges
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
                CREATE ROLE app_user LOGIN;
            END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_privileged') THEN
                CREATE ROLE app_privileged NOLOGIN BYPASSRLS;
            END IF;
        END
        $$;
        """
    )
    op.execute(f"ALTER ROLE app_user WITH LOGIN PASSWORD '{_app_password()}';")
    op.execute(
        """
        DO $$
        BEGIN
            EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
        END
        $$;
        """
    )
    op.execute("GRANT USAGE ON SCHEMA public TO app_user;")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;"
    )
    op.execute("GRANT SELECT ON tenants, tenant_settings, refresh_tokens TO app_privileged;")

    # ------------------------------------------------------------------- RLS
    for table in RLS_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        if table not in NO_FORCE:
            op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING ({TENANT_PREDICATE}) "
            f"WITH CHECK ({TENANT_PREDICATE});"
        )

    # ------------------------------------------------- auth helper functions
    # SECURITY DEFINER lookups for the two chicken-and-egg cases:
    # - refresh flow: tenant unknown until the token is resolved
    # - public branding: unauthenticated login page
    # Owned by app_privileged (BYPASSRLS) so FORCE RLS does not block them.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION auth_lookup_refresh(p_hash text)
        RETURNS TABLE (
            tenant_id uuid, user_id uuid,
            expires_at timestamptz, revoked_at timestamptz
        )
        LANGUAGE sql
        SECURITY DEFINER
        SET search_path = public
        AS $$
            SELECT rt.tenant_id, rt.user_id, rt.expires_at, rt.revoked_at
            FROM refresh_tokens rt
            WHERE rt.token_hash = p_hash;
        $$;
        """
    )
    op.execute("ALTER FUNCTION auth_lookup_refresh(text) OWNER TO app_privileged;")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public_tenant_branding(p_slug text)
        RETURNS TABLE (
            tenant_name text, tenant_slug text, display_name text,
            primary_color text, accent_color text, logo_url text, currency text
        )
        LANGUAGE sql
        SECURITY DEFINER
        SET search_path = public
        AS $$
            SELECT t.name, t.slug,
                   s.brand ->> 'display_name',
                   s.brand ->> 'primary_color',
                   s.brand ->> 'accent_color',
                   s.brand ->> 'logo_url',
                   s.currency
            FROM tenants t
            JOIN tenant_settings s ON s.tenant_id = t.id
            WHERE t.slug = p_slug AND t.status = 'active';
        $$;
        """
    )
    op.execute("ALTER FUNCTION public_tenant_branding(text) OWNER TO app_privileged;")

    for fn in ("auth_lookup_refresh(text)", "public_tenant_branding(text)"):
        op.execute(f"REVOKE ALL ON FUNCTION {fn} FROM PUBLIC;")
        op.execute(f"GRANT EXECUTE ON FUNCTION {fn} TO app_user;")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public_tenant_branding(text);")
    op.execute("DROP FUNCTION IF EXISTS auth_lookup_refresh(text);")
    for table in reversed(
        ["audit_logs", "bookings", "customers", "cabs", "drivers",
         "refresh_tokens", "users", "tenant_settings", "tenant_domains", "tenants"]
    ):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
    op.execute(
        """
        DO $$
        BEGIN
            DROP ROLE IF EXISTS app_user;
            DROP ROLE IF EXISTS app_privileged;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END
        $$;
        """
    )
