from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

# Supabase's session-mode pooler allows max 15 clients in total. Keep our
# pool tiny and recycle idle connections quickly so overlapping deploys
# never exhaust that budget.
_pool_kwargs = (
    {
        "pool_size": 2,
        "max_overflow": 3,
        "pool_timeout": 15,
        "pool_recycle": 300,
        "pool_pre_ping": True,
    }
    if settings.database_url.startswith(("postgres", "postgresql"))
    else {}
)
engine = create_engine(settings.database_url, future=True, **_pool_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
