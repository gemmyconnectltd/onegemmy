import re
from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "staging", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    EXPENSE_RECEIPT_DIR: str = "./private/expense-receipts"

    ENVIRONMENT: Environment = "local"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://onegemmy:onegemmy@localhost:5432/onegemmy"
    PAWAPAY_API_TOKEN: str = ""
    PAWAPAY_SIGNING_PRIVATE_KEY: str = ""
    PAWAPAY_SIGNING_KEY_ID: str = ""
    PAWAPAY_ENVIRONMENT: Literal["sandbox", "production"] = "sandbox"
    # Explicit deployment approval required before accepting real money.
    PAWAPAY_LIVE_ENABLED: bool = False

    DATABASE_NEON_URL: str = ""  # Production Neon DB — set in .env

    SECRET_KEY: str = "insecure-dev-key-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Pesaa AI. The provider key lives only here on the backend (never sent to a client). With
    # AI_PROVIDER="mock" (the default) the assistant runs fully offline against real, scoped data
    # using deterministic replies — no paid API calls — so it can be built and tested for free.
    AI_PROVIDER: Literal["mock", "openai", "groq", "ollama"] = "mock"
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    # Groq speaks the OpenAI chat-completions protocol (incl. tool calling), so it reuses the same adapter.
    # Ollama runs models on your own machine (`ollama run llama3.2`); no key, no cost, no daily cap.
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
    OLLAMA_MODEL: str = "llama3.2"
    OLLAMA_TIMEOUT_SECONDS: float = 120.0  # local models are slower than hosted ones
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "openai/gpt-oss-120b"  # tool-calling model available on Groq; override with GROQ_MODEL
    AI_MODEL: str = "gpt-4o-mini"
    # Where the assistant sends people who ask for a human (same public group link the app's support button uses).
    SUPPORT_WHATSAPP_URL: str = "https://chat.whatsapp.com/KdYZ26ywxvK3x0clmLWedK?mode=gi_t"
    SUPPORT_EMAIL: str = "support@pesaa.io"
    AI_TIMEOUT_SECONDS: float = 30.0
    AI_MAX_TOOL_ROUNDS: int = 5
    AI_MAX_OUTPUT_TOKENS: int = 800
    # Rough USD per 1M tokens (input, output) used only to ESTIMATE cost in usage reports.
    AI_COST_PER_MTOK_IN: float = 0.15
    AI_COST_PER_MTOK_OUT: float = 0.60

    # Email — one shared SMTP host, but a separate mailbox per email
    # category (see app/core/email.py's `sender` param: "accounts" or
    # "admin"). SMTP_USER/SMTP_PASSWORD/EMAIL_FROM are the legacy
    # single-mailbox settings, kept as the fallback a category-specific
    # mailbox resolves to when it isn't configured — so a deployment that
    # hasn't set the ACCOUNTS_*/ADMIN_* vars yet keeps working unchanged.
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""  # Gmail App Password
    EMAIL_FROM: str = "Pesaa <eplotrobert@gmail.com>"

    # Account lifecycle mail (welcome, verification, password reset,
    # invites, ...). Falls back to SMTP_USER/SMTP_PASSWORD/EMAIL_FROM above
    # when unset.
    ACCOUNTS_SMTP_USER: str = ""
    ACCOUNTS_SMTP_PASSWORD: str = ""
    ACCOUNTS_EMAIL_FROM: str = ""

    # Admin/approval-workflow mail (tenant approval, pending-signup review
    # notices, ...). Falls back to SMTP_USER/SMTP_PASSWORD/EMAIL_FROM above
    # when unset.
    ADMIN_SMTP_USER: str = ""
    ADMIN_SMTP_PASSWORD: str = ""
    ADMIN_EMAIL_FROM: str = ""

    # ── Customer support center ───────────────────────────────────────────────────────────────────────────────
    # Support mail is sent through the SAME SMTP host as every other Pesaa email (set SMTP_HOST=smtp.office365.com
    # for Outlook); SUPPORT_* only select which mailbox/From it uses, falling back to the shared SMTP_* values.
    # Marketing mail (campaigns, newsletters, automations). Falls back to the shared SMTP_* values when unset.
    MARKETING_SMTP_USER: str = ""
    MARKETING_SMTP_PASSWORD: str = ""
    MARKETING_EMAIL_FROM: str = ""
    MARKETING_BACKGROUND: bool = True  # run the send/schedule worker in this process
    # Outside production, live marketing sends only go to these addresses (comma-separated); everyone else is skipped, so a
    # local or staging copy of the data can never email real businesses. Test sends to an address typed in are always allowed.
    MARKETING_TEST_RECIPIENTS: str = ""
    SUPPORT_SMTP_USER: str = ""
    SUPPORT_SMTP_PASSWORD: str = ""
    SUPPORT_EMAIL_FROM: str = ""
    # Inbound support mail needs Microsoft Graph (app-only, Mail.ReadWrite on the support mailbox). Unset = off.
    SUPPORT_MAILBOX: str = ""
    SUPPORT_SENDER_NAME: str = "Pesaa Support"
    SUPPORT_EMAIL_LOOKBACK_DAYS: int = 7
    # Inbound support mail over IMAP (cPanel and any standard mailbox). Read-only: never marks, moves or deletes mail.
    # SUPPORT_IMAP_SYNC_ENABLED is the explicit per-environment switch — keep it false anywhere that shares the mailbox
    # with production (staging), so only ONE environment ever imports a given mailbox.
    SUPPORT_IMAP_HOST: str = ""
    SUPPORT_IMAP_PORT: int = 993
    SUPPORT_IMAP_USER: str = ""
    SUPPORT_IMAP_PASSWORD: str = ""
    SUPPORT_IMAP_FOLDER: str = "INBOX"
    SUPPORT_IMAP_SYNC_ENABLED: bool = False
    GRAPH_TENANT_ID: str = ""
    GRAPH_CLIENT_ID: str = ""
    GRAPH_CLIENT_SECRET: str = ""
    # OpenWA (self-hosted WhatsApp gateway), reachable only over the private network — never from a browser.
    OPENWA_BASE_URL: str = ""  # e.g. http://openwa:2785/api
    OPENWA_API_KEY: str = ""
    OPENWA_WEBHOOK_SECRET: str = ""
    OPENWA_SESSION_NAME: str = "pesaa-support"
    # How OpenWA reaches THIS backend for webhooks (private address, e.g. http://backend:8000).
    OPENWA_WEBHOOK_TARGET: str = ""
    SUPPORT_BACKGROUND: bool = True  # WhatsApp health + email sync loop (still a no-op until configured)

    # Where the public marketing-site contact form is delivered.
    CONTACT_INBOX: str = "robertniyitanga3@gmail.com"
    FRONTEND_URL: str = "http://localhost:3000"
    API_PUBLIC_URL: str = "http://localhost:8000"  # public origin of this API; used in unsubscribe links in outgoing marketing messages

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
    def _enforce_production_safety(self) -> Settings:
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
