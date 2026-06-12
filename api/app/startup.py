from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

import app.models  # noqa: F401  — registreer alle modellen op Base
from app.db import Base, engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield
