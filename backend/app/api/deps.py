from __future__ import annotations

import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.core.tenancy import set_rls_context
from app.db.session import get_db
from app.models import Tenant, User
from app.services.entitlements import get_tenant_settings

bearer_scheme = HTTPBearer(auto_error=False)

UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


@dataclass
class AuthContext:
    session: AsyncSession
    user: User
    tenant: Tenant
    features: dict


async def get_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
) -> AuthContext:
    if credentials is None:
        raise UNAUTHORIZED
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
        tenant_id = uuid.UUID(payload["tenant"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise UNAUTHORIZED

    # JWT signature is valid: the tenant claim is now trusted and becomes the
    # RLS context. The user row lookup below is itself RLS-guarded — a forged
    # token for a user in another tenant resolves to None.
    await set_rls_context(session, tenant_id, user_id)

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise UNAUTHORIZED

    tenant = await session.get(Tenant, tenant_id)
    if tenant is None or tenant.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is not active"
        )

    settings_row = await get_tenant_settings(session, tenant_id)
    return AuthContext(
        session=session, user=user, tenant=tenant, features=dict(settings_row.features)
    )


def require_role(*roles: str):
    async def dependency(
        auth: AuthContext = Depends(get_auth_context),
    ) -> AuthContext:
        if auth.user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not allow this action",
            )
        return auth

    return dependency
