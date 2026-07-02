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
        "pbholland_klassement_fetched_at": "TIMESTAMP",
    },
    # Scoping per gekoppeld pbholland-profiel: elke cache-tabel krijgt de
    # id_persoon erbij, zodat data van meerdere profielen naast elkaar bewaard blijft.
    "pbh_wedstrijd": {"pbholland_id": "INTEGER"},
    "pbh_sprong": {"pbholland_id": "INTEGER"},
    "pbh_klassement": {"pbholland_id": "INTEGER"},
    "pbh_profiel": {
        "pbholland_id": "INTEGER",
        "lijst_fetched_at": "TIMESTAMP",
        "klassement_fetched_at": "TIMESTAMP",
    },
    "sprong_invoer": {"pbholland_id": "INTEGER"},
}

# Bestaande cache-rijen horen bij het (enige) profiel dat de gebruiker tot nu toe
# gekoppeld had → vul id_persoon aan vanuit de profielen-tabel.
_BACKFILL_PBHOLLAND_ID = [
    "pbh_wedstrijd",
    "pbh_sprong",
    "pbh_klassement",
    "pbh_profiel",
    "sprong_invoer",
]

# Oude unique-constraints (zonder id_persoon) vervangen door versies mét id_persoon.
# Nodig zodat twee gekoppelde profielen dezelfde wedstrijd kunnen delen.
_CONSTRAINTS = {
    "pbh_wedstrijd": {
        "oud_kolommen": [{"user_id", "id_wedstrijd"}],
        "nieuw_naam": "uq_pbh_wedstrijd_p",
        "nieuw_kolommen": ["user_id", "pbholland_id", "id_wedstrijd"],
    },
    "pbh_sprong": {
        "oud_kolommen": [{"user_id", "id_wedstrijd", "poging_index"}],
        "nieuw_naam": "uq_pbh_sprong_p",
        "nieuw_kolommen": ["user_id", "pbholland_id", "id_wedstrijd", "poging_index"],
    },
    "pbh_klassement": {
        "oud_kolommen": [{"user_id", "jaar"}],
        "nieuw_naam": "uq_pbh_klassement_p",
        "nieuw_kolommen": ["user_id", "pbholland_id", "jaar"],
    },
    "pbh_profiel": {
        "oud_kolommen": [{"user_id"}],
        "nieuw_naam": "uq_pbh_profiel_p",
        "nieuw_kolommen": ["user_id", "pbholland_id"],
    },
    "sprong_invoer": {
        "oud_kolommen": [{"user_id", "id_wedstrijd", "poging_index"}],
        "nieuw_naam": "uq_sprong_invoer_p",
        "nieuw_kolommen": ["user_id", "pbholland_id", "id_wedstrijd", "poging_index"],
    },
}


def _ensure_columns(inspector, bestaande_tabellen: set[str]) -> None:
    with engine.begin() as conn:
        for tabel, kolommen in _TOEGEVOEGDE_KOLOMMEN.items():
            if tabel not in bestaande_tabellen:
                continue
            aanwezig = {c["name"] for c in inspector.get_columns(tabel)}
            for naam, sqltype in kolommen.items():
                if naam not in aanwezig:
                    conn.execute(text(f"ALTER TABLE {tabel} ADD COLUMN {naam} {sqltype}"))


def _backfill(bestaande_tabellen: set[str]) -> None:
    with engine.begin() as conn:
        for tabel in _BACKFILL_PBHOLLAND_ID:
            if tabel not in bestaande_tabellen:
                continue
            conn.execute(
                text(
                    f"UPDATE {tabel} SET pbholland_id = "
                    f"(SELECT p.pbholland_id FROM profielen p WHERE p.user_id = {tabel}.user_id) "
                    f"WHERE pbholland_id IS NULL"
                )
            )
        # Verversbeleid overnemen naar het per-profiel PbhProfiel-record, zodat er
        # niet meteen opnieuw gescrapet wordt na de upgrade.
        if "pbh_profiel" in bestaande_tabellen:
            conn.execute(
                text(
                    "UPDATE pbh_profiel SET "
                    "lijst_fetched_at = (SELECT p.pbholland_lijst_fetched_at FROM profielen p "
                    "WHERE p.user_id = pbh_profiel.user_id), "
                    "klassement_fetched_at = (SELECT p.pbholland_klassement_fetched_at FROM profielen p "
                    "WHERE p.user_id = pbh_profiel.user_id) "
                    "WHERE lijst_fetched_at IS NULL"
                )
            )


def _migreer_constraints(inspector, bestaande_tabellen: set[str]) -> None:
    # Constraint-DDL is alleen op Postgres (productie) portabel. Op een verse
    # SQLite-dev-DB maakt create_all de nieuwe constraints al; een bestaande
    # dev-DB kan zonder verlies opnieuw worden aangemaakt.
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for tabel, spec in _CONSTRAINTS.items():
            if tabel not in bestaande_tabellen:
                continue
            bestaand = inspector.get_unique_constraints(tabel)
            namen = {uc["name"] for uc in bestaand}
            # Oude constraints (kolomset zonder id_persoon) verwijderen.
            for uc in bestaand:
                if set(uc["column_names"]) in spec["oud_kolommen"] and uc["name"]:
                    conn.execute(text(f'ALTER TABLE {tabel} DROP CONSTRAINT IF EXISTS "{uc["name"]}"'))
            # Een kolom met unique=True levert soms een unieke index i.p.v. een
            # named constraint (bv. de oude pbh_profiel.user_id) → die ook droppen.
            for idx in inspector.get_indexes(tabel):
                if idx.get("unique") and set(idx["column_names"]) in spec["oud_kolommen"] and idx["name"]:
                    conn.execute(text(f'DROP INDEX IF EXISTS "{idx["name"]}"'))
            # Nieuwe constraint toevoegen als die er nog niet is.
            if spec["nieuw_naam"] not in namen:
                kolommen = ", ".join(spec["nieuw_kolommen"])
                conn.execute(
                    text(
                        f'ALTER TABLE {tabel} ADD CONSTRAINT "{spec["nieuw_naam"]}" '
                        f"UNIQUE ({kolommen})"
                    )
                )


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    bestaande_tabellen = set(inspector.get_table_names())
    _ensure_columns(inspector, bestaande_tabellen)
    _backfill(bestaande_tabellen)
    # Inspector opnieuw ophalen: de kolommen zijn zojuist toegevoegd.
    _migreer_constraints(inspect(engine), bestaande_tabellen)
    yield
