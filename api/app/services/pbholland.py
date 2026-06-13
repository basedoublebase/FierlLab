"""Scraper voor pbholland.com persoonsdata.

Twee bronpagina's (allebei een geëmbedde NFB-tabel met id="nfb_data"):
- persooninfo?id_persoon=...  → profielvelden + het interne id_springer
- resultatenlijst_springer?id_springer=...  → alle wedstrijden + sprongen

We scrapen on-demand (geen bulk), met een korte in-memory cache zodat snel
achter elkaar laden van de Statistieken-pagina niet steeds opnieuw fetcht.
Respecteer de bron: één profiel = max twee HTTP-requests.
"""
from __future__ import annotations

import html
import re
import time
from datetime import date

import httpx

BASE = "https://www.pbholland.com/index.php"
_HEADERS = {"User-Agent": "FierlLab/1.0 (persoonlijke sprongtracker)"}
_TIMEOUT = 20

# In-memory cache: id_persoon -> (payload, vervaltijd)
_CACHE_TTL = 600  # seconden
_cache: dict[int, tuple[dict, float]] = {}


def _strip(tekst: str) -> str:
    """HTML-tags weg, entities decoderen, witruimte normaliseren."""
    zonder = re.sub(r"<[^>]+>", " ", tekst)
    return re.sub(r"\s+", " ", html.unescape(zonder)).strip()


def _eerste_getal(tekst: str) -> float | None:
    m = re.search(r"-?\d+[.,]?\d*", tekst.replace(",", "."))
    return float(m.group()) if m else None


def _haal(url: str) -> str:
    resp = httpx.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


def _rij_cellen(rij_html: str) -> list[str]:
    return [_strip(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", rij_html, re.S)]


def parse_profiel(pagina: str) -> dict:
    """Profielvelden + id_springer uit een persooninfo-pagina."""
    spr = re.search(r"id_springer=(\d+)", pagina)
    id_springer = int(spr.group(1)) if spr else None

    # Loop door de rijen; headerrijen (<th>) leveren labels voor de volgende datarij.
    rijen = re.findall(r"<tr>(.*?)</tr>", pagina, re.S)
    velden: dict[str, str] = {}
    huidige_labels: list[str] = []
    for rij in rijen:
        ths = [_strip(c) for c in re.findall(r"<th[^>]*>(.*?)</th>", rij, re.S)]
        tds = [c for c in re.findall(r"<td[^>]*>(.*?)</td>", rij, re.S)]
        if ths:
            huidige_labels = ths
            continue
        if tds and huidige_labels:
            for label, waarde in zip(huidige_labels, tds):
                velden[label.lower()] = waarde
            huidige_labels = []

    def veld(*namen: str) -> str:
        for n in namen:
            for label, waarde in velden.items():
                if n in label:
                    return _strip(waarde)
        return ""

    pr_overall = None
    pr_ruw = veld("pers.record", "persoonlijk")
    if pr_ruw:
        pr_overall = _eerste_getal(pr_ruw)

    return {
        "id_springer": id_springer,
        "naam": veld("naam") or "",
        "bond": veld("bond"),
        "vereniging": veld("vereniging"),
        "woonplaats": veld("woonplaats"),
        "categorie": veld("categorie") if "categorie" in velden else "",
        "wedstrijdcategorie": veld("wedstrijdcategorie"),
        "rugnummer": veld("rugnummer"),
        "aantal_wedstrijden": _eerste_getal(veld("aantal wedstrijden")),
        "aantal_sprongen": _eerste_getal(veld("aantal sprongen")),
        "aantal_meters": _eerste_getal(veld("aantal meters")),
        "ranking": _eerste_getal(veld("ranking")),
        "titels": _eerste_getal(veld("titels")),
        "dagtitels": _eerste_getal(veld("dagtitels")),
        "pr_overall": pr_overall,
        "seizoensrecord_bron": _eerste_getal(veld("seiz. record", "seizoen")),
    }


def parse_resultaten(pagina: str, naam: str) -> list[dict]:
    """Alle wedstrijden uit de 'Resultatenlijst <naam>'-tabel."""
    idx = pagina.find(f"Resultatenlijst {naam}")
    if idx == -1:
        idx = pagina.find("Resultatenlijst")
    if idx == -1:
        return []
    seg = pagina[idx:]
    tstart = seg.find("<table")
    if tstart == -1:
        return []
    seg = seg[tstart:]
    seg = seg[: seg.find("</table>")]

    rijen = re.findall(r"<tr>(.*?)</tr>", seg, re.S)
    resultaten: list[dict] = []
    for rij in rijen:
        cellen = _rij_cellen(rij)
        if len(cellen) < 5 or cellen[0].lower() == "datum":
            continue
        datum = _parse_datum(cellen[0])
        if datum is None:
            continue
        verste = _eerste_getal(cellen[4]) if len(cellen) > 4 else None
        # Sprongen: de cellen ná 'Plaats na finale' (index 7+).
        sprongen = []
        for c in cellen[7:]:
            g = _eerste_getal(c)
            if g is not None:
                sprongen.append(g)
        resultaten.append(
            {
                "datum": datum.isoformat(),
                "plaats": cellen[1],
                "wedstrijd": cellen[2],
                "categorie": cellen[3] if len(cellen) > 3 else "",
                "verste_afstand": verste,
                "sprongen": sprongen,
            }
        )
    return resultaten


def _parse_datum(tekst: str) -> date | None:
    m = re.search(r"(\d{2})-(\d{2})-(\d{4})", tekst)
    if not m:
        return None
    dag, maand, jaar = (int(x) for x in m.groups())
    try:
        return date(jaar, maand, dag)
    except ValueError:
        return None


def _statistieken(profiel: dict, resultaten: list[dict]) -> dict:
    geldige = [r for r in resultaten if (r["verste_afstand"] or 0) > 0]

    # PR = verste geldige sprong ooit, met datum + plaats.
    pr = None
    if geldige:
        beste = max(geldige, key=lambda r: r["verste_afstand"])
        pr = {"afstand": beste["verste_afstand"], "datum": beste["datum"], "plaats": beste["plaats"]}

    # Beste per seizoen (jaar) + lopend PR-verloop.
    per_jaar: dict[int, float] = {}
    for r in geldige:
        jaar = int(r["datum"][:4])
        per_jaar[jaar] = max(per_jaar.get(jaar, 0), r["verste_afstand"])
    jaren = sorted(per_jaar)
    pr_per_seizoen = []
    lopend = 0.0
    for jaar in jaren:
        lopend = max(lopend, per_jaar[jaar])
        pr_per_seizoen.append({"jaar": jaar, "seizoensbeste": round(per_jaar[jaar], 2), "pr_tot": round(lopend, 2)})

    # Seizoensrecord = beste van het laatste jaar; verschil t.o.v. het jaar ervoor.
    seizoensrecord = None
    if jaren:
        laatste = jaren[-1]
        vorige = jaren[-2] if len(jaren) > 1 else None
        verschil = round(per_jaar[laatste] - per_jaar[vorige], 2) if vorige is not None else None
        seizoensrecord = {"afstand": round(per_jaar[laatste], 2), "jaar": laatste, "verschil": verschil, "vorig_jaar": vorige}

    # Beste resultaat per schans (gesorteerd op afstand, top 6).
    per_schans: dict[str, dict] = {}
    for r in geldige:
        h = per_schans.get(r["plaats"])
        if h is None or r["verste_afstand"] > h["afstand"]:
            per_schans[r["plaats"]] = {"plaats": r["plaats"], "afstand": r["verste_afstand"], "datum": r["datum"]}
    beste_per_schans = sorted(per_schans.values(), key=lambda x: x["afstand"], reverse=True)[:6]

    # Gemiddelde uitslag = gem. verste afstand over geldige wedstrijden.
    gem_uitslag = round(sum(r["verste_afstand"] for r in geldige) / len(geldige), 2) if geldige else None

    # Gemiddelde afwijking per poging t.o.v. de beste poging van die wedstrijd.
    afwijkingen: list[float] = []
    for r in resultaten:
        sprongen = [s for s in r["sprongen"] if s > 0]
        if len(sprongen) >= 1:
            beste_dag = max(sprongen)
            afwijkingen.extend(s - beste_dag for s in sprongen)
    gem_afwijking = round(sum(afwijkingen) / len(afwijkingen), 2) if afwijkingen else None

    return {
        "naam": profiel["naam"],
        "vereniging": profiel["vereniging"],
        "woonplaats": profiel["woonplaats"],
        "categorie": profiel["categorie"],
        "wedstrijdcategorie": profiel["wedstrijdcategorie"],
        "rugnummer": profiel["rugnummer"],
        "bond": profiel["bond"],
        "ranking": profiel["ranking"],
        "titels": profiel["titels"],
        "dagtitels": profiel["dagtitels"],
        "pr_overall": profiel["pr_overall"],
        "aantal_wedstrijden": int(profiel["aantal_wedstrijden"]) if profiel["aantal_wedstrijden"] else len(resultaten),
        "aantal_sprongen": int(profiel["aantal_sprongen"]) if profiel["aantal_sprongen"] else None,
        "pr": pr,
        "seizoensrecord": seizoensrecord,
        "pr_per_seizoen": pr_per_seizoen,
        "beste_per_schans": beste_per_schans,
        "gemiddelde_uitslag": gem_uitslag,
        "gemiddelde_afwijking": gem_afwijking,
    }


def haal_statistieken(id_persoon: int, naam_hint: str | None = None) -> dict:
    """Volledige Statistieken-payload voor één persoon (gecachet)."""
    cached = _cache.get(id_persoon)
    if cached is not None and cached[1] > time.monotonic():
        return cached[0]

    persoon_pagina = _haal(f"{BASE}/persooninfo/?id_persoon={id_persoon}")
    profiel = parse_profiel(persoon_pagina)
    if not profiel["naam"] and naam_hint:
        profiel["naam"] = naam_hint.replace("_", " ")

    resultaten: list[dict] = []
    if profiel["id_springer"]:
        res_pagina = _haal(f"{BASE}/resultatenlijst_springer/?id_springer={profiel['id_springer']}")
        resultaten = parse_resultaten(res_pagina, profiel["naam"])

    payload = _statistieken(profiel, resultaten)
    payload["id_persoon"] = id_persoon
    payload["id_springer"] = profiel["id_springer"]

    if len(_cache) > 200:
        _cache.clear()
    _cache[id_persoon] = (payload, time.monotonic() + _CACHE_TTL)
    return payload
