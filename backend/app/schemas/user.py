from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    role: str = Field(default="viewer", pattern=r"^(owner|admin|manager|driver|viewer)$")

    @field_validator("email")
    @classmethod
    def lower_email(cls, v: str) -> str:
        return v.lower()


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    role: str | None = Field(
        default=None, pattern=r"^(owner|admin|manager|driver|viewer)$"
    )
    is_active: bool | None = None
