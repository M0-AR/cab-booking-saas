from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.booking import BookingStatus
from app.schemas.fleet import CabOut, DriverOut


class CustomerBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=5, max_length=32)
    email: str | None = Field(default=None, max_length=255)


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, min_length=5, max_length=32)
    email: str | None = Field(default=None, max_length=255)


class CustomerOut(CustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class BookingCreate(BaseModel):
    customer_id: uuid.UUID
    pickup: str = Field(min_length=2, max_length=255)
    dropoff: str = Field(min_length=2, max_length=255)
    scheduled_at: datetime
    fare: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("scheduled_at")
    @classmethod
    def require_tz(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class BookingAssign(BaseModel):
    driver_id: uuid.UUID
    cab_id: uuid.UUID | None = None


class BookingComplete(BaseModel):
    fare: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer: CustomerOut
    driver: DriverOut | None
    cab: CabOut | None
    pickup: str
    dropoff: str
    scheduled_at: datetime
    status: BookingStatus
    fare: Decimal | None
    notes: str | None
    created_at: datetime


class BookingFilters(BaseModel):
    status: BookingStatus | None = None
    customer_id: uuid.UUID | None = None
    driver_id: uuid.UUID | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
