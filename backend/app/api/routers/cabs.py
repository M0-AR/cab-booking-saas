from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, require_role
from app.core.like import like_pattern
from app.db.session import get_db
from app.models import Booking, Cab, Driver
from app.schemas.common import Page
from app.schemas.fleet import CabCreate, CabOut, CabUpdate
from app.services import audit

router = APIRouter(prefix="/cabs", tags=["cabs"])


@router.get("", response_model=Page[CabOut])
async def list_cabs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = Query(None, max_length=120),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    query = select(Cab)
    count_q = select(func.count()).select_from(Cab)
    if status_filter:
        query = query.where(Cab.status == status_filter)
        count_q = count_q.where(Cab.status == status_filter)
    if q:
        pattern = like_pattern(q)
        condition = or_(
            Cab.model.ilike(pattern, escape="\\"),
            Cab.plate.ilike(pattern, escape="\\"),
        )
        query = query.where(condition)
        count_q = count_q.where(condition)

    total = await session.scalar(count_q)
    rows = await session.scalars(
        query.order_by(Cab.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page(
        items=[CabOut.model_validate(c) for c in rows],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=CabOut, status_code=status.HTTP_201_CREATED)
async def create_cab(
    body: CabCreate,
    auth: AuthContext = Depends(require_role("owner", "admin", "manager")),
    session: AsyncSession = Depends(get_db),
):
    from app.services.entitlements import enforce_cab_quota

    await enforce_cab_quota(session, auth.tenant.id)

    existing = await session.scalar(select(Cab).where(Cab.plate == body.plate))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Plate already registered"
        )
    if body.driver_id is not None:
        driver = await session.get(Driver, body.driver_id)
        if driver is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
            )

    cab = Cab(tenant_id=auth.tenant.id, **body.model_dump())
    session.add(cab)
    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="cab.created",
        entity="cab",
        entity_id=cab.id,
        meta={"plate": cab.plate},
    )
    return CabOut.model_validate(cab)


@router.patch("/{cab_id}", response_model=CabOut)
async def update_cab(
    cab_id: uuid.UUID,
    body: CabUpdate,
    auth: AuthContext = Depends(require_role("owner", "admin", "manager")),
    session: AsyncSession = Depends(get_db),
):
    cab = await session.get(Cab, cab_id)
    if cab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cab not found")

    changes = body.model_dump(exclude_unset=True)
    if "driver_id" in changes and changes["driver_id"] is not None:
        driver = await session.get(Driver, changes["driver_id"])
        if driver is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
            )
    for key, value in changes.items():
        setattr(cab, key, value)
    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="cab.updated",
        entity="cab",
        entity_id=cab.id,
        meta=changes,
    )
    return CabOut.model_validate(cab)


@router.delete("/{cab_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cab(
    cab_id: uuid.UUID,
    auth: AuthContext = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
):
    cab = await session.get(Cab, cab_id)
    if cab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cab not found")

    bookings = await session.scalar(
        select(func.count()).select_from(Booking).where(Booking.cab_id == cab_id)
    )
    if (bookings or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cab has bookings and cannot be deleted",
        )
    await session.execute(delete(Cab).where(Cab.id == cab_id))
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="cab.deleted",
        entity="cab",
        entity_id=cab_id,
    )
