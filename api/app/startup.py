from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import inspect, text

import app.models  # noqa: F401  — registreer alle modellen op Base
from app.db import Base, engine

# Kolommen die later aan bestaande tabellen zijn toegevoegd. create_all maakt
# alleen ontbrekende tabellen, geen ontbrekende kolommen — dus voegen we die
# idempotent toe (werkt voor SQLite lokaal en Postgres in productie).
_TOEGEVOEGDE_KOLOMMEN: dict[str, dict[str, str]] = {
    "pogingen": {
        "windvlagen_ms": "FLOAT",
        "wind_station": "VARCHAR(80)",
        "wind_station_afstand_km": "FLOAT",
        "wind_bron_utc": "TIMESTAMP",
        "wind_resolutie": "VARCHAR(8)",
        "wind_gevalideerd": "BOOLEAN",
        "wind_fetched_at": "TIMESTAMP",
    },
    "profielen": {
        "pbholland_lijst_fetched_at": "TIMESTAMP",
    },
}


def _ensure_columns() -> None:
    inspector = inspect(engine)
    bestaande_tabellen = set(inspector.get_table_names())
    with engine.begin() as conn:
        for tabel, kolommen in _TOEGEVOEGDE_KOLOMMEN.items():
            if tabel not in bestaande_tabellen:
                continue
            aanwezig = {c["name"] for c in inspector.get_columns(tabel)}
            for naam, sqltype in kolommen.items():
                if naam not in aanwezig:
                    conn.execute(text(f"ALTER TABLE {tabel} ADD COLUMN {naam} {sqltype}"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    yield
