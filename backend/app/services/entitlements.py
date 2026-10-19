"""Server-side entitlement enforcement. Never trust the client UI to hide
features — gating happens here, per docs/RESEARCH.md §6."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DEFAULT_FEATURES, Cab, TenantSettings, User


async def get_tenant_settings(
    session: AsyncSession, tenant_id: uuid.UUID
) -> TenantSettings:
    row = await session.get(TenantSettings, tenant_id)
    if row is None:
        row = TenantSettings(
            tenant_id=tenant_id,
            brand={},
            features=dict(DEFAULT_FEATURES),
            fare={},
        )
        session.add(row)
        await session.flush()
    return row


def feature_enabled(features: dict, key: str) -> bool:
    default = DEFAULT_FEATURES.get(key, False)
    return bool(features.get(key, default))


async def enforce_cab_quota(session: AsyncSession, tenant_id: uuid.UUID) -> None:
    row = await get_tenant_settings(session, tenant_id)
    max_cabs = int(row.features.get("max_cabs", DEFAULT_FEATURES["max_cabs"]))
    current = await session.scalar(
        select(func.count()).select_from(Cab).where(Cab.tenant_id == tenant_id)
    )
    if (current or 0) >= max_cabs:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "quota_exceeded",
                "message": f"Cab limit ({max_cabs}) reached for your plan.",
            },
        )


async def enforce_user_quota(session: AsyncSession, tenant_id: uuid.UUID) -> None:
    row = await get_tenant_settings(session, tenant_id)
    max_users = int(row.features.get("max_users", DEFAULT_FEATURES["max_users"]))
    current = await session.scalar(
        select(func.count()).select_from(User).where(User.tenant_id == tenant_id)
    )
    if (current or 0) >= max_users:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "quota_exceeded",
                "message": f"User limit ({max_users}) reached for your plan.",
            },
        )
