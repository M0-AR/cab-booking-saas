from __future__ import annotations

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routers import (
    activity,
    auth,
    bookings,
    cabs,
    customers,
    dashboard,
    drivers,
    public,
    reports,
    search,
    settings as settings_router,
    users,
)
from app.core.config import get_settings
from app.core.tenancy import TenantResolutionMiddleware
from app.db.session import SessionLocal

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(TenantResolutionMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    public.router,
    users.router,
    settings_router.router,
    cabs.router,
    drivers.router,
    customers.router,
    bookings.router,
    reports.router,
    search.router,
    activity.router,
    dashboard.router,
):
    app.include_router(router, prefix=settings.api_v1_prefix)


@app.get("/livez", tags=["health"])
async def livez():
    return {"status": "ok"}


@app.get("/readyz", tags=["health"])
async def readyz(response: Response):
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "database": "down"}
    return {"status": "ok", "database": "up"}
