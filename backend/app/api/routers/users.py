from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, require_role
from app.core.security import hash_password
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas.auth import UserOut
from app.schemas.common import Page
from app.schemas.user import UserCreate, UserUpdate
from app.services import audit
from app.services.entitlements import enforce_user_quota

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=Page[UserOut])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    auth: AuthContext = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
):
    total = await session.scalar(select(func.count()).select_from(User))
    rows = await session.scalars(
        select(User).order_by(User.created_at).offset((page - 1) * page_size).limit(page_size)
    )
    return Page(
        items=[UserOut.model_validate(u) for u in rows],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    auth: AuthContext = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
):
    if body.role in ("owner", "admin") and auth.user.role != UserRole.owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can create owner/admin users",
        )
    await enforce_user_quota(session, auth.tenant.id)

    existing = await session.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        tenant_id=auth.tenant.id,
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=UserRole(body.role),
    )
    session.add(user)
    await session.flush()
    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="user.created",
        entity="user",
        entity_id=user.id,
        meta={"role": body.role},
    )
    return UserOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    auth: AuthContext = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
):
    if user_id == auth.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role or activation",
        )

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    changes = body.model_dump(exclude_unset=True)
    if changes.get("role") in ("owner", "admin") and auth.user.role != UserRole.owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can grant owner/admin roles",
        )

    if user.role == UserRole.owner and (
        changes.get("is_active") is False or "role" in changes
    ):
        owners = await session.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == UserRole.owner, User.is_active.is_(True))
        )
        if (owners or 0) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot demote or deactivate the last active owner",
            )

    if "full_name" in changes:
        user.full_name = changes["full_name"]
    if "role" in changes:
        user.role = UserRole(changes["role"])
    if "is_active" in changes:
        user.is_active = changes["is_active"]
    await session.flush()

    await audit.record(
        session,
        tenant_id=auth.tenant.id,
        user_id=auth.user.id,
        action="user.updated",
        entity="user",
        entity_id=user.id,
        meta=changes,
    )
    return UserOut.model_validate(user)
