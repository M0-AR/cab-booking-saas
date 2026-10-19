from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class AttentionBooking(BaseModel):
    id: uuid.UUID
    customer_name: str
    customer_phone: str
    pickup: str
    dropoff: str
    scheduled_at: datetime
    status: str


class AttentionExpiry(BaseModel):
    entity: str  # "driver" | "cab"
    entity_id: uuid.UUID
    label: str  # human-readable: driver name, or "model · plate"
    kind: str  # "license" | "insurance" | "registration"
    expires_on: date
    days_left: int


class AttentionOut(BaseModel):
    unassigned_count: int
    unassigned: list[AttentionBooking] = Field(default_factory=list)
    overdue_count: int
    overdue: list[AttentionBooking] = Field(default_factory=list)
    expiring: list[AttentionExpiry] = Field(default_factory=list)
