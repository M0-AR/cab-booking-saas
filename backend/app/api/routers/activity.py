from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.models import AuditLog, User
from app.schemas.activity import ActivityOut
from app.schemas.common import Page

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("", response_model=Page[ActivityOut])
async def list_activity(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    entity: str | None = Query(None, max_length=32),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
):
    conditions = []
    if entity:
        conditions.append(AuditLog.entity == entity)

    total = await session.scalar(
        select(func.count()).select_from(AuditLog).where(*conditions)
    )
    rows = await session.execute(
        select(AuditLog, User.full_name)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page(
        items=[
            ActivityOut(
                id=log.id,
                action=log.action,
                entity=log.entity,
                entity_id=log.entity_id,
                meta=log.meta or {},
                user_id=log.user_id,
                user_name=user_name,
                created_at=log.created_at,
            )
            for log, user_name in rows
        ],
        total=total or 0,
        page=page,
        page_size=page_size,
    )
