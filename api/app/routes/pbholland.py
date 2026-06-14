from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db_session
from app.models.profiel import Profiel
from app.services import pbholland

router = APIRouter(tags=["pbholland"])


def _scrape(id_persoon: int, naam_hint: str | None) -> dict:
    try:
        return pbholland.haal_statistieken(id_persoon, naam_hint)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.") from exc


@router.get("/pbholland/preview")
def preview(
    id_persoon: int,
    user: CurrentUser,
    naam: str | None = None,
) -> dict:
    """Snelle check bij het koppelen: haalt naam + kerncijfers op voor een id_persoon."""
    stats = _scrape(id_persoon, naam)
    if not stats.get("naam"):
        raise HTTPException(status_code=404, detail="Geen springer gevonden voor dit id_persoon.")
    return stats


def _gekoppeld_profiel(user, session: Session) -> Profiel:
    profiel = session.scalars(select(Profiel).where(Profiel.user_id == user.id)).first()
    if profiel is None or not profiel.pbholland_id:
        raise HTTPException(
            status_code=422,
            detail="Nog geen pbholland-profiel gekoppeld. Koppel je profiel bij Instellingen.",
        )
    return profiel


@router.get("/pbholland/statistieken")
def statistieken(
    user: CurrentUser,
    session: Session = Depends(get_db_session),
) -> dict:
    """Volledige statistieken voor het gekoppelde pbholland-profiel van de gebruiker."""
    profiel = _gekoppeld_profiel(user, session)
    return _scrape(profiel.pbholland_id, profiel.naam or None)


@router.get("/pbholland/wedstrijden")
def wedstrijden(user: CurrentUser, session: Session = Depends(get_db_session)) -> dict:
    """Lichte wedstrijdenlijst voor de Wedstrijden-pagina."""
    profiel = _gekoppeld_profiel(user, session)
    try:
        return pbholland.haal_wedstrijden(profiel.pbholland_id, profiel.naam or None)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.") from exc


@router.get("/pbholland/wedstrijd/{id_wedstrijd}")
def wedstrijd_detail(
    id_wedstrijd: int, user: CurrentUser, session: Session = Depends(get_db_session)
) -> dict:
    """Volledige sprongtabel (tijd, afwijking, landingsplaats) van één wedstrijd."""
    profiel = _gekoppeld_profiel(user, session)
    try:
        return pbholland.haal_wedstrijd_detail(id_wedstrijd, profiel.pbholland_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Geen sprongen van jou in deze wedstrijd gevonden.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.") from exc
