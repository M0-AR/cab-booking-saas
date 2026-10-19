from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class DailyPoint(BaseModel):
    day: date
    bookings: int
    revenue: Decimal


class TopDriver(BaseModel):
    driver_id: uuid.UUID
    name: str
    completed: int


class ReportSummary(BaseModel):
    total_bookings: int
    by_status: dict[str, int]
    revenue: Decimal
    avg_fare: Decimal | None
    daily: list[DailyPoint]
    top_drivers: list[TopDriver]
