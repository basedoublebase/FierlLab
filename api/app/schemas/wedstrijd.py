from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.schans import SchansResponse


class PogingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nummer: int
    stok_op_m: float | None
    afstand_m: float | None
    wind_ms: float | None
    windrichting_graden: float | None
    timestamp: datetime
    windvlagen_ms: float | None = None
    wind_station: str | None = None
    wind_station_afstand_km: float | None = None
    wind_resolutie: str | None = None
    wind_gevalideerd: bool | None = None


class WedstrijdResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    datum: date
    categorie: str
    pbholland_wedstrijd_id: int | None
    schans: SchansResponse
    pogingen: list[PogingResponse]


class WedstrijdCreateRequest(BaseModel):
    datum: date
    schans_id: int
    categorie: str = "senioren"
    pbholland_wedstrijd_id: int | None = None


class WedstrijdUpdateRequest(BaseModel):
    datum: date | None = None
    schans_id: int | None = None
    categorie: str | None = None
    pbholland_wedstrijd_id: int | None = None


class PogingCreateRequest(BaseModel):
    stok_op_m: float | None = None
    afstand_m: float | None = None
    timestamp: datetime | None = None


class PogingUpdateRequest(BaseModel):
    stok_op_m: float | None = None
    afstand_m: float | None = None
    wind_ms: float | None = None
    windrichting_graden: float | None = None
