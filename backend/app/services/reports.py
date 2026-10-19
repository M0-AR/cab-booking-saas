from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, Driver
from app.schemas.report import DailyPoint, ReportSummary, TopDriver

ZERO = 0


async def build_summary(
    session: AsyncSession, *, date_from: datetime, date_to: datetime
) -> ReportSummary:
    window = (Booking.created_at >= date_from) & (Booking.created_at <= date_to)

    status_rows = await session.execute(
        select(Booking.status, func.count())
        .where(window)
        .group_by(Booking.status)
    )
    by_status: dict[str, int] = {s.value: ZERO for s in BookingStatus}
    total = ZERO
    for st, cnt in status_rows:
        key = st.value if isinstance(st, BookingStatus) else str(st)
        by_status[key] = cnt
        total += cnt

    revenue, avg_fare = (
        await session.execute(
            select(
                func.coalesce(func.sum(Booking.fare), 0),
                func.avg(Booking.fare),
            ).where(window, Booking.status == BookingStatus.completed)
        )
    ).one()

    daily_rows = await session.execute(
        select(
            func.date_trunc("day", Booking.created_at).label("day"),
            func.count(),
            func.coalesce(
                func.sum(
                    case((Booking.status == BookingStatus.completed, Booking.fare))
                ),
                0,
            ),
        )
        .where(window)
        .group_by("day")
        .order_by("day")
    )
    daily = [
        DailyPoint(day=day.date() if isinstance(day, datetime) else day,
                   bookings=cnt, revenue=rev)
        for day, cnt, rev in daily_rows
    ]

    driver_rows = await session.execute(
        select(Driver.id, Driver.name, func.count(Booking.id))
        .join(Booking, Booking.driver_id == Driver.id)
        .where(window, Booking.status == BookingStatus.completed)
        .group_by(Driver.id, Driver.name)
        .order_by(func.count(Booking.id).desc())
        .limit(5)
    )
    top_drivers = [
        TopDriver(driver_id=did, name=name, completed=cnt)
        for did, name, cnt in driver_rows
    ]

    return ReportSummary(
        total_bookings=total,
        by_status=by_status,
        revenue=revenue,
        avg_fare=avg_fare,
        daily=daily,
        top_drivers=top_drivers,
    )
