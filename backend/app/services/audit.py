from __future__ import annotations

import uuid

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def record(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    entity: str,
    entity_id: str | uuid.UUID | None = None,
    meta: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            # jsonable_encoder: PATCH payloads can carry dates/Decimals/UUIDs;
            # the JSONB column needs primitives or the commit serialization
            # fails (which would otherwise roll back the whole request).
            meta=jsonable_encoder(meta or {}),
        )
    )
