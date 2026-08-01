from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENVIRONMENT: str = "local"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://onegemmy:onegemmy@localhost:5432/onegemmy"

    SECRET_KEY: str = "insecure-dev-key-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30

    UPLOAD_DIR: str = "uploads"

    CORS_ORIGINS: str = "http://localhost:3000"

    LOG_LEVEL: str = "DEBUG"
    LOG_FILE: str | None = None
    LOG_FORMAT: str = "console"

    SEED_ADMIN_PASSWORD: str = "admin123"
    SEED_USER_PASSWORD: str = "user123"
    SEED_SUPER_ADMIN_PASSWORD: str = "superadmin123"

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        return ["*"] if "*" in origins else origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
