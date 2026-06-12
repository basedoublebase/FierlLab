from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db_session
from app.models.schans import Schans
from app.models.wedstrijd import Wedstrijd
from app.schemas.schans import SchansCreateRequest, SchansResponse, SchansUpdateRequest
from app.seeds.schansen import SEED_SCHANSEN

router = APIRouter(tags=["schansen"])


def _eigen_schansen(session: Session, user_id: int) -> list[Schans]:
    schansen = list(session.scalars(select(Schans).where(Schans.user_id == user_id)).all())
    if not schansen:
        # Eerste gebruik: seed de bekende accommodaties voor deze gebruiker.
        schansen = [Schans(user_id=user_id, **seed) for seed in SEED_SCHANSEN]
        session.add_all(schansen)
        session.commit()
        for schans in schansen:
            session.refresh(schans)
    return schansen


def _vind_schans(session: Session, schans_id: int, user_id: int) -> Schans:
    schans = session.get(Schans, schans_id)
    if schans is None or schans.user_id != user_id:
        raise HTTPException(status_code=404, detail="Schans niet gevonden.")
    return schans


@router.get("/schansen", response_model=list[SchansResponse])
def list_schansen(user: CurrentUser, session: Session = Depends(get_db_session)) -> list[Schans]:
    schansen = _eigen_schansen(session, user.id)
    return sorted(schansen, key=lambda s: s.naam.lower())


@router.post("/schansen", response_model=SchansResponse, status_code=201)
def create_schans(
    payload: SchansCreateRequest, user: CurrentUser, session: Session = Depends(get_db_session)
) -> Schans:
    schans = Schans(user_id=user.id, **payload.model_dump())
    session.add(schans)
    session.commit()
    session.refresh(schans)
    return schans


@router.patch("/schansen/{schans_id}", response_model=SchansResponse)
def update_schans(
    schans_id: int,
    payload: SchansUpdateRequest,
    user: CurrentUser,
    session: Session = Depends(get_db_session),
) -> Schans:
    schans = _vind_schans(session, schans_id, user.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(schans, field, value)
    session.commit()
    session.refresh(schans)
    return schans


@router.delete("/schansen/{schans_id}", status_code=204)
def delete_schans(schans_id: int, user: CurrentUser, session: Session = Depends(get_db_session)) -> None:
    schans = _vind_schans(session, schans_id, user.id)
    in_gebruik = session.scalars(
        select(Wedstrijd.id).where(Wedstrijd.schans_id == schans_id).limit(1)
    ).first()
    if in_gebruik is not None:
        raise HTTPException(
            status_code=422,
            detail="Deze schans heeft wedstrijden en kan niet worden verwijderd.",
        )
    session.delete(schans)
    session.commit()
