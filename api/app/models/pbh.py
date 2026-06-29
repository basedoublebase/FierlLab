from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PbhWedstrijd(Base):
    """Permanent opgeslagen pbholland-wedstrijd (per gebruiker, per id_wedstrijd)."""

    __tablename__ = "pbh_wedstrijd"
    __table_args__ = (UniqueConstraint("user_id", "id_wedstrijd", name="uq_pbh_wedstrijd"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    id_wedstrijd: Mapped[int] = mapped_column(Integer, index=True)
    datum: Mapped[str] = mapped_column(String(10))  # ISO YYYY-MM-DD
    plaats: Mapped[str] = mapped_column(String(80), default="")
    wedstrijd: Mapped[str] = mapped_column(String(160), default="")
    categorie: Mapped[str] = mapped_column(String(40), default="")
    verste_afstand: Mapped[float | None] = mapped_column(Float, nullable=True)
    plaats_finale: Mapped[str | None] = mapped_column(String(8), nullable=True)
    aantal_sprongen: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gemiddelde: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Detail-niveau (uit uitslaginfo/meetgegevens):
    positie: Mapped[str | None] = mapped_column(String(8), nullable=True)
    beste: Mapped[float | None] = mapped_column(Float, nullable=True)
    detail_fetched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime)


class PbhProfiel(Base):
    """Permanent opgeslagen pbholland-profielvelden (per gebruiker), voor Statistieken."""

    __tablename__ = "pbh_profiel"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    naam: Mapped[str] = mapped_column(String(120), default="")
    bond: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vereniging: Mapped[str | None] = mapped_column(String(80), nullable=True)
    woonplaats: Mapped[str | None] = mapped_column(String(80), nullable=True)
    categorie: Mapped[str | None] = mapped_column(String(40), nullable=True)
    wedstrijdcategorie: Mapped[str | None] = mapped_column(String(40), nullable=True)
    rugnummer: Mapped[str | None] = mapped_column(String(12), nullable=True)
    ranking: Mapped[float | None] = mapped_column(Float, nullable=True)
    titels: Mapped[float | None] = mapped_column(Float, nullable=True)
    dagtitels: Mapped[float | None] = mapped_column(Float, nullable=True)
    pr_overall: Mapped[float | None] = mapped_column(Float, nullable=True)
    aantal_wedstrijden: Mapped[int | None] = mapped_column(Integer, nullable=True)
    aantal_sprongen: Mapped[int | None] = mapped_column(Integer, nullable=True)


class PbhKlassement(Base):
    """Klassement per seizoen (per gebruiker): positie + totaalscore."""

    __tablename__ = "pbh_klassement"
    __table_args__ = (UniqueConstraint("user_id", "jaar", name="uq_pbh_klassement"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    jaar: Mapped[int] = mapped_column(Integer)
    positie: Mapped[int | None] = mapped_column(Integer, nullable=True)
    totaal: Mapped[float | None] = mapped_column(Float, nullable=True)


class PbhSprong(Base):
    """Permanent opgeslagen pbholland-sprong (per gebruiker, per wedstrijd + poging)."""

    __tablename__ = "pbh_sprong"
    __table_args__ = (UniqueConstraint("user_id", "id_wedstrijd", "poging_index", name="uq_pbh_sprong"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    id_wedstrijd: Mapped[int] = mapped_column(Integer, index=True)
    poging_index: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(20), default="")
    afstand: Mapped[float | None] = mapped_column(Float, nullable=True)
    geldig: Mapped[bool] = mapped_column(Boolean, default=False)
    id_meetgegevens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tijd: Mapped[str | None] = mapped_column(String(8), nullable=True)
    tijd_schatting: Mapped[str | None] = mapped_column(String(8), nullable=True)
    afwijking: Mapped[float | None] = mapped_column(Float, nullable=True)
    landingsplaats: Mapped[float | None] = mapped_column(Float, nullable=True)
