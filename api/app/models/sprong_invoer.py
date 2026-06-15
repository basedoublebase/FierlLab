from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SprongInvoer(Base):
    """Eigen handmatige data bij een pbholland-sprong (niet in pbholland aanwezig).

    Gekoppeld aan de pbholland-wedstrijd + de poging-index binnen die wedstrijd.
    """

    __tablename__ = "sprong_invoer"
    __table_args__ = (UniqueConstraint("user_id", "id_wedstrijd", "poging_index", name="uq_sprong_invoer"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    id_wedstrijd: Mapped[int] = mapped_column(Integer, index=True)
    poging_index: Mapped[int] = mapped_column(Integer)
    stok_op_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    stok_uit_hand_m: Mapped[float | None] = mapped_column(Float, nullable=True)
