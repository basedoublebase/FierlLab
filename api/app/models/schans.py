from __future__ import annotations

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Schans(Base):
    """Accommodatie. Per gebruiker (bij eerste gebruik geseed met bekende schansen)."""

    __tablename__ = "schansen"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    naam: Mapped[str] = mapped_column(String(120))
    locatie: Mapped[str] = mapped_column(String(120), default="")
    # Coördinaten voor de wind-lookup (Open-Meteo).
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Voor een latere echte KNMI-integratie.
    knmi_station_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    waterdiepte_m: Mapped[float] = mapped_column(Float, default=1.70)
    schanshoogte_m: Mapped[float] = mapped_column(Float, default=4.00)
