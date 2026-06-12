from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SchansResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    naam: str
    locatie: str
    lat: float | None
    lon: float | None
    knmi_station_id: str | None
    waterdiepte_m: float
    schanshoogte_m: float


class SchansCreateRequest(BaseModel):
    naam: str
    locatie: str = ""
    lat: float | None = None
    lon: float | None = None
    knmi_station_id: str | None = None
    waterdiepte_m: float = 1.70
    schanshoogte_m: float = 4.00


class SchansUpdateRequest(BaseModel):
    naam: str | None = None
    locatie: str | None = None
    lat: float | None = None
    lon: float | None = None
    knmi_station_id: str | None = None
    waterdiepte_m: float | None = None
    schanshoogte_m: float | None = None
