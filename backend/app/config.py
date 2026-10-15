"""
Application configuration.

Every environment-specific value is read from the environment (or a local
.env file) rather than baked into the source, so the same image runs
unchanged in local development, CI and production. Nothing here has a
production-safe default that could silently ship a weak secret: the
security-critical settings fail loudly instead.
"""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# HS256 signs with SHA-256, so a key shorter than the 32-byte digest adds
# no strength beyond its own length.
MIN_SECRET_KEY_BYTES = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Identity -----------------------------------------------------------
    PROJECT_NAME: str = "IntelliCredit"
    API_V1_PREFIX: str = "/api"
    ENVIRONMENT: str = "development"

    # --- Security -----------------------------------------------------------
    # Generated per-process in development; MUST be supplied in production or
    # every restart invalidates outstanding tokens.
    SECRET_KEY: str = Field(default="dev-only-insecure-key-change-me")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12

    # --- Persistence --------------------------------------------------------
    # SQLite locally, Postgres in production. The application code is written
    # against the SQLAlchemy Core API only, so the swap is a URL change.
    DATABASE_URL: str = "sqlite:///./intellicredit.db"

    # --- CORS ---------------------------------------------------------------
    # Comma-separated. Vercel preview deployments get a wildcard regex so that
    # every preview build can reach the API without a redeploy of the backend.
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]
    ALLOWED_ORIGIN_REGEX: str | None = r"https://.*\.vercel\.app"

    # --- Rate limiting -------------------------------------------------------
    # Open registration plus two model-backed endpoints means an unthrottled
    # public URL can be used to farm accounts or spend the API budget.
    RATE_LIMIT_ENABLED: bool = True
    # In-process counters by default. Point at Redis ("redis://...") once the
    # API runs on more than one instance, or each instance keeps its own count.
    RATE_LIMIT_STORAGE_URI: str = "memory://"
    RATE_LIMIT_DEFAULT: str = "240/minute"       # generous; catches runaway clients
    RATE_LIMIT_REGISTER: str = "5/hour"          # per address - account farming
    RATE_LIMIT_LOGIN: str = "10/minute"          # per address - password guessing
    RATE_LIMIT_LLM: str = "20/hour"              # per user - direct model spend
    RATE_LIMIT_UPLOAD: str = "60/hour"           # per user - parsing is expensive

    # Reverse proxies between the client and this process. 0 means trust the
    # socket address and ignore X-Forwarded-For; 1 is correct behind Render.
    # Setting this higher than the true number lets a client spoof its address.
    TRUSTED_PROXY_HOPS: int = 0

    # --- Document storage ---------------------------------------------------
    UPLOAD_DIR: str = "files"
    MAX_UPLOAD_BYTES: int = 15 * 1024 * 1024        # 15 MB per file
    MAX_FILES_PER_REQUEST: int = 20

    # --- LLM ----------------------------------------------------------------
    # Absent key == the model layer is disabled and every call falls back to
    # the deterministic path. The app is fully functional without it.
    ANTHROPIC_API_KEY: str | None = None
    LLM_MODEL: str = "claude-opus-5"
    LLM_MAX_TOKENS: int = 16000
    LLM_TIMEOUT_SECONDS: float = 120.0
    # Effort trades thoroughness against token spend. Extraction and
    # classification are mechanical, so they run low; the memo narrative and
    # the analyst chat reason over the whole case, so they run high.
    LLM_EFFORT_MECHANICAL: str = "low"
    LLM_EFFORT_ANALYTICAL: str = "high"

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value):
        """Accept either a JSON list or a plain comma-separated string."""
        if isinstance(value, str) and not value.strip().startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in ("production", "prod")

    @property
    def llm_enabled(self) -> bool:
        return bool(self.ANTHROPIC_API_KEY)


@lru_cache
def get_settings() -> Settings:
    """Cached so the environment is parsed once per process."""
    settings = Settings()
    if settings.is_production:
        # Both checks matter: a placeholder is the obvious mistake, but a short
        # real key is the quiet one. HS256 keys shorter than the 32-byte hash
        # output weaken the signature, and PyJWT itself warns about them - fail
        # the boot instead, so it cannot be missed in a deploy log.
        if settings.SECRET_KEY.startswith("dev-only"):
            raise RuntimeError(
                "SECRET_KEY must be set to a strong random value in production. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        if len(settings.SECRET_KEY.encode()) < MIN_SECRET_KEY_BYTES:
            raise RuntimeError(
                f"SECRET_KEY must be at least {MIN_SECRET_KEY_BYTES} bytes in "
                "production. Generate one with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
    return settings


settings = get_settings()
