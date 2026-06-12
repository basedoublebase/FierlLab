from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db_session
from app.models.schans import Schans
from app.services.wind import haal_wind

router = APIRouter(tags=["wind"])


@router.get("/wind")
def get_wind(
    schans_id: int,
    timestamp: datetime,
    user: CurrentUser,
    session: Session = Depends(get_db_session),
) -> dict:
    schans = session.get(Schans, schans_id)
    if schans is None or schans.user_id != user.id:
        raise HTTPException(status_code=404, detail="Schans niet gevonden.")
    if schans.lat is None or schans.lon is None:
        raise HTTPException(
            status_code=422,
            detail="Deze schans heeft geen coördinaten; vul lat/lon in bij Instellingen.",
        )

    wind = haal_wind(schans.lat, schans.lon, timestamp)
    if wind is None:
        raise HTTPException(status_code=503, detail="Winddata tijdelijk niet beschikbaar.")
    return wind
