"""Wind-lookup per schans + tijdstip.

Bron: Open-Meteo (gratis, geen API-key; gebruikt het KNMI-model voor Nederland).
Het briefing-document noemt het KNMI Data Platform; dat levert NetCDF-bestanden
en vereist een key — kan later als tweede bron worden toegevoegd
(Schans.knmi_station_id staat er al voor klaar).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx

OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"


def haal_wind(lat: float, lon: float, tijdstip: datetime) -> dict | None:
    """Geef {wind_ms, windrichting_graden, bron} voor het uur rond `tijdstip`, of None."""
    if tijdstip.tzinfo is None:
        tijdstip = tijdstip.replace(tzinfo=timezone.utc)

    # Het archief loopt ~5 dagen achter; recenter gaat via de forecast-API
    # (die ook de afgelopen dagen aan observaties/model bevat).
    dagen_oud = (datetime.now(timezone.utc) - tijdstip).days
    datum = tijdstip.date().isoformat()
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "ms",
        "timezone": "UTC",
        "start_date": datum,
        "end_date": datum,
    }
    url = OPEN_METEO_ARCHIVE if dagen_oud > 6 else OPEN_METEO_FORECAST

    try:
        response = httpx.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return None

    hourly = data.get("hourly") or {}
    tijden = hourly.get("time") or []
    snelheden = hourly.get("wind_speed_10m") or []
    richtingen = hourly.get("wind_direction_10m") or []
    if not tijden or not snelheden:
        return None

    # Dichtstbijzijnde uur bij het tijdstip van de poging.
    doel = tijdstip.replace(tzinfo=None)
    beste_i = min(
        range(len(tijden)),
        key=lambda i: abs(datetime.fromisoformat(tijden[i]) - doel),
    )
    afwijking = abs(datetime.fromisoformat(tijden[beste_i]) - doel)
    if afwijking > timedelta(hours=2):
        return None

    wind_ms = snelheden[beste_i]
    richting = richtingen[beste_i] if beste_i < len(richtingen) else None
    if wind_ms is None:
        return None

    return {
        "wind_ms": round(float(wind_ms), 1),
        "windrichting_graden": float(richting) if richting is not None else None,
        "bron": "open-meteo",
    }
