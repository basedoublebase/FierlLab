from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db_session
from app.models.pbh import PbhSprong, PbhWedstrijd
from app.models.profiel import Profiel
from app.models.sprong_invoer import SprongInvoer
from app.models.wind_cache import WindCache
from app.services import pbholland
from app.services.knmi import KnmiError, haal_knmi_wind

_NL_TZ = ZoneInfo("Europe/Amsterdam")

# Verversbeleid (zie uitleg): lijst max 1×/dag, recente wedstrijd-details ~12u.
_LIJST_TTL = timedelta(hours=24)
_DETAIL_TTL = timedelta(hours=12)
_RECENT_DAGEN = 30


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_recent(datum_iso: str) -> bool:
    try:
        d = date.fromisoformat(datum_iso)
    except (ValueError, TypeError):
        return False
    return d >= date.today() - timedelta(days=_RECENT_DAGEN)


def _upsert_lijst(session: Session, user_id: int, wedstrijden: list[dict], nu: datetime) -> None:
    bestaand = {
        r.id_wedstrijd: r
        for r in session.scalars(select(PbhWedstrijd).where(PbhWedstrijd.user_id == user_id)).all()
    }
    for w in wedstrijden:
        wid = w.get("id_wedstrijd")
        if wid is None:
            continue  # niet-navigeerbare wedstrijd: niet persistent opslaan
        rij = bestaand.get(wid)
        if rij is None:
            rij = PbhWedstrijd(user_id=user_id, id_wedstrijd=wid)
            session.add(rij)
        rij.datum = w["datum"]
        rij.plaats = w["plaats"] or ""
        rij.wedstrijd = w["wedstrijd"] or ""
        rij.categorie = w["categorie"] or ""
        rij.verste_afstand = w["verste_afstand"]
        rij.plaats_finale = w["plaats_finale"]
        rij.aantal_sprongen = w["aantal_sprongen"]
        rij.gemiddelde = w["gemiddelde"]
        rij.fetched_at = nu

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
    """Wedstrijdenlijst — uit de database, max 1×/dag opnieuw gescrapet."""
    profiel = _gekoppeld_profiel(user, session)
    nu = _now()
    stale = (
        profiel.pbholland_lijst_fetched_at is None
        or (nu - profiel.pbholland_lijst_fetched_at) > _LIJST_TTL
    )
    heeft_rijen = session.scalars(
        select(PbhWedstrijd.id).where(PbhWedstrijd.user_id == user.id).limit(1)
    ).first() is not None

    if stale:
        try:
            data = pbholland.haal_wedstrijden(profiel.pbholland_id, profiel.naam or None)
        except httpx.HTTPError as exc:
            if not heeft_rijen:
                raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.") from exc
        else:
            _upsert_lijst(session, user.id, data["wedstrijden"], nu)
            profiel.pbholland_lijst_fetched_at = nu
            session.commit()

    rijen = session.scalars(
        select(PbhWedstrijd)
        .where(PbhWedstrijd.user_id == user.id)
        .order_by(PbhWedstrijd.datum.desc(), PbhWedstrijd.id_wedstrijd.desc())
    ).all()
    return {
        "naam": profiel.naam,
        "id_persoon": profiel.pbholland_id,
        "wedstrijden": [
            {
                "id_wedstrijd": r.id_wedstrijd,
                "datum": r.datum,
                "plaats": r.plaats,
                "wedstrijd": r.wedstrijd,
                "categorie": r.categorie,
                "verste_afstand": r.verste_afstand,
                "plaats_finale": r.plaats_finale,
                "aantal_sprongen": r.aantal_sprongen,
                "gemiddelde": r.gemiddelde,
            }
            for r in rijen
        ],
    }


@router.get("/pbholland/wedstrijd/{id_wedstrijd}")
def wedstrijd_detail(
    id_wedstrijd: int, user: CurrentUser, session: Session = Depends(get_db_session)
) -> dict:
    """Sprongtabel van één wedstrijd — uit de database; recente wedstrijden ~12u ververst."""
    profiel = _gekoppeld_profiel(user, session)
    nu = _now()
    wed = session.scalars(
        select(PbhWedstrijd).where(PbhWedstrijd.user_id == user.id, PbhWedstrijd.id_wedstrijd == id_wedstrijd)
    ).first()

    nodig = (
        wed is None
        or wed.detail_fetched_at is None
        or (_is_recent(wed.datum) and (nu - wed.detail_fetched_at) > _DETAIL_TTL)
    )
    if nodig:
        try:
            detail = pbholland.haal_wedstrijd_detail(id_wedstrijd, profiel.pbholland_id)
            lijst = pbholland.haal_wedstrijden(profiel.pbholland_id, profiel.naam or None)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Geen sprongen van jou in deze wedstrijd gevonden.") from exc
        except httpx.HTTPError as exc:
            if wed is None:
                raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.") from exc
        else:
            meta = next((w for w in lijst["wedstrijden"] if w["id_wedstrijd"] == id_wedstrijd), None)
            if wed is None:
                wed = PbhWedstrijd(user_id=user.id, id_wedstrijd=id_wedstrijd, datum=(meta["datum"] if meta else ""))
                session.add(wed)
            if meta:
                wed.datum = meta["datum"]; wed.plaats = meta["plaats"] or ""
                wed.wedstrijd = meta["wedstrijd"] or ""; wed.categorie = meta["categorie"] or ""
                wed.verste_afstand = meta["verste_afstand"]; wed.plaats_finale = meta["plaats_finale"]
                wed.aantal_sprongen = meta["aantal_sprongen"]; wed.gemiddelde = meta["gemiddelde"]
                wed.fetched_at = nu
            wed.positie = detail["positie"]
            wed.beste = detail["beste"]
            wed.detail_fetched_at = nu
            # Sprongen vervangen.
            for oud in session.scalars(
                select(PbhSprong).where(PbhSprong.user_id == user.id, PbhSprong.id_wedstrijd == id_wedstrijd)
            ).all():
                session.delete(oud)
            session.flush()
            for i, p in enumerate(detail["pogingen"]):
                session.add(PbhSprong(
                    user_id=user.id, id_wedstrijd=id_wedstrijd, poging_index=i,
                    label=p["label"], afstand=p["afstand"], geldig=p["geldig"],
                    id_meetgegevens=p["id_meetgegevens"], tijd=p["tijd"],
                    tijd_schatting=p["tijd_schatting"], afwijking=p["afwijking"],
                    landingsplaats=p["landingsplaats"],
                ))
            session.commit()

    if wed is None:
        raise HTTPException(status_code=404, detail="Wedstrijd niet gevonden.")

    sprongen = session.scalars(
        select(PbhSprong)
        .where(PbhSprong.user_id == user.id, PbhSprong.id_wedstrijd == id_wedstrijd)
        .order_by(PbhSprong.poging_index)
    ).all()
    stok = {
        r.poging_index: r
        for r in session.scalars(
            select(SprongInvoer).where(SprongInvoer.user_id == user.id, SprongInvoer.id_wedstrijd == id_wedstrijd)
        ).all()
    }
    pogingen = []
    for s in sprongen:
        si = stok.get(s.poging_index)
        pogingen.append({
            "label": s.label, "afstand": s.afstand, "geldig": s.geldig,
            "id_meetgegevens": s.id_meetgegevens, "tijd": s.tijd, "tijd_schatting": s.tijd_schatting,
            "afwijking": s.afwijking, "landingsplaats": s.landingsplaats, "poging_index": s.poging_index,
            "stok_op_m": si.stok_op_m if si else None,
            "stok_uit_hand_m": si.stok_uit_hand_m if si else None,
        })
    geldige = [s.afstand for s in sprongen if s.afstand]
    return {
        "id_wedstrijd": id_wedstrijd,
        "positie": wed.positie,
        "beste": wed.beste,
        "gemiddelde": round(sum(geldige) / len(geldige), 2) if geldige else None,
        "pogingen": pogingen,
        "datum": wed.datum,
        "plaats": wed.plaats,
        "wedstrijd": wed.wedstrijd,
        "categorie": wed.categorie,
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


def _voeg_windtype_toe(wind: dict, plaats: str) -> dict:
    tw = pbholland.windtype(wind.get("windrichting_graden"), plaats)
    if tw is not None:
        wind["windtype"] = tw["soort"]
        wind["orientatie_graden"] = tw["orientatie_graden"]
    return wind


@router.get("/pbholland/wind")
def pbholland_wind(
    plaats: str, datum: str, tijd: str, user: CurrentUser, session: Session = Depends(get_db_session)
) -> dict:
    """KNMI-wind voor een pbholland-sprong (plaats + lokale datum/tijd).

    Historische wind is onveranderlijk → permanent gecachet per locatie + 10-min-slot.
    """
    coords = pbholland.coords_voor_plaats(plaats)
    if coords is None:
        raise HTTPException(status_code=422, detail=f"Geen coördinaten bekend voor schans '{plaats}'.")
    try:
        lokaal = datetime.fromisoformat(f"{datum}T{tijd}").replace(tzinfo=_NL_TZ)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Ongeldige datum/tijd.") from exc
    ts_utc = lokaal.astimezone(timezone.utc)
    # Cache-sleutel: UTC afgerond op 10 minuten (KNMI-resolutie).
    slot = ts_utc.replace(minute=(ts_utc.minute // 10) * 10, second=0, microsecond=0)
    slot_key = slot.strftime("%Y%m%d%H%M")

    cached = session.scalars(
        select(WindCache).where(WindCache.plaats == plaats, WindCache.slot_key == slot_key)
    ).first()
    if cached is not None:
        return _voeg_windtype_toe(
            {
                "wind_ms": cached.wind_ms,
                "windrichting_graden": cached.windrichting_graden,
                "windvlagen_ms": cached.windvlagen_ms,
                "wind_station": cached.wind_station,
                "wind_station_afstand_km": cached.wind_station_afstand_km,
                "wind_resolutie": cached.wind_resolutie,
                "wind_gevalideerd": cached.wind_gevalideerd,
                "bron": "cache",
            },
            plaats,
        )

    try:
        wind = haal_knmi_wind(coords[0], coords[1], ts_utc)
    except KnmiError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    session.add(
        WindCache(
            plaats=plaats,
            slot_key=slot_key,
            wind_ms=wind.get("wind_ms"),
            windrichting_graden=wind.get("windrichting_graden"),
            windvlagen_ms=wind.get("windvlagen_ms"),
            wind_station=wind.get("wind_station"),
            wind_station_afstand_km=wind.get("wind_station_afstand_km"),
            wind_resolutie=wind.get("wind_resolutie"),
            wind_gevalideerd=wind.get("wind_gevalideerd"),
        )
    )
    session.commit()
    return _voeg_windtype_toe(wind, plaats)
