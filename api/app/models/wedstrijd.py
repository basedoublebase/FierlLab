from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Wedstrijd(Base):
    __tablename__ = "wedstrijden"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    schans_id: Mapped[int] = mapped_column(ForeignKey("schansen.id"))
    datum: Mapped[date] = mapped_column(Date, index=True)
    categorie: Mapped[str] = mapped_column(String(40), default="senioren")
    pbholland_wedstrijd_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    pogingen: Mapped[list["Poging"]] = relationship(
        back_populates="wedstrijd",
        cascade="all, delete-orphan",
        order_by="Poging.nummer",
    )


class Poging(Base):
    __tablename__ = "pogingen"

    id: Mapped[int] = mapped_column(primary_key=True)
    wedstrijd_id: Mapped[int] = mapped_column(ForeignKey("wedstrijden.id"), index=True)
    nummer: Mapped[int] = mapped_column(Integer)
    # Stok op: handmatige invoer, unieke data die nergens anders beschikbaar is.
    stok_op_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Afstand: None = nog niet gesprongen; 0 = natte/ongeldige sprong.
    afstand_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    windrichting_graden: Mapped[float | None] = mapped_column(Float, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime)

    # On-demand KNMI-winddata (per sprong opgehaald via knop, daarna gecachet).
    windvlagen_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_station: Mapped[str | None] = mapped_column(String(80), nullable=True)
    wind_station_afstand_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_bron_utc: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    wind_resolutie: Mapped[str | None] = mapped_column(String(8), nullable=True)  # "10min" | "uur"
    wind_gevalideerd: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    wind_fetched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    wedstrijd: Mapped[Wedstrijd] = relationship(back_populates="pogingen")
