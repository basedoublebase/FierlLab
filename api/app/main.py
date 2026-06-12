from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.profiel import router as profiel_router
from app.routes.schansen import router as schansen_router
from app.routes.wedstrijden import router as wedstrijden_router
from app.routes.wind import router as wind_router
from app.startup import lifespan

ALLOWED_ORIGINS = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3021",
    "http://localhost:3021",
]


def create_app() -> FastAPI:
    app = FastAPI(title="Polsstok Tracker API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    app.include_router(profiel_router)
    app.include_router(schansen_router)
    app.include_router(wedstrijden_router)
    app.include_router(wind_router)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
