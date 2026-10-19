from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    env: str = "dev"
    app_name: str = "Cab Booking SaaS"
    api_v1_prefix: str = "/api/v1"

    # Runtime connection: MUST be the non-owner app_user so RLS applies.
    database_url: str = (
        "postgresql+asyncpg://app_user:app_password@localhost:5432/cab_booking"
    )
    # Owner connection used only by Alembic (creates role/tables/policies).
    migration_database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/cab_booking"
    )
    app_db_password: str = "app_password"

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 20
    refresh_token_days: int = 14

    cors_origins: str = "http://localhost:3000"
    platform_base_domain: str = "localhost"

    rate_limit_enabled: bool = True
    login_rate_per_minute: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
