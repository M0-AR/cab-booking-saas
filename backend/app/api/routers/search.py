from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context
from app.core.like import like_pattern
from app.db.session import get_db
from app.models import Booking, Cab, Customer, Driver
from app.schemas.search import SearchHit, SearchResults

router = APIRouter(prefix="/search", tags=["search"])

GROUP_LIMIT = 5
ESCAPE = "\\"


@router.get("", response_model=SearchResults)
async def search(
    q: str = Query(min_length=2, max_length=120),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    """Cross-entity search for the command palette.

    RLS scopes every query to the caller's tenant; the explicit tenant filters
    below are therefore redundant by design and intentionally omitted.
    """
    pattern = like_pattern(q)

    booking_rows = await session.scalars(
        select(Booking)
        .where(
            or_(
                Booking.pickup.ilike(pattern, escape=ESCAPE),
                Booking.dropoff.ilike(pattern, escape=ESCAPE),
                Booking.notes.ilike(pattern, escape=ESCAPE),
                Booking.customer.has(Customer.name.ilike(pattern, escape=ESCAPE)),
                Booking.customer.has(Customer.phone.ilike(pattern, escape=ESCAPE)),
                Booking.driver.has(Driver.name.ilike(pattern, escape=ESCAPE)),
            )
        )
        .order_by(Booking.scheduled_at.desc())
        .limit(GROUP_LIMIT)
    )

    customer_rows = await session.scalars(
        select(Customer)
        .where(
            or_(
                Customer.name.ilike(pattern, escape=ESCAPE),
                Customer.phone.ilike(pattern, escape=ESCAPE),
                Customer.email.ilike(pattern, escape=ESCAPE),
            )
        )
        .order_by(Customer.created_at.desc())
        .limit(GROUP_LIMIT)
    )

    driver_rows = await session.scalars(
        select(Driver)
        .where(
            or_(
                Driver.name.ilike(pattern, escape=ESCAPE),
                Driver.phone.ilike(pattern, escape=ESCAPE),
                Driver.license_no.ilike(pattern, escape=ESCAPE),
            )
        )
        .order_by(Driver.created_at.desc())
        .limit(GROUP_LIMIT)
    )

    cab_rows = await session.scalars(
        select(Cab)
        .where(
            or_(
                Cab.model.ilike(pattern, escape=ESCAPE),
                Cab.plate.ilike(pattern, escape=ESCAPE),
            )
        )
        .order_by(Cab.created_at.desc())
        .limit(GROUP_LIMIT)
    )

    return SearchResults(
        bookings=[
            SearchHit(
                id=b.id,
                title=b.customer.name,
                subtitle=f"{b.pickup} → {b.dropoff}",
                badge=b.status.value,
            )
            for b in booking_rows
        ],
        customers=[
            SearchHit(id=c.id, title=c.name, subtitle=c.phone)
            for c in customer_rows
        ],
        drivers=[
            SearchHit(
                id=d.id,
                title=d.name,
                subtitle=d.phone,
                badge=d.status,
            )
            for d in driver_rows
        ],
        cabs=[
            SearchHit(
                id=c.id,
                title=f"{c.model} · {c.plate}",
                subtitle=None,
                badge=c.status,
            )
            for c in cab_rows
        ],
    )
