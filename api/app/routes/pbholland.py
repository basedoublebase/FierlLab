from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db_session
from app.models.pbh import PbhKlassement, PbhProfiel, PbhSprong, PbhWedstrijd
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


def _upsert_lijst(session: Session, user_id: int, pid: int, wedstrijden: list[dict], nu: datetime) -> None:
    bestaand = {
        r.id_wedstrijd: r
        for r in session.scalars(
            select(PbhWedstrijd).where(
                PbhWedstrijd.user_id == user_id, PbhWedstrijd.pbholland_id == pid
            )
        ).all()
    }
    for w in wedstrijden:
        wid = w.get("id_wedstrijd")
        if wid is None:
            continue  # niet-navigeerbare wedstrijd: niet persistent opslaan
        rij = bestaand.get(wid)
        if rij is None:
            rij = PbhWedstrijd(user_id=user_id, pbholland_id=pid, id_wedstrijd=wid)
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


def _upsert_profiel(session: Session, user_id: int, pid: int, prof: dict) -> PbhProfiel:
    rij = session.scalars(
        select(PbhProfiel).where(PbhProfiel.user_id == user_id, PbhProfiel.pbholland_id == pid)
    ).first()
    if rij is None:
        rij = PbhProfiel(user_id=user_id, pbholland_id=pid)
        session.add(rij)
    rij.naam = prof.get("naam") or ""
    rij.bond = prof.get("bond")
    rij.vereniging = prof.get("vereniging")
    rij.woonplaats = prof.get("woonplaats")
    rij.categorie = prof.get("categorie")
    rij.wedstrijdcategorie = prof.get("wedstrijdcategorie")
    rij.rugnummer = prof.get("rugnummer")
    rij.ranking = prof.get("ranking")
    rij.titels = prof.get("titels")
    rij.dagtitels = prof.get("dagtitels")
    rij.pr_overall = prof.get("pr_overall")
    rij.aantal_wedstrijden = int(prof["aantal_wedstrijden"]) if prof.get("aantal_wedstrijden") else None
    rij.aantal_sprongen = int(prof["aantal_sprongen"]) if prof.get("aantal_sprongen") else None
    return rij


def _zorg_lijst_vers(session: Session, user_id: int, profiel: Profiel, nu: datetime) -> bool:
    """Ververs de wedstrijdenlijst + profiel voor het actieve pbholland-profiel indien verouderd.

    Het verversbeleid staat per gekoppeld profiel op de PbhProfiel-rij, zodat het
    wisselen tussen profielen niet steeds een nieuwe scrape forceert.
    Geeft True als er bruikbare data in de DB staat. Scrape-fout met lege DB → 503.
    """
    pid = profiel.pbholland_id
    pp = session.scalars(
        select(PbhProfiel).where(PbhProfiel.user_id == user_id, PbhProfiel.pbholland_id == pid)
    ).first()
    heeft_rijen = (
        session.scalars(
            select(PbhWedstrijd.id)
            .where(PbhWedstrijd.user_id == user_id, PbhWedstrijd.pbholland_id == pid)
            .limit(1)
        ).first()
        is not None
    )
    stale = (
        pp is None
        or pp.lijst_fetched_at is None
        or (nu - pp.lijst_fetched_at) > _LIJST_TTL
        or pp.klassement_fetched_at is None  # klassement voor dit profiel nog nooit opgehaald
    )
    if stale:
        try:
            data = pbholland.haal_wedstrijden(pid, profiel.naam or None)
        except httpx.HTTPError:
            return heeft_rijen
        _upsert_lijst(session, user_id, pid, data["wedstrijden"], nu)
        pp = _upsert_profiel(session, user_id, pid, data["profiel"])
        _upsert_klassement(session, user_id, pid, profiel.naam or None)
        pp.lijst_fetched_at = nu
        pp.klassement_fetched_at = nu
        session.commit()
        return True
    return heeft_rijen


def _upsert_klassement(session: Session, user_id: int, pid: int, naam: str | None) -> None:
    try:
        rijen = pbholland.haal_klassement(pid, naam)
    except httpx.HTTPError:
        return  # klassement is bijzaak; lijst-verversing niet laten falen
    bestaand = {
        r.jaar: r
        for r in session.scalars(
            select(PbhKlassement).where(
                PbhKlassement.user_id == user_id, PbhKlassement.pbholland_id == pid
            )
        ).all()
    }
    for k in rijen:
        rij = bestaand.get(k["jaar"])
        if rij is None:
            rij = PbhKlassement(user_id=user_id, pbholland_id=pid, jaar=k["jaar"])
            session.add(rij)
        rij.positie = k["positie"]
        rij.totaal = k["totaal"]

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


@router.get("/pbholland/gekoppelde-profielen")
def gekoppelde_profielen(user: CurrentUser, session: Session = Depends(get_db_session)) -> dict:
    """Profielen waarvan al eens data is opgehaald (voor snel terugwisselen).

    Toont ook welk profiel nu actief gekoppeld is, zodat de UI dat kan markeren.
    """
    profiel = session.scalars(select(Profiel).where(Profiel.user_id == user.id)).first()
    rijen = session.scalars(select(PbhProfiel).where(PbhProfiel.user_id == user.id)).all()
    aantallen = {
        pid: n
        for pid, n in session.execute(
            select(PbhWedstrijd.pbholland_id, func.count(PbhWedstrijd.id))
            .where(PbhWedstrijd.user_id == user.id)
            .group_by(PbhWedstrijd.pbholland_id)
        ).all()
    }
    profielen = [
        {
            "id_persoon": pp.pbholland_id,
            "naam": pp.naam,
            "vereniging": pp.vereniging,
            "pr_overall": pp.pr_overall,
            "aantal_wedstrijden": aantallen.get(pp.pbholland_id, 0),
        }
        for pp in sorted(rijen, key=lambda r: r.naam.lower())
    ]
    return {
        "actief_id": profiel.pbholland_id if profiel else None,
        "profielen": profielen,
    }


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
    """Statistieken — afgeleid uit de opgeslagen wedstrijden + profiel (geen scrape op warm)."""
    profiel = _gekoppeld_profiel(user, session)
    pid = profiel.pbholland_id
    if not _zorg_lijst_vers(session, user.id, profiel, _now()):
        raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.")

    rijen = session.scalars(
        select(PbhWedstrijd).where(PbhWedstrijd.user_id == user.id, PbhWedstrijd.pbholland_id == pid)
    ).all()
    pp = session.scalars(
        select(PbhProfiel).where(PbhProfiel.user_id == user.id, PbhProfiel.pbholland_id == pid)
    ).first()

    geldige = [r for r in rijen if (r.verste_afstand or 0) > 0]

    pr = None
    if geldige:
        beste = max(geldige, key=lambda r: r.verste_afstand)
        pr = {"afstand": beste.verste_afstand, "datum": beste.datum, "plaats": beste.plaats}

    per_jaar: dict[int, float] = {}
    per_jaar_som: dict[int, float] = {}
    per_jaar_aantal: dict[int, int] = {}
    for r in geldige:
        jaar = int(r.datum[:4])
        per_jaar[jaar] = max(per_jaar.get(jaar, 0), r.verste_afstand)
        per_jaar_som[jaar] = per_jaar_som.get(jaar, 0) + r.verste_afstand
        per_jaar_aantal[jaar] = per_jaar_aantal.get(jaar, 0) + 1
    jaren = sorted(per_jaar)
    pr_per_seizoen = []
    lopend = 0.0
    for jaar in jaren:
        lopend = max(lopend, per_jaar[jaar])
        pr_per_seizoen.append({
            "jaar": jaar,
            "seizoensbeste": round(per_jaar[jaar], 2),
            "pr_tot": round(lopend, 2),
            "gemiddelde": round(per_jaar_som[jaar] / per_jaar_aantal[jaar], 2),
            "aantal_wedstrijden": per_jaar_aantal[jaar],
        })

    seizoensrecord = None
    if jaren:
        laatste = jaren[-1]
        vorige = jaren[-2] if len(jaren) > 1 else None
        verschil = round(per_jaar[laatste] - per_jaar[vorige], 2) if vorige is not None else None
        seizoensrecord = {"afstand": round(per_jaar[laatste], 2), "jaar": laatste, "verschil": verschil, "vorig_jaar": vorige}

    per_schans: dict[str, dict] = {}
    for r in geldige:
        h = per_schans.get(r.plaats)
        if h is None or r.verste_afstand > h["afstand"]:
            per_schans[r.plaats] = {"plaats": r.plaats, "afstand": r.verste_afstand, "datum": r.datum}
    beste_per_schans = sorted(per_schans.values(), key=lambda x: x["afstand"], reverse=True)[:6]

    gem_uitslag = round(sum(r.verste_afstand for r in geldige) / len(geldige), 2) if geldige else None

    # Gem. afwijking uit de opgeslagen losse sprongen (waar beschikbaar).
    sprongen = session.scalars(
        select(PbhSprong).where(PbhSprong.user_id == user.id, PbhSprong.pbholland_id == pid)
    ).all()
    per_wed: dict[int, list[float]] = {}
    for s in sprongen:
        if s.afstand and s.afstand > 0:
            per_wed.setdefault(s.id_wedstrijd, []).append(s.afstand)
    afwijkingen: list[float] = []
    for sprongenlijst in per_wed.values():
        beste_dag = max(sprongenlijst)
        afwijkingen.extend(x - beste_dag for x in sprongenlijst)
    gem_afwijking = round(sum(afwijkingen) / len(afwijkingen), 2) if afwijkingen else None

    klassement = session.scalars(
        select(PbhKlassement)
        .where(PbhKlassement.user_id == user.id, PbhKlassement.pbholland_id == pid)
        .order_by(PbhKlassement.jaar)
    ).all()
    klassement_per_seizoen = [
        {"jaar": k.jaar, "positie": k.positie, "totaal": k.totaal} for k in klassement
    ]

    return {
        "naam": pp.naam if pp else profiel.naam,
        "vereniging": pp.vereniging if pp else None,
        "woonplaats": pp.woonplaats if pp else None,
        "categorie": pp.categorie if pp else None,
        "wedstrijdcategorie": pp.wedstrijdcategorie if pp else None,
        "rugnummer": pp.rugnummer if pp else None,
        "bond": pp.bond if pp else None,
        "ranking": pp.ranking if pp else None,
        "titels": pp.titels if pp else None,
        "dagtitels": pp.dagtitels if pp else None,
        "pr_overall": pp.pr_overall if pp else None,
        "aantal_wedstrijden": (pp.aantal_wedstrijden if pp and pp.aantal_wedstrijden else len(rijen)),
        "aantal_sprongen": pp.aantal_sprongen if pp else None,
        "pr": pr,
        "seizoensrecord": seizoensrecord,
        "pr_per_seizoen": pr_per_seizoen,
        "klassement_per_seizoen": klassement_per_seizoen,
        "beste_per_schans": beste_per_schans,
        "gemiddelde_uitslag": gem_uitslag,
        "gemiddelde_afwijking": gem_afwijking,
        "id_persoon": profiel.pbholland_id,
        "id_springer": None,
    }


@router.get("/pbholland/wedstrijden")
def wedstrijden(user: CurrentUser, session: Session = Depends(get_db_session)) -> dict:
    """Wedstrijdenlijst — uit de database, max 1×/dag opnieuw gescrapet."""
    profiel = _gekoppeld_profiel(user, session)
    pid = profiel.pbholland_id
    if not _zorg_lijst_vers(session, user.id, profiel, _now()):
        raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.")

    rijen = session.scalars(
        select(PbhWedstrijd)
        .where(PbhWedstrijd.user_id == user.id, PbhWedstrijd.pbholland_id == pid)
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


@router.get("/pbholland/wind-nu")
def wind_nu(plaats: str, user: CurrentUser, session: Session = Depends(get_db_session)) -> dict:
    """Actuele wind voor een schans (laatste beschikbare KNMI-slot, ~15 min terug)."""
    coords = pbholland.coords_voor_plaats(plaats)
    if coords is None:
        raise HTTPException(status_code=422, detail=f"Geen coördinaten bekend voor schans '{plaats}'.")
    ts_utc = datetime.now(timezone.utc) - timedelta(minutes=15)
    slot = ts_utc.replace(minute=(ts_utc.minute // 10) * 10, second=0, microsecond=0)
    slot_key = slot.strftime("%Y%m%d%H%M")
    cached = session.scalars(
        select(WindCache).where(WindCache.plaats == plaats, WindCache.slot_key == slot_key)
    ).first()
    if cached is not None:
        return _wind_dict(cached, plaats)
    try:
        wind = haal_knmi_wind(coords[0], coords[1], ts_utc)
    except KnmiError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    session.add(WindCache(
        plaats=plaats, slot_key=slot_key, wind_ms=wind.get("wind_ms"),
        windrichting_graden=wind.get("windrichting_graden"), windvlagen_ms=wind.get("windvlagen_ms"),
        wind_station=wind.get("wind_station"), wind_station_afstand_km=wind.get("wind_station_afstand_km"),
        wind_resolutie=wind.get("wind_resolutie"), wind_gevalideerd=wind.get("wind_gevalideerd"),
    ))
    session.commit()
    return _voeg_windtype_toe(wind, plaats)


@router.get("/pbholland/aankomend")
def aankomend(user: CurrentUser, session: Session = Depends(get_db_session)) -> dict:
    """Aankomende wedstrijden waarvoor de springer is aangemeld + welke vandaag is."""
    profiel = _gekoppeld_profiel(user, session)
    try:
        lijst = pbholland.haal_aankomend(profiel.pbholland_id, profiel.naam or None)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.") from exc
    vandaag = date.today().isoformat()
    return {"vandaag": vandaag, "wedstrijden": lijst}


@router.get("/pbholland/sprongen")
def sprongen(user: CurrentUser, session: Session = Depends(get_db_session)) -> dict:
    """Alle sprongen met ingevulde stok op + geldige afstand (voor de scatter-grafiek)."""
    profiel = _gekoppeld_profiel(user, session)
    pid = profiel.pbholland_id
    invoer = session.scalars(
        select(SprongInvoer).where(
            SprongInvoer.user_id == user.id,
            SprongInvoer.pbholland_id == pid,
            SprongInvoer.stok_op_m.isnot(None),
        )
    ).all()
    if not invoer:
        return {"sprongen": []}
    afstand_map = {
        (s.id_wedstrijd, s.poging_index): s.afstand
        for s in session.scalars(
            select(PbhSprong).where(PbhSprong.user_id == user.id, PbhSprong.pbholland_id == pid)
        ).all()
    }
    wed_map = {
        w.id_wedstrijd: w
        for w in session.scalars(
            select(PbhWedstrijd).where(PbhWedstrijd.user_id == user.id, PbhWedstrijd.pbholland_id == pid)
        ).all()
    }
    out = []
    for r in invoer:
        afstand = afstand_map.get((r.id_wedstrijd, r.poging_index))
        if afstand is None or afstand <= 0:
            continue
        w = wed_map.get(r.id_wedstrijd)
        out.append({
            "stok_op_m": r.stok_op_m,
            "afstand": afstand,
            "plaats": w.plaats if w else None,
            "categorie": w.categorie if w else None,
            "datum": w.datum if w else None,
        })
    return {"sprongen": out}


@router.get("/pbholland/wedstrijd/{id_wedstrijd}")
def wedstrijd_detail(
    id_wedstrijd: int, user: CurrentUser, session: Session = Depends(get_db_session)
) -> dict:
    """Sprongtabel van één wedstrijd — uit de database; recente wedstrijden ~12u ververst."""
    profiel = _gekoppeld_profiel(user, session)
    pid = profiel.pbholland_id
    nu = _now()
    wed = session.scalars(
        select(PbhWedstrijd).where(
            PbhWedstrijd.user_id == user.id,
            PbhWedstrijd.pbholland_id == pid,
            PbhWedstrijd.id_wedstrijd == id_wedstrijd,
        )
    ).first()

    # Aantal reeds opgeslagen sprongen; als dat 0 is terwijl de wedstrijd er wél
    # zou moeten hebben (bv. een eerder lege uitslag die inmiddels gevuld is, of
    # een verse wedstrijd), opnieuw ophalen zodat de terugval alsnog vult.
    opgeslagen_sprongen = session.scalar(
        select(func.count(PbhSprong.id)).where(
            PbhSprong.user_id == user.id,
            PbhSprong.pbholland_id == pid,
            PbhSprong.id_wedstrijd == id_wedstrijd,
        )
    )
    mist_sprongen = opgeslagen_sprongen == 0 and (wed is None or (wed.aantal_sprongen or 0) > 0)
    nodig = (
        wed is None
        or wed.detail_fetched_at is None
        or (_is_recent(wed.datum) and (nu - wed.detail_fetched_at) > _DETAIL_TTL)
        or mist_sprongen
    )
    if nodig:
        try:
            lijst = pbholland.haal_wedstrijden(profiel.pbholland_id, profiel.naam or None)
        except httpx.HTTPError as exc:
            if wed is None:
                raise HTTPException(status_code=503, detail="pbholland.com is tijdelijk niet bereikbaar.") from exc
            lijst = None
        if lijst is not None:
            meta = next((w for w in lijst["wedstrijden"] if w["id_wedstrijd"] == id_wedstrijd), None)
            # uitslaginfo geeft de rijke sprongtabel (tijd/afwijking/meetgegevens).
            # Bij verse wedstrijden staat die er nog niet → terugval op de afstanden
            # uit de resultatenlijst, zodat de pogingen tóch meteen zichtbaar zijn.
            detail = None
            try:
                detail = pbholland.haal_wedstrijd_detail(id_wedstrijd, profiel.pbholland_id)
            except (KeyError, httpx.HTTPError):
                detail = None
            pogingen = detail["pogingen"] if (detail and detail["pogingen"]) else None
            if pogingen is None and meta and meta.get("sprongen"):
                pogingen = pbholland.pogingen_uit_afstanden(meta["sprongen"])

            if wed is None and meta is None and pogingen is None:
                raise HTTPException(status_code=404, detail="Geen sprongen van jou in deze wedstrijd gevonden.")

            if wed is None:
                wed = PbhWedstrijd(
                    user_id=user.id, pbholland_id=pid, id_wedstrijd=id_wedstrijd,
                    datum=(meta["datum"] if meta else ""),
                )
                session.add(wed)
            if meta:
                wed.datum = meta["datum"]; wed.plaats = meta["plaats"] or ""
                wed.wedstrijd = meta["wedstrijd"] or ""; wed.categorie = meta["categorie"] or ""
                wed.verste_afstand = meta["verste_afstand"]; wed.plaats_finale = meta["plaats_finale"]
                wed.aantal_sprongen = meta["aantal_sprongen"]; wed.gemiddelde = meta["gemiddelde"]
                wed.fetched_at = nu
            if detail:
                wed.positie = detail["positie"]; wed.beste = detail["beste"]
            elif meta:
                wed.positie = meta["plaats_finale"]; wed.beste = meta["verste_afstand"]
            wed.detail_fetched_at = nu
            # Sprongen alleen vervangen als we echt pogingen hebben; zo wist een
            # tijdelijk lege uitslag geen eerder opgehaalde (rijkere) data.
            if pogingen:
                for oud in session.scalars(
                    select(PbhSprong).where(
                        PbhSprong.user_id == user.id,
                        PbhSprong.pbholland_id == pid,
                        PbhSprong.id_wedstrijd == id_wedstrijd,
                    )
                ).all():
                    session.delete(oud)
                session.flush()
                for i, p in enumerate(pogingen):
                    session.add(PbhSprong(
                        user_id=user.id, pbholland_id=pid, id_wedstrijd=id_wedstrijd, poging_index=i,
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
        .where(
            PbhSprong.user_id == user.id,
            PbhSprong.pbholland_id == pid,
            PbhSprong.id_wedstrijd == id_wedstrijd,
        )
        .order_by(PbhSprong.poging_index)
    ).all()
    stok = {
        r.poging_index: r
        for r in session.scalars(
            select(SprongInvoer).where(
                SprongInvoer.user_id == user.id,
                SprongInvoer.pbholland_id == pid,
                SprongInvoer.id_wedstrijd == id_wedstrijd,
            )
        ).all()
    }
    # Slot-keys per sprong + al-gecachte wind in één query ophalen (geen N losse hops).
    slot_per_index: dict[int, str] = {}
    for s in sprongen:
        tijd = s.tijd or s.tijd_schatting
        if tijd and wed.plaats:
            sk = _slot_key(wed.datum, tijd)
            if sk:
                slot_per_index[s.poging_index] = sk
    wind_per_slot: dict[str, WindCache] = {}
    if slot_per_index and wed.plaats:
        for c in session.scalars(
            select(WindCache).where(
                WindCache.plaats == wed.plaats, WindCache.slot_key.in_(set(slot_per_index.values()))
            )
        ).all():
            wind_per_slot[c.slot_key] = c

    pogingen = []
    for s in sprongen:
        si = stok.get(s.poging_index)
        c = wind_per_slot.get(slot_per_index.get(s.poging_index, ""))
        wind = _wind_dict(c, wed.plaats) if c is not None else None
        pogingen.append({
            "label": s.label, "afstand": s.afstand, "geldig": s.geldig,
            "id_meetgegevens": s.id_meetgegevens, "tijd": s.tijd, "tijd_schatting": s.tijd_schatting,
            "afwijking": s.afwijking, "landingsplaats": s.landingsplaats, "poging_index": s.poging_index,
            "stok_op_m": si.stok_op_m if si else None,
            "stok_uit_hand_m": si.stok_uit_hand_m if si else None,
            "wind": wind,
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
    profiel = _gekoppeld_profiel(user, session)
    pid = profiel.pbholland_id
    rij = session.scalars(
        select(SprongInvoer).where(
            SprongInvoer.user_id == user.id,
            SprongInvoer.pbholland_id == pid,
            SprongInvoer.id_wedstrijd == id_wedstrijd,
            SprongInvoer.poging_index == poging_index,
        )
    ).first()
    if rij is None:
        rij = SprongInvoer(
            user_id=user.id, pbholland_id=pid, id_wedstrijd=id_wedstrijd, poging_index=poging_index
        )
        session.add(rij)
    rij.stok_op_m = payload.stok_op_m
    rij.stok_uit_hand_m = payload.stok_uit_hand_m
    session.commit()
    return {"stok_op_m": rij.stok_op_m, "stok_uit_hand_m": rij.stok_uit_hand_m}


def _slot_key(datum: str, tijd: str) -> str | None:
    """UTC-slot (10 min) voor een lokale datum + tijd; None bij ongeldige invoer."""
    try:
        lokaal = datetime.fromisoformat(f"{datum}T{tijd}").replace(tzinfo=_NL_TZ)
    except (ValueError, TypeError):
        return None
    ts_utc = lokaal.astimezone(timezone.utc)
    slot = ts_utc.replace(minute=(ts_utc.minute // 10) * 10, second=0, microsecond=0)
    return slot.strftime("%Y%m%d%H%M")


def _wind_dict(c: WindCache, plaats: str) -> dict:
    return _voeg_windtype_toe(
        {
            "wind_ms": c.wind_ms,
            "windrichting_graden": c.windrichting_graden,
            "windvlagen_ms": c.windvlagen_ms,
            "wind_station": c.wind_station,
            "wind_station_afstand_km": c.wind_station_afstand_km,
            "wind_resolutie": c.wind_resolutie,
            "wind_gevalideerd": c.wind_gevalideerd,
            "bron": "cache",
        },
        plaats,
    )


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
