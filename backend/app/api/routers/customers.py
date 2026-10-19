from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, require_role
from app.core.like import like_pattern
from app.db.session import get_db
from app.models import Booking, Customer
from app.schemas.booking import CustomerCreate, CustomerOut, CustomerUpdate
from app.schemas.common import Page
from app.services import audit

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=Page[CustomerOut])
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = Query(None, max_length=120),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    query = select(Customer)
    count_q = select(func.count()).select_from(Customer)
    if q:
        pattern = like_pattern(q)
        condition = Customer.name.ilike(pattern, escape="\\") | Customer.phone.ilike(
            pattern, escape="\\"
        )
        query = query.where(condition)
        count_q = count_q.where(condition)

    total = await session.scalar(count_q)
    rows = await session.scalars(
        query.order_by(Customer.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page(
        items=[CustomerOut.model_validate(c) for c in rows],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    auth: AuthContext = Depends(require_role("owner", "admin", "manager")),
    session: AsyncSession = Depends(get_db),
):
    customer = Customer(tenant_id=auth.tenant.id, **body.model_dump())
    session.add(customer)
    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="customer.created",
        entity="customer",
        entity_id=customer.id,
        meta={"name": customer.name},
    )
    return CustomerOut.model_validate(customer)


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: uuid.UUID,
    body: CustomerUpdate,
    auth: AuthContext = Depends(require_role("owner", "admin", "manager")),
    session: AsyncSession = Depends(get_db),
):
    customer = await session.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found"
        )
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(customer, key, value)
    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="customer.updated",
        entity="customer",
        entity_id=customer.id,
        meta=changes,
    )
    return CustomerOut.model_validate(customer)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: uuid.UUID,
    auth: AuthContext = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
):
    customer = await session.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found"
        )
    bookings = await session.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.customer_id == customer_id)
    )
    if (bookings or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Customer has bookings and cannot be deleted",
        )
    await session.execute(delete(Customer).where(Customer.id == customer_id))
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="customer.deleted",
        entity="customer",
        entity_id=customer_id,
    )
