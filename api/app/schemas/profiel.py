from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ProfielResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    naam: str
    geboortejaar: int | None
    massa_kg: float
    springer_gestrekt_m: float
    stoklengte_m: float
    uitsprongstoot_ns: float
    pbholland_id: int | None


class ProfielUpdateRequest(BaseModel):
    naam: str | None = None
    geboortejaar: int | None = None
    massa_kg: float | None = None
    springer_gestrekt_m: float | None = None
    stoklengte_m: float | None = None
    uitsprongstoot_ns: float | None = None
    pbholland_id: int | None = None
