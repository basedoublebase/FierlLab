from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db_session
from app.models.profiel import Profiel
from app.models.sprong_invoer import SprongInvoer
from app.services import pbholland
from app.services.knmi import KnmiError, haal_knmi_wind

_NL_TZ = ZoneInfo("Europe/Amsterdam")

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
        detail = pbholland.haal_wedstrijd_detail(id_wedstrijd, profiel.pbholland_id)
        lijst = pbholland.haal_wedstrijden(profiel.pbholland_id, profiel.naam or None)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Geen sprongen van jou in deze wedstrijd gevonden.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.") from exc

    meta = next((w for w in lijst["wedstrijden"] if w["id_wedstrijd"] == id_wedstrijd), None)

    # Eigen handmatige stok-data per poging-index erbij voegen.
    invoer = {
        r.poging_index: r
        for r in session.scalars(
            select(SprongInvoer).where(
                SprongInvoer.user_id == user.id, SprongInvoer.id_wedstrijd == id_wedstrijd
            )
        ).all()
    }
    pogingen = []
    for i, p in enumerate(detail["pogingen"]):
        rij = invoer.get(i)
        pogingen.append({
            **p,
            "poging_index": i,
            "stok_op_m": rij.stok_op_m if rij else None,
            "stok_uit_hand_m": rij.stok_uit_hand_m if rij else None,
        })

    return {
        **detail,
        "pogingen": pogingen,
        "datum": meta["datum"] if meta else None,
        "plaats": meta["plaats"] if meta else None,
        "wedstrijd": meta["wedstrijd"] if meta else None,
        "categorie": meta["categorie"] if meta else None,
    }


class StokInvoerRequest(BaseModel):
    stok_op_m: float | None = None
    stok_uit_hand_m: float | None = None


@router.put("/pbholland/wedstrijd/{id_wedstrijd}/poging/{poging_index}")
def zet_stok_invoer(
    id_wedstrijd: int,
    poging_index: int,
    payload: StokInvoerRequest,
    user: CurrentUser,
    session: Session = Depends(get_db_session),
) -> dict:
    """Sla eigen stok op / stok uit hand op bij een pbholland-sprong."""
    rij = session.scalars(
        select(SprongInvoer).where(
            SprongInvoer.user_id == user.id,
            SprongInvoer.id_wedstrijd == id_wedstrijd,
            SprongInvoer.poging_index == poging_index,
        )
    ).first()
    if rij is None:
        rij = SprongInvoer(user_id=user.id, id_wedstrijd=id_wedstrijd, poging_index=poging_index)
        session.add(rij)
    rij.stok_op_m = payload.stok_op_m
    rij.stok_uit_hand_m = payload.stok_uit_hand_m
    session.commit()
    return {"stok_op_m": rij.stok_op_m, "stok_uit_hand_m": rij.stok_uit_hand_m}


@router.get("/pbholland/wind")
def pbholland_wind(plaats: str, datum: str, tijd: str, user: CurrentUser) -> dict:
    """KNMI-wind voor een pbholland-sprong (plaats + lokale datum/tijd)."""
    coords = pbholland.coords_voor_plaats(plaats)
    if coords is None:
        raise HTTPException(status_code=422, detail=f"Geen coördinaten bekend voor schans '{plaats}'.")
    try:
        lokaal = datetime.fromisoformat(f"{datum}T{tijd}").replace(tzinfo=_NL_TZ)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Ongeldige datum/tijd.") from exc
    ts_utc = lokaal.astimezone(timezone.utc)
    try:
        wind = haal_knmi_wind(coords[0], coords[1], ts_utc)
    except KnmiError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    tw = pbholland.windtype(wind.get("windrichting_graden"), plaats)
    if tw is not None:
        wind["windtype"] = tw["soort"]
        wind["orientatie_graden"] = tw["orientatie_graden"]
    return wind
