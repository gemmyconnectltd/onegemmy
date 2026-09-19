import re
from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "staging", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENVIRONMENT: Environment = "local"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://onegemmy:onegemmy@localhost:5432/onegemmy"
    DATABASE_NEON_URL: str = ""  # Production Neon DB — set in .env

    SECRET_KEY: str = "insecure-dev-key-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Email (Gmail SMTP) — set SMTP_USER and SMTP_PASSWORD to enable sending.
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""  # Gmail App Password
    EMAIL_FROM: str = "Pesaa <eplotrobert@gmail.com>"
    FRONTEND_URL: str = "http://localhost:3000"

    UPLOAD_DIR: str = "uploads"

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    LOG_LEVEL: str = "DEBUG"
    LOG_FILE: str | None = None
    LOG_FORMAT: str = "console"

    SEED_ADMIN_PASSWORD: str = "admin123"
    SEED_USER_PASSWORD: str = "user123"
    SEED_SUPER_ADMIN_PASSWORD: str = "superadmin123"

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        if "*" in origins:
            return ["*"]
        # Wildcard-subdomain entries (e.g. "https://*.pesaa.io") are matched
        # via cors_origin_regex instead of an exact-match origin here.
        return [origin for origin in origins if "*" not in origin]

    @property
    def cors_origin_regex(self) -> str | None:
        """Turn any "https://*.domain.tld" entries in CORS_ORIGINS into a
        regex so every subdomain of an owned domain (app., mobile., etc.) is
        allowed without listing each one individually — exact origins are
        still matched via cors_origins_list."""
        patterns = [
            "^" + re.escape(origin.strip()).replace(r"\*", r"[a-z0-9-]+(?:\.[a-z0-9-]+)*") + "$"
            for origin in self.CORS_ORIGINS.split(",")
            if "*" in origin.strip() and origin.strip() != "*"
        ]
        return "|".join(patterns) if patterns else None

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def _enforce_production_safety(self) -> "Settings":
        if not self.is_production:
            return self

        # Defense in depth: these must hold in production regardless of what
        # a misconfigured .env says, since a mistake here is a security issue.
        if self.SECRET_KEY == "insecure-dev-key-change-me":
            raise ValueError("SECRET_KEY must be set to a real secret in production")
        if "*" in self.cors_origins_list:
            raise ValueError("CORS_ORIGINS must not be '*' in production")
        self.DEBUG = False
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
