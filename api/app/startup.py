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

# Alleen de handmatige invoer (stok op/uit hand) backfillen naar het huidige profiel;
# die is niet opnieuw te scrapen. De overige pbh-caches worden bij de reparatie
# leeggegooid en per profiel opnieuw opgehaald (zie _repair_pbh_cache).
_BACKFILL_PBHOLLAND_ID = [
    "sprong_invoer",
]

# Derived pbholland-cache die volledig opnieuw te scrapen is.
_HERSCRAPEBARE_CACHE = ["pbh_wedstrijd", "pbh_sprong", "pbh_klassement", "pbh_profiel"]

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


def _repair_pbh_cache(bestaande_tabellen: set[str]) -> None:
    """Eenmalige reparatie van de scope-migratie.

    De eerste backfill wees álle bestaande cache-rijen toe aan het profiel dat op dat
    moment gekoppeld was. Wie vóór de upgrade al naar een ander profiel was gewisseld,
    kreeg daardoor de data van het vorige profiel verkeerd gelabeld (bv. Hidde's profiel
    dat Bas'-cijfers toont). Omdat deze cache volledig opnieuw te scrapen is, gooien we
    de derived tabellen eenmalig leeg en resetten we het verversbeleid; elk profiel vult
    zich daarna vanzelf weer correct. De handmatige invoer (sprong_invoer) blijft staan.
    """
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS pbh_migratie (sleutel VARCHAR(64) PRIMARY KEY)"))
        gedaan = conn.execute(
            text("SELECT 1 FROM pbh_migratie WHERE sleutel = 'reset_scope_v1'")
        ).first()
        if gedaan is not None:
            return
        for tabel in _HERSCRAPEBARE_CACHE:
            if tabel in bestaande_tabellen:
                conn.execute(text(f"DELETE FROM {tabel}"))
        # Verversmarkers wissen zodat de lijst/klassement opnieuw worden opgehaald.
        conn.execute(
            text(
                "UPDATE profielen SET pbholland_lijst_fetched_at = NULL, "
                "pbholland_klassement_fetched_at = NULL"
            )
        )
        conn.execute(text("INSERT INTO pbh_migratie (sleutel) VALUES ('reset_scope_v1')"))


def _forceer_detail_herophaling(bestaande_tabellen: set[str]) -> None:
    """Eenmalige reset na de uitslaginfo-parserfix.

    De parser koos eerder de korte samenvattingsrij i.p.v. de volledige uitslagrij,
    waardoor sommige wedstrijden zonder losse pogingen (of via de terugval alleen met
    afstanden) waren opgeslagen. detail_fetched_at op NULL zetten forceert één
    herophaling per wedstrijd zodra je die opent, nu met de gecorrigeerde parser.
    """
    if "pbh_wedstrijd" not in bestaande_tabellen:
        return
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS pbh_migratie (sleutel VARCHAR(64) PRIMARY KEY)"))
        gedaan = conn.execute(
            text("SELECT 1 FROM pbh_migratie WHERE sleutel = 'reparse_uitslaginfo_v1'")
        ).first()
        if gedaan is not None:
            return
        conn.execute(text("UPDATE pbh_wedstrijd SET detail_fetched_at = NULL"))
        conn.execute(text("INSERT INTO pbh_migratie (sleutel) VALUES ('reparse_uitslaginfo_v1')"))


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
    _repair_pbh_cache(bestaande_tabellen)
    _forceer_detail_herophaling(bestaande_tabellen)
    _backfill(bestaande_tabellen)
    # Inspector opnieuw ophalen: de kolommen zijn zojuist toegevoegd.
    _migreer_constraints(inspect(engine), bestaande_tabellen)
    yield
