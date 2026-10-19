from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, require_role
from app.core.like import like_pattern
from app.db.session import get_db
from app.models import Booking, Cab, Driver
from app.schemas.common import Page
from app.schemas.fleet import DriverCreate, DriverOut, DriverUpdate
from app.services import audit

router = APIRouter(prefix="/drivers", tags=["drivers"])


@router.get("", response_model=Page[DriverOut])
async def list_drivers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = Query(None, max_length=120),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    query = select(Driver)
    count_q = select(func.count()).select_from(Driver)
    if status_filter:
        query = query.where(Driver.status == status_filter)
        count_q = count_q.where(Driver.status == status_filter)
    if q:
        pattern = like_pattern(q)
        condition = or_(
            Driver.name.ilike(pattern, escape="\\"),
            Driver.phone.ilike(pattern, escape="\\"),
            Driver.license_no.ilike(pattern, escape="\\"),
        )
        query = query.where(condition)
        count_q = count_q.where(condition)

    total = await session.scalar(count_q)
    rows = await session.scalars(
        query.order_by(Driver.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page(
        items=[DriverOut.model_validate(d) for d in rows],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=DriverOut, status_code=status.HTTP_201_CREATED)
async def create_driver(
    body: DriverCreate,
    auth: AuthContext = Depends(require_role("owner", "admin", "manager")),
    session: AsyncSession = Depends(get_db),
):
    driver = Driver(tenant_id=auth.tenant.id, **body.model_dump())
    session.add(driver)
    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="driver.created",
        entity="driver",
        entity_id=driver.id,
        meta={"name": driver.name},
    )
    return DriverOut.model_validate(driver)


@router.patch("/{driver_id}", response_model=DriverOut)
async def update_driver(
    driver_id: uuid.UUID,
    body: DriverUpdate,
    auth: AuthContext = Depends(require_role("owner", "admin", "manager")),
    session: AsyncSession = Depends(get_db),
):
    driver = await session.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
        )
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(driver, key, value)
    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="driver.updated",
        entity="driver",
        entity_id=driver.id,
        meta=changes,
    )
    return DriverOut.model_validate(driver)


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_driver(
    driver_id: uuid.UUID,
    auth: AuthContext = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
):
    driver = await session.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
        )

    bookings = await session.scalar(
        select(func.count()).select_from(Booking).where(Booking.driver_id == driver_id)
    )
    if (bookings or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Driver has bookings and cannot be deleted",
        )
    await session.execute(
        update(Cab).where(Cab.driver_id == driver_id).values(driver_id=None)
    )
    await session.execute(delete(Driver).where(Driver.id == driver_id))
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="driver.deleted",
        entity="driver",
        entity_id=driver_id,
    )
