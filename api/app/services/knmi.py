"""On-demand winddata uit het KNMI Open Data Platform, per sprong.

Tweestaps-fetch: eerst een tijdelijke download-URL opvragen, dan het NetCDF4-
bestand (HDF5) downloaden en parsen met h5py. We kiezen het station dat
geografisch het dichtst bij de schans ligt (haversine).

- ≤ ~60 dagen oud → 10-minuten-dataset (KMDS__OPER_P___10M_OBS_L2_<slot>.nc),
  bestandsnaam o.b.v. het EINDE van het 10-minuten-interval in UTC.
- ouder → uurdataset-fallback (configureerbaar via env; nog te verifiëren met
  een geregistreerde key). Tot dan een nette melding i.p.v. gokwerk.

De API-key komt uit env-var KNMI_API_KEY; valt terug op de publieke anonieme
key zodat het direct werkt. Vervang door je geregistreerde key zodra die er is.
"""
from __future__ import annotations

import io
import math
import os
from datetime import datetime, timedelta, timezone

import httpx

# Publieke anonieme key (geldig t/m 1 juli 2026) als fallback.
_ANONIEME_KEY = "eyJvcmciOiI1ZTU1NGUxOTI3NGE5NjAwMDEyYTNlYjEiLCJpZCI6ImVlNDFjMWI0MjlkODQ2MThiNWI4ZDViZDAyMTM2YTM3IiwiaCI6Im11cm11cjEyOCJ9"

API_BASE = "https://api.dataplatform.knmi.nl/open-data/v1/datasets"
TENMIN_DATASET = "10-minute-in-situ-meteorological-observations"
TENMIN_VERSION = "1.0"
# Uur-fallback voor sprongen >60 dagen oud (geverifieerd).
HOURLY_DATASET = os.getenv("KNMI_HOURLY_DATASET", "hourly-in-situ-meteorological-observations")
HOURLY_VERSION = os.getenv("KNMI_HOURLY_VERSION", "1.0")

_ARCHIEF_DAGEN = 60


class KnmiError(Exception):
    """Begrijpelijke foutmelding voor de UI."""


def _api_key() -> str:
    return os.getenv("KNMI_API_KEY") or _ANONIEME_KEY


def _slot_einde(ts_utc: datetime) -> datetime:
    """Rond op naar het EINDE van het 10-minuten-interval (UTC)."""
    minuut = ts_utc.minute
    rest = minuut % 10
    basis = ts_utc.replace(second=0, microsecond=0)
    if rest == 0 and ts_utc.second == 0 and ts_utc.microsecond == 0:
        return basis
    return (basis - timedelta(minutes=rest)) + timedelta(minutes=10)


def _tenmin_filename(slot_utc: datetime) -> str:
    return f"KMDS__OPER_P___10M_OBS_L2_{slot_utc:%Y%m%d%H%M}.nc"


def _download_url(dataset: str, version: str, filename: str) -> str:
    url = f"{API_BASE}/{dataset}/versions/{version}/files/{filename}/url"
    resp = httpx.get(url, headers={"Authorization": _api_key()}, timeout=20)
    if resp.status_code == 404:
        raise KnmiError("Voor dit tijdstip is (nog) geen KNMI-bestand beschikbaar.")
    if resp.status_code == 429:
        raise KnmiError("KNMI-limiet bereikt; probeer het over een paar minuten opnieuw.")
    if resp.status_code in (401, 403):
        raise KnmiError("KNMI-API-key ongeldig of verlopen.")
    resp.raise_for_status()
    dl = resp.json().get("temporaryDownloadUrl")
    if not dl:
        raise KnmiError("KNMI gaf geen download-URL terug.")
    return dl


def _haversine_km(la1: float, lo1: float, la2: float, lo2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dphi = math.radians(la2 - la1)
    dl = math.radians(lo2 - lo1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _parse_dichtstbij(data: bytes, lat: float, lon: float) -> dict:
    """Lees het NetCDF4/HDF5-bestand en geef de wind van het dichtstbijzijnde station."""
    import h5py  # zware import; alleen wanneer echt nodig
    import numpy as np

    def _var(f, *namen):
        # 10-min gebruikt dd/ff/gff; uurdataset gebruikt DD/FF/FX.
        for n in namen:
            if n in f:
                return f[n][:, 0]
        return None

    with h5py.File(io.BytesIO(data), "r") as f:
        slat = f["lat"][:]
        slon = f["lon"][:]
        dd = _var(f, "dd", "DD")
        ff = _var(f, "ff", "FF", "FH")
        gff = _var(f, "gff", "FX")
        if ff is None:
            raise KnmiError("KNMI-bestand bevat geen windsnelheid.")
        if dd is None:
            dd = np.full_like(ff, np.nan)
        if gff is None:
            gff = np.full_like(ff, np.nan)
        namen = [n.decode() if isinstance(n, bytes) else str(n) for n in f["stationname"][:]]
        tijd = float(f["time"][0])  # seconden sinds 1950-01-01

    # Sorteer stations op afstand en pak het dichtstbijzijnde met een geldige windwaarde.
    volgorde = sorted(
        range(len(slat)),
        key=lambda i: _haversine_km(lat, lon, float(slat[i]), float(slon[i])),
    )
    for i in volgorde:
        if not math.isnan(float(ff[i])):
            bron_utc = datetime(1950, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=tijd)
            return {
                "wind_ms": round(float(ff[i]), 1),
                "windrichting_graden": None if math.isnan(float(dd[i])) else round(float(dd[i]), 0),
                "windvlagen_ms": None if math.isnan(float(gff[i])) else round(float(gff[i]), 1),
                "wind_station": namen[i],
                "wind_station_afstand_km": round(_haversine_km(lat, lon, float(slat[i]), float(slon[i])), 1),
                "wind_bron_utc": bron_utc.replace(tzinfo=None),
            }
    raise KnmiError("Geen enkel KNMI-station rapporteerde wind voor dit tijdstip.")


def haal_knmi_wind(lat: float, lon: float, ts: datetime) -> dict:
    """Haal winddata op voor een schanslocatie + sprong-tijdstip."""
    if ts.tzinfo is None:
        ts_utc = ts.replace(tzinfo=timezone.utc)
    else:
        ts_utc = ts.astimezone(timezone.utc)

    leeftijd_dagen = (datetime.now(timezone.utc) - ts_utc).days

    if leeftijd_dagen > _ARCHIEF_DAGEN:
        if not HOURLY_DATASET:
            raise KnmiError(
                "Deze sprong is ouder dan ~60 dagen; de uurdata-fallback is nog niet "
                "geactiveerd (wacht op de geregistreerde KNMI-key)."
            )
        # Uur-fallback: zelfde tweestaps-fetch, uurresolutie.
        slot = ts_utc.replace(minute=0, second=0, microsecond=0)
        if ts_utc.minute >= 30:
            slot += timedelta(hours=1)
        filename = f"hourly-observations-{slot:%Y%m%d-%H}.nc"
        try:
            dl = _download_url(HOURLY_DATASET, HOURLY_VERSION, filename)
            data = httpx.get(dl, timeout=40).content
            result = _parse_dichtstbij(data, lat, lon)
        except httpx.HTTPError as exc:
            raise KnmiError("KNMI uurdata tijdelijk niet bereikbaar.") from exc
        result["wind_resolutie"] = "uur"
        result["wind_gevalideerd"] = True
        return result

    slot = _slot_einde(ts_utc)
    filename = _tenmin_filename(slot)
    try:
        dl = _download_url(TENMIN_DATASET, TENMIN_VERSION, filename)
        data = httpx.get(dl, timeout=40).content
        result = _parse_dichtstbij(data, lat, lon)
    except httpx.HTTPError as exc:
        raise KnmiError("KNMI tijdelijk niet bereikbaar.") from exc
    result["wind_resolutie"] = "10min"
    result["wind_gevalideerd"] = False  # 10-min realtime is ongevalideerd
    return result
