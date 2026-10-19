from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.settings import PublicBranding

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/branding", response_model=PublicBranding)
async def branding(
    request: Request,
    slug: str | None = None,
    session: AsyncSession = Depends(get_db),
):
    """Unauthenticated: powers the login page look for a tenant.

    Resolution order: ?slug=, X-Tenant-Slug/subdomain (middleware), Host domain.
    Backed by a SECURITY DEFINER function (branding lives in an RLS table).
    """
    host_domain = getattr(request.state, "host_domain", None)
    resolved_slug = slug or getattr(request.state, "tenant_slug", None)

    if resolved_slug is None and host_domain:
        row = (
            await session.execute(
                text(
                    "SELECT t.slug FROM tenant_domains d "
                    "JOIN tenants t ON t.id = d.tenant_id "
                    "WHERE d.domain = :d"
                ),
                {"d": host_domain},
            )
        ).first()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Unknown domain"
            )
        resolved_slug = row[0]

    if resolved_slug is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide ?slug= or a tenant subdomain/domain",
        )

    row = (
        await session.execute(
            text(
                "SELECT tenant_name, tenant_slug, display_name, primary_color, "
                "accent_color, logo_url, currency "
                "FROM public_tenant_branding(:slug)"
            ),
            {"slug": resolved_slug},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    return PublicBranding(**dict(row))
