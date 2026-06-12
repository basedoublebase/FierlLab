from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./fierllab.db"

    model_config = SettingsConfigDict(env_prefix="FIERLLAB_", extra="ignore")

    @field_validator("database_url")
    @classmethod
    def normaliseer_database_url(cls, url: str) -> str:
        # Tolerant voor copy-paste: quotes/spaties weg en het verouderde
        # postgres://-schema (o.a. Railway/Heroku) omzetten naar postgresql://.
        url = url.strip().strip('"').strip("'")
        if not url:
            return "sqlite:///./fierllab.db"
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
