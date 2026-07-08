from app.config import Settings


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
