"""Applikationskonfiguration läst från miljövariabler."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://bbb:bbb@db:5432/bbb"
    access_code: str = ""
    # Hemlig nyckel för dataimport-endpointen (maskin-till-maskin). Tom = endpoint avstängd.
    import_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
