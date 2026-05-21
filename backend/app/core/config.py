from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://slflow:slflow@db:5432/slflow"

    # JWT / security
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Default seeded admin
    DEFAULT_ADMIN_USERNAME: str = "admin"
    DEFAULT_ADMIN_PASSWORD: str = "admin"

    # Storage
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_BYTES: int = 200 * 1024 * 1024  # 200 MB per file

    # Hot-update
    APP_VERSION_FILE: str = "/app/VERSION"
    GIT_REPO_PATH: str = "/workspace"
    ENABLE_HOT_RELOAD: bool = True
    # Personal-access token used for non-interactive `git fetch` / `git pull`
    # against private GitHub repos. Optional; leave blank for public repos.
    # When set we inject it via an inline credential.helper so the token
    # never lands on the command line or in a config file.
    GITHUB_TOKEN: str = ""

    # CORS - comma-separated string. We parse to list lazily to bypass pydantic's
    # complex-type JSON decoding for env vars.
    CORS_ORIGINS: str = "*"

    @property
    def cors_origins_list(self) -> List[str]:
        v = self.CORS_ORIGINS.strip()
        if not v:
            return ["*"]
        return [item.strip() for item in v.split(",") if item.strip()]

    @property
    def upload_path(self) -> Path:
        p = Path(self.UPLOAD_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
