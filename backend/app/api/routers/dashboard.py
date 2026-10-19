from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.models import Booking, BookingStatus, Cab, Driver
from app.schemas.attention import AttentionBooking, AttentionExpiry, AttentionOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ROW_LIMIT = 5
EXPIRY_WINDOW_DAYS = 30
OVERDUE_GRACE_MINUTES = 30
OPEN_STATUSES = (BookingStatus.pending, BookingStatus.assigned)


@router.get("/attention", response_model=AttentionOut)
async def attention(
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    """Exception-first summary for the dashboard ("what needs me now").

    Three buckets: unassigned pending bookings, overdue trips (scheduled more
    than 30 min ago and still open) and compliance documents expiring within
    30 days or already expired. Counts are exact; item lists are capped.
    """
    now = datetime.now(timezone.utc)
    overdue_cutoff = now - timedelta(minutes=OVERDUE_GRACE_MINUTES)
    today = now.date()
    horizon = today + timedelta(days=EXPIRY_WINDOW_DAYS)

    unassigned_count = await session.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.status == BookingStatus.pending)
    )
    unassigned_rows = await session.scalars(
        select(Booking)
        .where(Booking.status == BookingStatus.pending)
        .order_by(Booking.scheduled_at.asc())
        .limit(ROW_LIMIT)
    )

    overdue_count = await session.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.status.in_(OPEN_STATUSES),
            Booking.scheduled_at < overdue_cutoff,
        )
    )
    overdue_rows = await session.scalars(
        select(Booking)
        .where(
            Booking.status.in_(OPEN_STATUSES),
            Booking.scheduled_at < overdue_cutoff,
        )
        .order_by(Booking.scheduled_at.asc())
        .limit(ROW_LIMIT)
    )

    expiring: list[AttentionExpiry] = []
    driver_rows = await session.scalars(
        select(Driver)
        .where(Driver.license_expiry.is_not(None), Driver.license_expiry <= horizon)
        .order_by(Driver.license_expiry.asc())
        .limit(10)
    )
    for driver in driver_rows:
        assert driver.license_expiry is not None
        expiring.append(
            AttentionExpiry(
                entity="driver",
                entity_id=driver.id,
                label=driver.name,
                kind="license",
                expires_on=driver.license_expiry,
                days_left=(driver.license_expiry - today).days,
            )
        )

    cab_rows = await session.scalars(
        select(Cab)
        .where(
            or_(
                Cab.insurance_expiry.is_not(None),
                Cab.registration_expiry.is_not(None),
            ),
            or_(
                Cab.insurance_expiry <= horizon,
                Cab.registration_expiry <= horizon,
            ),
        )
        .limit(50)
    )
    for cab in cab_rows:
        for kind, expires_on in (
            ("insurance", cab.insurance_expiry),
            ("registration", cab.registration_expiry),
        ):
            if expires_on is not None and expires_on <= horizon:
                expiring.append(
                    AttentionExpiry(
                        entity="cab",
                        entity_id=cab.id,
                        label=f"{cab.model} · {cab.plate}",
                        kind=kind,
                        expires_on=expires_on,
                        days_left=(expires_on - today).days,
                    )
                )

    expiring.sort(key=lambda item: (item.days_left, item.label))

    def to_attention(booking: Booking) -> AttentionBooking:
        return AttentionBooking(
            id=booking.id,
            customer_name=booking.customer.name,
            customer_phone=booking.customer.phone,
            pickup=booking.pickup,
            dropoff=booking.dropoff,
            scheduled_at=booking.scheduled_at,
            status=booking.status.value,
        )

    return AttentionOut(
        unassigned_count=unassigned_count or 0,
        unassigned=[to_attention(b) for b in unassigned_rows],
        overdue_count=overdue_count or 0,
        overdue=[to_attention(b) for b in overdue_rows],
        expiring=expiring[:10],
    )
