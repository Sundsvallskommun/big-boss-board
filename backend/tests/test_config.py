from configparser import ConfigParser

import pytest

from app.config import Settings, database_url_for_alembic_config


def test_database_url_uses_asyncpg_for_plain_postgresql_url():
    settings = Settings(
        database_url="postgresql://user:password@db.example.test:5432/bbb"
    )

    assert (
        settings.database_url
        == "postgresql+asyncpg://user:password@db.example.test:5432/bbb"
    )


def test_database_url_keeps_explicit_asyncpg_url():
    settings = Settings(
        database_url="postgresql+asyncpg://user:password@db.example.test:5432/bbb"
    )

    assert (
        settings.database_url
        == "postgresql+asyncpg://user:password@db.example.test:5432/bbb"
    )


def test_alembic_database_url_escapes_percent_encoded_password():
    database_url = (
        "postgresql+asyncpg://user:password%3E@db.example.test:5432/bbb"
    )
    config = ConfigParser()
    config.add_section("alembic")

    with pytest.raises(ValueError, match="invalid interpolation syntax"):
        config.set("alembic", "sqlalchemy.url", database_url)

    config.set(
        "alembic",
        "sqlalchemy.url",
        database_url_for_alembic_config(database_url),
    )

    assert config.get("alembic", "sqlalchemy.url") == database_url
