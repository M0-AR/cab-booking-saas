"""Tenant resolution middleware + RLS context helpers.

Tenant resolution order for unauthenticated requests:
  1. `X-Tenant-Slug` header (SPA / API clients)
  2. Subdomain of PLATFORM_BASE_DOMAIN  (acme.platform.example.com -> "acme")
  3. Exact custom domain match          (resolved from tenant_domains in DB)

For authenticated requests the JWT `tenant` claim is authoritative and is set
by the auth dependency AFTER signature verification — request headers are never
trusted for data access.

All tenant context is pushed into Postgres with transaction-scoped
`set_config(..., true)` so pooled connections can never leak context between
requests (verified failure mode — docs/RESEARCH.md §1).
"""

from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import get_settings

settings = get_settings()


class TenantResolutionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        state = request.state
        state.tenant_slug = None
        state.host_domain = None

        header_slug = request.headers.get("x-tenant-slug")
        if header_slug:
            state.tenant_slug = header_slug.strip().lower()
        else:
            host = (request.headers.get("host") or "").split(":")[0].lower()
            base = settings.platform_base_domain.lower()
            if host and base and host.endswith("." + base):
                state.tenant_slug = host[: -(len(base) + 1)].split(".")[0]
            elif host and host not in (base, "localhost", "127.0.0.1"):
                state.host_domain = host
        return await call_next(request)


async def set_rls_context(
    session: AsyncSession,
    tenant_id: uuid.UUID | None,
    user_id: uuid.UUID | None = None,
) -> None:
    """Transaction-scoped tenant/user context for RLS. Safe under poolers."""
    await session.execute(
        text(
            "SELECT set_config('app.current_tenant', :t, true),"
            "       set_config('app.current_user', :u, true)"
        ),
        {
            "t": str(tenant_id) if tenant_id else "",
            "u": str(user_id) if user_id else "",
        },
    )


async def resolve_tenant_id(
    session: AsyncSession,
    *,
    slug: str | None = None,
    domain: str | None = None,
    tenant_id: uuid.UUID | None = None,
) -> uuid.UUID | None:
    """Resolve a tenant from slug / custom domain / explicit id.

    `tenants` and `tenant_domains` are intentionally RLS-free registry tables
    (public routing data: slug/domain -> tenant id, no tenant PII).
    """
    if tenant_id is not None:
        return tenant_id
    if slug:
        row = await session.execute(
            text(
                "SELECT id FROM tenants WHERE slug = :slug AND status = 'active'"
            ),
            {"slug": slug},
        )
        found = row.scalar_one_or_none()
        if found:
            return found
    if domain:
        row = await session.execute(
            text("SELECT tenant_id FROM tenant_domains WHERE domain = :d"),
            {"d": domain},
        )
        found = row.scalar_one_or_none()
        if found:
            return found
    return None
