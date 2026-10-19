"""Login rate limiting (Redis token bucket per IP). Fail-open if Redis is down."""

from __future__ import annotations

from fastapi import HTTPException, status
from redis import asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()

_redis: aioredis.Redis | None = None


def _client() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url, encoding="utf-8", decode_responses=True
        )
    return _redis


async def check_login_rate_limit(ip: str) -> None:
    if not settings.rate_limit_enabled:
        return
    key = f"rl:login:{ip}"
    try:
        client = _client()
        current = await client.incr(key)
        if current == 1:
            await client.expire(key, 60)
        if current > settings.login_rate_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Try again in a minute.",
            )
    except HTTPException:
        raise
    except Exception:
        # Redis unavailable: fail open, never block logins on cache outage.
        return
