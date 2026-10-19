from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class DriverBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=5, max_length=32)
    license_no: str | None = Field(default=None, max_length=64)
    license_expiry: date | None = None
    status: str = Field(default="active", pattern=r"^(active|inactive|on_trip)$")


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, min_length=5, max_length=32)
    license_no: str | None = Field(default=None, max_length=64)
    license_expiry: date | None = None
    status: str | None = Field(default=None, pattern=r"^(active|inactive|on_trip)$")


class DriverOut(DriverBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class CabBase(BaseModel):
    model: str = Field(min_length=1, max_length=120)
    plate: str = Field(min_length=2, max_length=16)
    capacity: int = Field(default=4, ge=1, le=30)
    status: str = Field(default="available", pattern=r"^(available|busy|maintenance)$")
    driver_id: uuid.UUID | None = None
    insurance_expiry: date | None = None
    registration_expiry: date | None = None


class CabCreate(CabBase):
    pass


class CabUpdate(BaseModel):
    model: str | None = Field(default=None, min_length=1, max_length=120)
    plate: str | None = Field(default=None, min_length=2, max_length=16)
    capacity: int | None = Field(default=None, ge=1, le=30)
    status: str | None = Field(
        default=None, pattern=r"^(available|busy|maintenance)$"
    )
    driver_id: uuid.UUID | None = None
    insurance_expiry: date | None = None
    registration_expiry: date | None = None


class CabOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    model: str
    plate: str
    capacity: int
    status: str
    driver_id: uuid.UUID | None
    insurance_expiry: date | None
    registration_expiry: date | None
    created_at: datetime
