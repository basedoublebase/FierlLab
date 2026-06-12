from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth import CurrentUser
from app.db import get_db_session
from app.models.schans import Schans
from app.models.wedstrijd import Poging, Wedstrijd
from app.schemas.wedstrijd import (
    PogingCreateRequest,
    PogingResponse,
    PogingUpdateRequest,
    WedstrijdCreateRequest,
    WedstrijdResponse,
    WedstrijdUpdateRequest,
)

router = APIRouter(tags=["wedstrijden"])


def _vind_wedstrijd(session: Session, wedstrijd_id: int, user_id: int) -> Wedstrijd:
    wedstrijd = session.scalars(
        select(Wedstrijd)
        .options(selectinload(Wedstrijd.pogingen))
        .where(Wedstrijd.id == wedstrijd_id)
    ).first()
    if wedstrijd is None or wedstrijd.user_id != user_id:
        raise HTTPException(status_code=404, detail="Wedstrijd niet gevonden.")
    return wedstrijd


def _eigen_schans(session: Session, schans_id: int, user_id: int) -> Schans:
    schans = session.get(Schans, schans_id)
    if schans is None or schans.user_id != user_id:
        raise HTTPException(status_code=422, detail="Onbekende schans.")
    return schans


def _naar_response(session: Session, wedstrijd: Wedstrijd) -> WedstrijdResponse:
    schans = session.get(Schans, wedstrijd.schans_id)
    return WedstrijdResponse(
        id=wedstrijd.id,
        datum=wedstrijd.datum,
        categorie=wedstrijd.categorie,
        pbholland_wedstrijd_id=wedstrijd.pbholland_wedstrijd_id,
        schans=schans,
        pogingen=wedstrijd.pogingen,
    )


@router.get("/wedstrijden", response_model=list[WedstrijdResponse])
def list_wedstrijden(user: CurrentUser, session: Session = Depends(get_db_session)) -> list[WedstrijdResponse]:
    wedstrijden = session.scalars(
        select(Wedstrijd)
        .options(selectinload(Wedstrijd.pogingen))
        .where(Wedstrijd.user_id == user.id)
        .order_by(Wedstrijd.datum.desc(), Wedstrijd.id.desc())
    ).all()
    return [_naar_response(session, w) for w in wedstrijden]


@router.post("/wedstrijden", response_model=WedstrijdResponse, status_code=201)
def create_wedstrijd(
    payload: WedstrijdCreateRequest, user: CurrentUser, session: Session = Depends(get_db_session)
) -> WedstrijdResponse:
    _eigen_schans(session, payload.schans_id, user.id)
    wedstrijd = Wedstrijd(user_id=user.id, **payload.model_dump())
    session.add(wedstrijd)
    session.commit()
    session.refresh(wedstrijd)
    return _naar_response(session, wedstrijd)


@router.get("/wedstrijden/{wedstrijd_id}", response_model=WedstrijdResponse)
def get_wedstrijd(
    wedstrijd_id: int, user: CurrentUser, session: Session = Depends(get_db_session)
) -> WedstrijdResponse:
    return _naar_response(session, _vind_wedstrijd(session, wedstrijd_id, user.id))


@router.patch("/wedstrijden/{wedstrijd_id}", response_model=WedstrijdResponse)
def update_wedstrijd(
    wedstrijd_id: int,
    payload: WedstrijdUpdateRequest,
    user: CurrentUser,
    session: Session = Depends(get_db_session),
) -> WedstrijdResponse:
    wedstrijd = _vind_wedstrijd(session, wedstrijd_id, user.id)
    data = payload.model_dump(exclude_unset=True)
    if "schans_id" in data:
        _eigen_schans(session, data["schans_id"], user.id)
    for field, value in data.items():
        setattr(wedstrijd, field, value)
    session.commit()
    session.refresh(wedstrijd)
    return _naar_response(session, wedstrijd)


@router.delete("/wedstrijden/{wedstrijd_id}", status_code=204)
def delete_wedstrijd(
    wedstrijd_id: int, user: CurrentUser, session: Session = Depends(get_db_session)
) -> None:
    wedstrijd = _vind_wedstrijd(session, wedstrijd_id, user.id)
    session.delete(wedstrijd)
    session.commit()


@router.post("/wedstrijden/{wedstrijd_id}/pogingen", response_model=PogingResponse, status_code=201)
def create_poging(
    wedstrijd_id: int,
    payload: PogingCreateRequest,
    user: CurrentUser,
    session: Session = Depends(get_db_session),
) -> Poging:
    wedstrijd = _vind_wedstrijd(session, wedstrijd_id, user.id)
    volgend_nummer = max((p.nummer for p in wedstrijd.pogingen), default=0) + 1
    poging = Poging(
        wedstrijd_id=wedstrijd.id,
        nummer=volgend_nummer,
        stok_op_m=payload.stok_op_m,
        afstand_m=payload.afstand_m,
        timestamp=payload.timestamp or datetime.now(timezone.utc).replace(tzinfo=None),
    )
    session.add(poging)
    session.commit()
    session.refresh(poging)
    return poging


def _vind_poging(session: Session, poging_id: int, user_id: int) -> Poging:
    poging = session.get(Poging, poging_id)
    if poging is None:
        raise HTTPException(status_code=404, detail="Poging niet gevonden.")
    wedstrijd = session.get(Wedstrijd, poging.wedstrijd_id)
    if wedstrijd is None or wedstrijd.user_id != user_id:
        raise HTTPException(status_code=404, detail="Poging niet gevonden.")
    return poging


@router.patch("/pogingen/{poging_id}", response_model=PogingResponse)
def update_poging(
    poging_id: int,
    payload: PogingUpdateRequest,
    user: CurrentUser,
    session: Session = Depends(get_db_session),
) -> Poging:
    poging = _vind_poging(session, poging_id, user.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(poging, field, value)
    session.commit()
    session.refresh(poging)
    return poging


@router.delete("/pogingen/{poging_id}", status_code=204)
def delete_poging(poging_id: int, user: CurrentUser, session: Session = Depends(get_db_session)) -> None:
    poging = _vind_poging(session, poging_id, user.id)
    wedstrijd_id = poging.wedstrijd_id
    session.delete(poging)
    session.flush()
    # Hernummer zodat pogingen altijd 1..n blijven.
    rest = session.scalars(
        select(Poging).where(Poging.wedstrijd_id == wedstrijd_id).order_by(Poging.nummer)
    ).all()
    for index, p in enumerate(rest, start=1):
        p.nummer = index
    session.commit()
