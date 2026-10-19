from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKeyConstraint,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TenantMixin, created_at_col, uuid_pk
from app.models.fleet import Cab, Driver


class BookingStatus(str, enum.Enum):
    pending = "pending"
    assigned = "assigned"
    completed = "completed"
    cancelled = "cancelled"


class Customer(TenantMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_customers_tenant_id_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = created_at_col()


class Booking(TenantMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        # Composite FKs make cross-tenant references structurally impossible.
        ForeignKeyConstraint(
            ["tenant_id", "customer_id"],
            ["customers.tenant_id", "customers.id"],
            name="fk_bookings_tenant_customer",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "driver_id"],
            ["drivers.tenant_id", "drivers.id"],
            name="fk_bookings_tenant_driver",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "cab_id"],
            ["cabs.tenant_id", "cabs.id"],
            name="fk_bookings_tenant_cab",
        ),
        CheckConstraint(
            "status IN ('pending', 'assigned', 'completed', 'cancelled')",
            name="status_valid",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    customer_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    cab_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    pickup: Mapped[str] = mapped_column(String(255), nullable=False)
    dropoff: Mapped[str] = mapped_column(String(255), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    status: Mapped[BookingStatus] = mapped_column(
        Enum(
            BookingStatus,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=text("'pending'"),
    )
    fare: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    customer: Mapped[Customer] = relationship(lazy="selectin", overlaps="driver,cab")
    driver: Mapped[Driver | None] = relationship(lazy="selectin", overlaps="customer,cab")
    cab: Mapped[Cab | None] = relationship(lazy="selectin", overlaps="customer,driver")
