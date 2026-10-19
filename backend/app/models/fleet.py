from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TenantMixin, created_at_col, uuid_pk


class Driver(TenantMixin, Base):
    __tablename__ = "drivers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_drivers_tenant_id_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    license_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    license_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'active'")
    )
    created_at: Mapped[datetime] = created_at_col()

    cabs: Mapped[list["Cab"]] = relationship(back_populates="driver", lazy="selectin")


class Cab(TenantMixin, Base):
    __tablename__ = "cabs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "plate", name="uq_cabs_tenant_plate"),
        UniqueConstraint("tenant_id", "id", name="uq_cabs_tenant_id_id"),
        ForeignKeyConstraint(
            ["tenant_id", "driver_id"],
            ["drivers.tenant_id", "drivers.id"],
            name="fk_cabs_tenant_driver",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    plate: Mapped[str] = mapped_column(String(16), nullable=False)
    capacity: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("4")
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'available'")
    )
    driver_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    insurance_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    registration_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    driver: Mapped[Driver | None] = relationship(back_populates="cabs", lazy="selectin")
