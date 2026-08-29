"""
Database engine and session management.

The engine is built from a single DATABASE_URL, so the same code runs on
SQLite locally and Postgres in production. Schema changes are owned by
Alembic - nothing here calls create_all(), because a hand-rolled migrator can
only ever add columns and will silently diverge from the models.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        # SQLite refuses cross-thread use by default, and FastAPI runs sync
        # endpoints on a threadpool, so each request may land on a new thread.
        return {"connect_args": {"check_same_thread": False}}

    # Managed Postgres (Neon, Supabase, Render) closes idle connections
    # aggressively. pool_pre_ping discards dead ones instead of surfacing them
    # as a 500 on the first request after an idle period.
    return {
        "pool_pre_ping": True,
        "pool_size": 5,
        "max_overflow": 10,
        "pool_recycle": 300,
    }


engine = create_engine(settings.DATABASE_URL, **_engine_kwargs(settings.DATABASE_URL))

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
