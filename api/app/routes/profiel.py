from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db_session
from app.models.profiel import Profiel
from app.schemas.profiel import ProfielResponse, ProfielUpdateRequest

router = APIRouter(tags=["profiel"])


def _get_or_create(session: Session, user_id: int) -> Profiel:
    profiel = session.scalars(select(Profiel).where(Profiel.user_id == user_id)).first()
    if profiel is None:
        profiel = Profiel(user_id=user_id)
        session.add(profiel)
        session.commit()
        session.refresh(profiel)
    return profiel


@router.get("/profiel", response_model=ProfielResponse)
def get_profiel(user: CurrentUser, session: Session = Depends(get_db_session)) -> Profiel:
    return _get_or_create(session, user.id)


@router.put("/profiel", response_model=ProfielResponse)
def update_profiel(
    payload: ProfielUpdateRequest, user: CurrentUser, session: Session = Depends(get_db_session)
) -> Profiel:
    profiel = _get_or_create(session, user.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profiel, field, value)
    session.commit()
    session.refresh(profiel)
    return profiel
