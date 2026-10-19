from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, require_role
from app.core.csv_export import csv_response
from app.core.like import like_pattern
from app.db.session import get_db
from app.models import Booking, BookingStatus, Cab, Customer, Driver
from app.schemas.booking import (
    BookingAssign,
    BookingComplete,
    BookingCreate,
    BookingOut,
)
from app.schemas.common import Page
from app.services import audit

router = APIRouter(prefix="/bookings", tags=["bookings"])

WRITE_ROLES = ("owner", "admin", "manager")
LIKE_ESCAPE = "\\"
EXPORT_ROW_LIMIT = 5000


def _search_condition(q: str):
    pattern = like_pattern(q)
    return or_(
        Booking.pickup.ilike(pattern, escape=LIKE_ESCAPE),
        Booking.dropoff.ilike(pattern, escape=LIKE_ESCAPE),
        Booking.notes.ilike(pattern, escape=LIKE_ESCAPE),
        Booking.customer.has(Customer.name.ilike(pattern, escape=LIKE_ESCAPE)),
        Booking.customer.has(Customer.phone.ilike(pattern, escape=LIKE_ESCAPE)),
        Booking.driver.has(Driver.name.ilike(pattern, escape=LIKE_ESCAPE)),
    )


async def _get_or_404(session: AsyncSession, booking_id: uuid.UUID) -> Booking:
    booking = await session.get(Booking, booking_id)
    if booking is None:
        # RLS makes other tenants' bookings indistinguishable from missing.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found"
        )
    return booking


async def _reload(session: AsyncSession, booking_id: uuid.UUID) -> Booking:
    """Re-select with eager loading so freshly written bookings serialize.

    populate_existing refreshes column attrs and re-runs the selectin loaders
    for customer/driver/cab, which a just-flushed instance has not loaded.
    """
    booking = await session.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .execution_options(populate_existing=True)
    )
    assert booking is not None
    return booking


def _list_conditions(
    status_filter: BookingStatus | None,
    customer_id: uuid.UUID | None,
    driver_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
    q: str | None,
):
    conditions = []
    if status_filter is not None:
        conditions.append(Booking.status == status_filter)
    if customer_id is not None:
        conditions.append(Booking.customer_id == customer_id)
    if driver_id is not None:
        conditions.append(Booking.driver_id == driver_id)
    if date_from is not None:
        conditions.append(Booking.scheduled_at >= date_from)
    if date_to is not None:
        conditions.append(Booking.scheduled_at <= date_to)
    if q:
        conditions.append(_search_condition(q))
    return conditions


@router.get("", response_model=Page[BookingOut])
async def list_bookings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: BookingStatus | None = Query(None, alias="status"),
    customer_id: uuid.UUID | None = Query(None),
    driver_id: uuid.UUID | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    q: str | None = Query(None, max_length=120),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    conditions = _list_conditions(
        status_filter, customer_id, driver_id, date_from, date_to, q
    )

    total = await session.scalar(
        select(func.count()).select_from(Booking).where(*conditions)
    )
    rows = await session.scalars(
        select(Booking)
        .where(*conditions)
        .order_by(Booking.scheduled_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page(
        items=[BookingOut.model_validate(b) for b in rows],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.get("/export.csv")
async def export_bookings_csv(
    status_filter: BookingStatus | None = Query(None, alias="status"),
    customer_id: uuid.UUID | None = Query(None),
    driver_id: uuid.UUID | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    q: str | None = Query(None, max_length=120),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    conditions = _list_conditions(
        status_filter, customer_id, driver_id, date_from, date_to, q
    )
    rows = await session.scalars(
        select(Booking)
        .where(*conditions)
        .order_by(Booking.scheduled_at.desc())
        .limit(EXPORT_ROW_LIMIT)
    )
    today = datetime.now().date().isoformat()
    return csv_response(
        filename=f"bookings-{today}.csv",
        header=[
            "id",
            "scheduled_at",
            "created_at",
            "status",
            "customer",
            "phone",
            "pickup",
            "dropoff",
            "driver",
            "cab_plate",
            "fare",
            "notes",
        ],
        rows=(
            (
                b.id,
                b.scheduled_at.isoformat(),
                b.created_at.isoformat(),
                b.status.value,
                b.customer.name,
                b.customer.phone,
                b.pickup,
                b.dropoff,
                b.driver.name if b.driver else "",
                b.cab.plate if b.cab else "",
                b.fare if b.fare is not None else "",
                b.notes or "",
            )
            for b in rows
        ),
    )


@router.get("/{booking_id}", response_model=BookingOut)
async def get_booking(
    booking_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    return BookingOut.model_validate(await _get_or_404(session, booking_id))


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create_booking(
    body: BookingCreate,
    auth: AuthContext = Depends(require_role(*WRITE_ROLES)),
    session: AsyncSession = Depends(get_db),
):
    customer = await session.get(Customer, body.customer_id)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found"
        )

    booking = Booking(
        tenant_id=auth.tenant.id,
        created_by=auth.user.id,
        **body.model_dump(),
    )
    session.add(booking)
    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="booking.created",
        entity="booking",
        entity_id=booking.id,
        meta={"customer_id": str(body.customer_id)},
    )
    return BookingOut.model_validate(await _reload(session, booking.id))


@router.post("/{booking_id}/assign", response_model=BookingOut)
async def assign_booking(
    booking_id: uuid.UUID,
    body: BookingAssign,
    auth: AuthContext = Depends(require_role(*WRITE_ROLES)),
    session: AsyncSession = Depends(get_db),
):
    booking = await _get_or_404(session, booking_id)
    if booking.status not in (BookingStatus.pending, BookingStatus.assigned):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot assign a {booking.status.value} booking",
        )

    driver = await session.get(Driver, body.driver_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
        )
    if driver.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Driver is not available for assignment",
        )

    cab = None
    if body.cab_id is not None:
        cab = await session.get(Cab, body.cab_id)
        if cab is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Cab not found"
            )
        if cab.status == "maintenance":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cab is in maintenance",
            )

    # Free a previously assigned cab before reassigning.
    if booking.cab_id is not None and booking.cab_id != body.cab_id:
        old_cab = await session.get(Cab, booking.cab_id)
        if old_cab is not None:
            old_cab.status = "available"

    booking.driver_id = body.driver_id
    booking.cab_id = body.cab_id
    booking.status = BookingStatus.assigned
    driver.status = "on_trip"
    if cab is not None:
        cab.status = "busy"

    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="booking.assigned",
        entity="booking",
        entity_id=booking.id,
        meta={"driver_id": str(body.driver_id), "cab_id": str(body.cab_id) if body.cab_id else None},
    )
    return BookingOut.model_validate(await _reload(session, booking.id))


@router.post("/{booking_id}/complete", response_model=BookingOut)
async def complete_booking(
    booking_id: uuid.UUID,
    body: BookingComplete,
    auth: AuthContext = Depends(require_role(*WRITE_ROLES)),
    session: AsyncSession = Depends(get_db),
):
    booking = await _get_or_404(session, booking_id)
    if booking.status != BookingStatus.assigned:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only assigned bookings can be completed",
        )

    booking.status = BookingStatus.completed
    if body.fare is not None:
        booking.fare = body.fare
    if body.notes is not None:
        booking.notes = body.notes

    if booking.driver_id is not None:
        driver = await session.get(Driver, booking.driver_id)
        if driver is not None:
            driver.status = "active"
    if booking.cab_id is not None:
        cab = await session.get(Cab, booking.cab_id)
        if cab is not None:
            cab.status = "available"

    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="booking.completed",
        entity="booking",
        entity_id=booking.id,
        meta={"fare": str(booking.fare) if booking.fare is not None else None},
    )
    return BookingOut.model_validate(await _reload(session, booking.id))


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(
    booking_id: uuid.UUID,
    auth: AuthContext = Depends(require_role(*WRITE_ROLES)),
    session: AsyncSession = Depends(get_db),
):
    booking = await _get_or_404(session, booking_id)
    if booking.status not in (BookingStatus.pending, BookingStatus.assigned):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel a {booking.status.value} booking",
        )

    booking.status = BookingStatus.cancelled
    if booking.driver_id is not None:
        driver = await session.get(Driver, booking.driver_id)
        if driver is not None:
            driver.status = "active"
    if booking.cab_id is not None:
        cab = await session.get(Cab, booking.cab_id)
        if cab is not None:
            cab.status = "available"

    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="booking.cancelled",
        entity="booking",
        entity_id=booking.id,
    )
    return BookingOut.model_validate(await _reload(session, booking.id))
