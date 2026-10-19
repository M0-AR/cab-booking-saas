from __future__ import annotations

import re

from pydantic import BaseModel, Field, field_validator

HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
DOMAIN_RE = re.compile(
    r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$"
)


class Brand(BaseModel):
    """Tenant brand config. Colors are hex-validated here AND again on render
    (CSS injection is a real attack — docs/RESEARCH.md §3)."""

    display_name: str | None = Field(default=None, max_length=120)
    primary_color: str | None = None
    accent_color: str | None = None
    logo_url: str | None = Field(default=None, max_length=500)

    @field_validator("primary_color", "accent_color")
    @classmethod
    def valid_hex(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not HEX_COLOR.match(v):
            raise ValueError("must be a hex color like #0f766e")
        return v.lower()


class FareConfig(BaseModel):
    base: float = Field(default=2.5, ge=0, le=1000)
    per_km: float = Field(default=1.2, ge=0, le=1000)
    per_min: float = Field(default=0.3, ge=0, le=1000)
    currency: str = Field(default="USD", min_length=3, max_length=3)


class SettingsOut(BaseModel):
    currency: str
    timezone: str
    brand: Brand
    features: dict
    fare: dict
    custom_domain: str | None = None


class SettingsUpdate(BaseModel):
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    timezone: str | None = Field(default=None, max_length=64)
    brand: Brand | None = None
    fare: FareConfig | None = None
    custom_domain: str | None = Field(default=None, max_length=255)

    @field_validator("custom_domain")
    @classmethod
    def valid_domain(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip().lower()
        if not DOMAIN_RE.match(v):
            raise ValueError("must be a valid domain like bookings.acme.com")
        return v


class PublicBranding(BaseModel):
    tenant_name: str
    tenant_slug: str
    display_name: str | None
    primary_color: str | None
    accent_color: str | None
    logo_url: str | None
    currency: str
