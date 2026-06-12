from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./fierllab.db"

    model_config = SettingsConfigDict(env_prefix="FIERLLAB_", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
