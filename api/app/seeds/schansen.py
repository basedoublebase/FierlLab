"""Bekende fierljep-accommodaties, geseed per gebruiker bij eerste gebruik.

Coördinaten zijn van de dorpskern (ruim voldoende voor winddata);
waterdiepte/schanshoogte zijn redelijke defaults en per schans aanpasbaar.
"""
from __future__ import annotations

SEED_SCHANSEN: list[dict] = [
    # Hollandse accommodaties (PBH)
    {"naam": "Polsbroekerdam", "locatie": "Polsbroekerdam", "lat": 52.0014, "lon": 4.8244, "knmi_station_id": "348"},
    {"naam": "Vlist", "locatie": "Vlist", "lat": 51.9706, "lon": 4.7964, "knmi_station_id": "348"},
    {"naam": "Linschoten", "locatie": "Linschoten", "lat": 52.0639, "lon": 4.9131, "knmi_station_id": "348"},
    {"naam": "Jaarsveld", "locatie": "Jaarsveld", "lat": 51.9772, "lon": 4.9344, "knmi_station_id": "348"},
    {"naam": "Zegveld", "locatie": "Zegveld", "lat": 52.1136, "lon": 4.8358, "knmi_station_id": "348"},
    # Friese accommodaties (FLB)
    {"naam": "Winsum", "locatie": "Winsum (Fr.)", "lat": 53.1450, "lon": 5.6364, "knmi_station_id": "270"},
    {"naam": "IJlst", "locatie": "IJlst", "lat": 53.0094, "lon": 5.6217, "knmi_station_id": "267"},
    {"naam": "Joure", "locatie": "Joure", "lat": 52.9633, "lon": 5.8042, "knmi_station_id": "267"},
    {"naam": "Buitenpost", "locatie": "Buitenpost", "lat": 53.2536, "lon": 6.1442, "knmi_station_id": "277"},
    {"naam": "Burgum", "locatie": "Burgum", "lat": 53.1922, "lon": 5.9886, "knmi_station_id": "270"},
    {"naam": "Grijpskerk", "locatie": "Grijpskerk", "lat": 53.2625, "lon": 6.3061, "knmi_station_id": "277"},
    {"naam": "It Heidenskip", "locatie": "It Heidenskip", "lat": 52.9606, "lon": 5.4761, "knmi_station_id": "267"},
]
