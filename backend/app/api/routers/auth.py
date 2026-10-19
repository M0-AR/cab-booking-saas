from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context
from app.core.rate_limit import check_login_rate_limit
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    refresh_token_expiry,
    verify_password,
)
from app.core.tenancy import resolve_tenant_id, set_rls_context
from app.db.session import get_db
from app.models import (
    DEFAULT_BRAND,
    DEFAULT_FARE,
    DEFAULT_FEATURES,
    RefreshToken,
    Tenant,
    TenantSettings,
    User,
    UserRole,
)
from app.schemas.auth import (
    LoginRequest,
    MeOut,
    RefreshRequest,
    SignupRequest,
    TenantOut,
    TokenResponse,
    UserOut,
)
from app.services import audit

router = APIRouter(prefix="/auth", tags=["auth"])


async def _issue_tokens(
    session: AsyncSession, user: User, tenant: Tenant
) -> TokenResponse:
    access = create_access_token(
        user_id=user.id, tenant_id=tenant.id, role=user.role.value, email=user.email
    )
    raw_refresh, refresh_hash = new_refresh_token()
    session.add(
        RefreshToken(
            tenant_id=tenant.id,
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=refresh_token_expiry(),
        )
    )
    return TokenResponse(
        access_token=access,
        refresh_token=raw_refresh,
        user=UserOut.model_validate(user),
        tenant=TenantOut.model_validate(tenant),
    )


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, session: AsyncSession = Depends(get_db)):
    existing = await session.scalar(select(Tenant).where(Tenant.slug == body.slug))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That organization slug is already taken",
        )

    tenant = Tenant(slug=body.slug, name=body.tenant_name)
    session.add(tenant)
    await session.flush()

    # Tenant exists now: set RLS context before touching RLS-protected tables.
    await set_rls_context(session, tenant.id, None)

    user = User(
        tenant_id=tenant.id,
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=UserRole.owner,
    )
    session.add(user)
    await session.flush()

    session.add(
        TenantSettings(
            tenant_id=tenant.id,
            brand=dict(DEFAULT_BRAND),
            features=dict(DEFAULT_FEATURES),
            fare=dict(DEFAULT_FARE),
        )
    )
    await audit.record(
        session,
        tenant_id=tenant.id,
        user_id=user.id,
        action="tenant.created",
        entity="tenant",
        entity_id=tenant.id,
        meta={"slug": tenant.slug},
    )
    return await _issue_tokens(session, user, tenant)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    await check_login_rate_limit(client_ip)

    slug = body.tenant_slug or getattr(request.state, "tenant_slug", None)
    host_domain = getattr(request.state, "host_domain", None)
    tenant_id = await resolve_tenant_id(
        session, slug=slug, domain=host_domain
    )
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials or unknown organization",
        )

    await set_rls_context(session, tenant_id, None)
    user = await session.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated"
        )

    tenant = await session.get(Tenant, tenant_id)
    if tenant is None or tenant.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is not active"
        )

    await audit.record(
        session,
        tenant_id=tenant.id,
        user_id=user.id,
        action="auth.login",
        entity="user",
        entity_id=user.id,
    )
    return await _issue_tokens(session, user, tenant)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest, session: AsyncSession = Depends(get_db)
):
    token_hash = hash_refresh_token(body.refresh_token)

    # SECURITY DEFINER lookup: tenant is not known yet (RLS chicken-and-egg).
    row = (
        await session.execute(
            text(
                "SELECT tenant_id, user_id, expires_at, revoked_at "
                "FROM auth_lookup_refresh(:h)"
            ),
            {"h": token_hash},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    if row["revoked_at"] is not None:
        # Reuse of a rotated token: nuke the whole family for this user.
        # Commit explicitly: get_db would roll this back when we raise below.
        await set_rls_context(session, row["tenant_id"], None)
        await session.execute(
            text(
                "UPDATE refresh_tokens SET revoked_at = now() "
                "WHERE user_id = :uid AND revoked_at IS NULL"
            ),
            {"uid": row["user_id"]},
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    expires_at: datetime = row["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired"
        )

    await set_rls_context(session, row["tenant_id"], row["user_id"])
    user = await session.get(User, row["user_id"])
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )
    tenant = await session.get(Tenant, row["tenant_id"])
    if tenant is None or tenant.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is not active"
        )

    rotated = await session.execute(
        text(
            "UPDATE refresh_tokens SET revoked_at = now() "
            "WHERE token_hash = :h AND revoked_at IS NULL"
        ),
        {"h": token_hash},
    )
    if rotated.rowcount != 1:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    return await _issue_tokens(session, user, tenant)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, session: AsyncSession = Depends(get_db)):
    token_hash = hash_refresh_token(body.refresh_token)
    row = (
        await session.execute(
            text(
                "SELECT tenant_id, user_id FROM auth_lookup_refresh(:h)"
            ),
            {"h": token_hash},
        )
    ).mappings().first()
    if row is not None:
        await set_rls_context(session, row["tenant_id"], row["user_id"])
        await session.execute(
            text(
                "UPDATE refresh_tokens SET revoked_at = now() "
                "WHERE token_hash = :h AND revoked_at IS NULL"
            ),
            {"h": token_hash},
        )


@router.get("/me", response_model=MeOut)
async def me(auth: AuthContext = Depends(get_auth_context)):
    return MeOut(
        user=UserOut.model_validate(auth.user),
        tenant=TenantOut.model_validate(auth.tenant),
        features=auth.features,
    )
