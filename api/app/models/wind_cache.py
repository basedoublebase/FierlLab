from __future__ import annotations

from sqlalchemy import Boolean, Float, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class WindCache(Base):
    """Permanente cache van KNMI-wind per locatie + 10-minuten-slot.

    Historische wind verandert nooit, dus per (plaats, slot) één keer ophalen.
    Gedeeld over alle gebruikers (wind is objectief).
    """

    __tablename__ = "wind_cache"
    __table_args__ = (UniqueConstraint("plaats", "slot_key", name="uq_wind_cache"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    plaats: Mapped[str] = mapped_column(String(80), index=True)
    slot_key: Mapped[str] = mapped_column(String(20), index=True)  # UTC-slot, afgerond op 10 min
    wind_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    windrichting_graden: Mapped[float | None] = mapped_column(Float, nullable=True)
    windvlagen_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_station: Mapped[str | None] = mapped_column(String(80), nullable=True)
    wind_station_afstand_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_resolutie: Mapped[str | None] = mapped_column(String(8), nullable=True)
    wind_gevalideerd: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
