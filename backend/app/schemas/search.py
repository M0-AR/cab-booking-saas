from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class SearchHit(BaseModel):
    id: uuid.UUID
    title: str
    subtitle: str | None = None
    badge: str | None = None


class SearchResults(BaseModel):
    bookings: list[SearchHit] = Field(default_factory=list)
    customers: list[SearchHit] = Field(default_factory=list)
    drivers: list[SearchHit] = Field(default_factory=list)
    cabs: list[SearchHit] = Field(default_factory=list)
