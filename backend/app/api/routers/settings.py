from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, require_role
from app.db.session import get_db
from app.models import (
    DEFAULT_BRAND,
    DEFAULT_FARE,
    TenantDomain,
)
from app.schemas.settings import Brand, FareConfig, SettingsOut, SettingsUpdate
from app.services import audit
from app.services.entitlements import feature_enabled, get_tenant_settings

router = APIRouter(prefix="/settings", tags=["settings"])


def _to_out(row, custom_domain: str | None = None) -> SettingsOut:
    brand = {**DEFAULT_BRAND, **(row.brand or {})}
    fare = {**DEFAULT_FARE, **(row.fare or {})}
    brand.pop("currency", None)  # currency is its own column
    fare.pop("currency", None)
    return SettingsOut(
        currency=row.currency,
        timezone=row.timezone,
        brand=Brand(**{k: v for k, v in brand.items() if k in Brand.model_fields}),
        features=dict(row.features or {}),
        fare={**fare, "currency": row.currency},
        custom_domain=custom_domain,
    )


async def _get_domain(session: AsyncSession, tenant_id) -> str | None:
    return (
        await session.execute(
            select(TenantDomain.domain)
            .where(TenantDomain.tenant_id == tenant_id)
            .limit(1)
        )
    ).scalar_one_or_none()


@router.get("", response_model=SettingsOut)
async def get_settings(
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    row = await get_tenant_settings(session, auth.tenant.id)
    return _to_out(row, await _get_domain(session, auth.tenant.id))


@router.patch("", response_model=SettingsOut)
async def update_settings(
    body: SettingsUpdate,
    auth: AuthContext = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
):
    row = await get_tenant_settings(session, auth.tenant.id)
    changes = body.model_dump(exclude_unset=True)

    if "currency" in changes and changes["currency"]:
        row.currency = changes["currency"].upper()

    if "timezone" in changes and changes["timezone"]:
        row.timezone = changes["timezone"]

    if body.brand is not None:
        merged = {**(row.brand or {})}
        merged.update(body.brand.model_dump(exclude_unset=True))
        row.brand = {k: v for k, v in merged.items() if k != "currency"}

    if body.fare is not None:
        merged = {**(row.fare or {})}
        merged.update(body.fare.model_dump(exclude_unset=True, exclude={"currency"}))
        row.fare = merged
        if body.fare.model_fields_set and "currency" in body.fare.model_fields_set:
            row.currency = body.fare.currency.upper()

    if "custom_domain" in changes:
        if not feature_enabled(dict(row.features or {}), "custom_domain"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "feature_disabled",
                    "message": "Custom domains are not enabled on your plan.",
                },
            )
        new_domain = changes["custom_domain"]
        await session.execute(
            delete(TenantDomain).where(TenantDomain.tenant_id == auth.tenant.id)
        )
        if new_domain:
            taken = await session.get(TenantDomain, new_domain)
            if taken is not None and taken.tenant_id != auth.tenant.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="That domain is already in use",
                )
            session.add(TenantDomain(domain=new_domain, tenant_id=auth.tenant.id))

    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="settings.updated",
        entity="settings",
        entity_id=auth.tenant.id,
        meta={k: v for k, v in changes.items() if k != "custom_domain"}
        | ({"custom_domain": True} if "custom_domain" in changes else {}),
    )
    return _to_out(row, await _get_domain(session, auth.tenant.id))
