"""Supabase token verification for FastAPI via Supabase Auth API."""
from __future__ import annotations

import os
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db_session as get_db
from app.models.user import User

_bearer = HTTPBearer(auto_error=False)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# Verified-token cache: avoids a Supabase roundtrip on every API request.
_TOKEN_CACHE_TTL = 600  # seconds
_token_cache: dict[str, tuple[str, float]] = {}


def _verify_token(token: str) -> str:
    """Verify token via Supabase Auth API (cached), return supabase user id."""
    import time

    cached = _token_cache.get(token)
    if cached is not None and cached[1] > time.monotonic():
        return cached[0]

    uid = _verify_token_remote(token)

    if len(_token_cache) > 1000:
        _token_cache.clear()
    _token_cache[token] = (uid, time.monotonic() + _TOKEN_CACHE_TTL)
    return uid


def _verify_token_remote(token: str) -> str:
    if not SUPABASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL not configured",
        )
    try:
        response = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
            timeout=10,
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Auth service unavailable") from exc

    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ongeldig of verlopen token")

    return response.json()["id"]


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Session = Depends(get_db),
) -> User:
    """Verify token, auto-create user record on first login."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Niet ingelogd")

    supabase_uid = _verify_token(credentials.credentials)

    user = db.query(User).filter(User.supabase_uid == supabase_uid).first()
    if user is None:
        user = User(supabase_uid=supabase_uid)
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
