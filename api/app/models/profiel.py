from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Profiel(Base):
    """Springersprofiel, 1 per gebruiker. Waarden voeden het fysica-model."""

    __tablename__ = "profielen"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    naam: Mapped[str] = mapped_column(String(120), default="")
    geboortejaar: Mapped[int | None] = mapped_column(Integer, nullable=True)
    massa_kg: Mapped[float] = mapped_column(Float, default=76.1)
    springer_gestrekt_m: Mapped[float] = mapped_column(Float, default=2.25)
    stoklengte_m: Mapped[float] = mapped_column(Float, default=13.25)
    uitsprongstoot_ns: Mapped[float] = mapped_column(Float, default=120.0)
    pbholland_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
