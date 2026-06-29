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

# Coördinaten per schanslocatie (dorpskern volstaat voor de wind-lookup).
# Gebruikt om bij een pbholland-sprong het dichtstbijzijnde KNMI-station te kiezen.
PLAATS_COORDS: dict[str, tuple[float, float]] = {
    "Polsbroekerdam": (52.0014, 4.8244),
    "Vlist": (51.9706, 4.7964),
    "Linschoten": (52.0639, 4.9131),
    "Jaarsveld": (51.9772, 4.9344),
    "Zegveld": (52.1136, 4.8358),
    "Kockengen": (52.1283, 4.9469),
    "Winsum": (53.1450, 5.6364),
    "IJlst": (53.0094, 5.6217),
    "Joure": (52.9633, 5.8042),
    "Buitenpost": (53.2536, 6.1442),
    "Burgum": (53.1922, 5.9886),
    "Grijpskerk": (53.2625, 6.3061),
    "It Heidenskip": (52.9606, 5.4761),
}


def coords_voor_plaats(plaats: str) -> tuple[float, float] | None:
    return PLAATS_COORDS.get(plaats.strip())


# Oriëntatie/springrichting per schans, in graden t.o.v. het noorden,
# gemeten van achterkant naar voorkant schans (de richting waarin je springt).
SCHANS_ORIENTATIE: dict[str, float] = {
    "Linschoten": 138,
    "Vlist": 199,
    "Kockengen": 71,
    "Jaarsveld": 48,
    "Zegveld": 42,
    "Polsbroekerdam": 339,
}


def windtype(windrichting_graden: float | None, plaats: str) -> dict | None:
    """Bepaal rug-/tegen-/zijwind t.o.v. de springrichting van de schans.

    windrichting_graden = richting waar de wind VANDAAN komt (KNMI-conventie).
    """
    orientatie = SCHANS_ORIENTATIE.get(plaats.strip())
    if orientatie is None or windrichting_graden is None:
        return None
    verschil = (windrichting_graden - orientatie) % 360
    if verschil <= 45 or verschil >= 315:
        soort = "tegenwind"  # wind komt van voren (uit de springrichting)
    elif 135 <= verschil <= 225:
        soort = "rugwind"  # wind komt van achteren
    else:
        soort = "zijwind"
    return {"soort": soort, "orientatie_graden": orientatie}
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
        wid = re.search(r"id_wedstrijd=(\d+)", rij)
        resultaten.append(
            {
                "datum": datum.isoformat(),
                "plaats": cellen[1],
                "wedstrijd": cellen[2],
                "categorie": cellen[3] if len(cellen) > 3 else "",
                "verste_afstand": verste,
                "sprongen": sprongen,
                "id_wedstrijd": int(wid.group(1)) if wid else None,
                "plaats_finale": cellen[6] if len(cellen) > 6 and cellen[6] else None,
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


_klassement_cache: dict[int, tuple[list[dict], float]] = {}


def haal_klassement(id_persoon: int, naam_hint: str | None = None) -> list[dict]:
    """Klassement per seizoen (positie + totaalscore in het Algemeen Klassement)."""
    cached = _klassement_cache.get(id_persoon)
    if cached is not None and cached[1] > time.monotonic():
        return cached[0]

    persoon = _haal(f"{BASE}/persooninfo/?id_persoon={id_persoon}")
    profiel = parse_profiel(persoon)
    rijen: list[dict] = []
    if profiel["id_springer"]:
        pagina = _haal(f"{BASE}/springer_klassementen/?id_springer={profiel['id_springer']}")
        m = re.search(r'<table id="nfb_data">(.*?)</table>', pagina, re.S)
        if m:
            jaar_huidig = None
            for rij in re.findall(r"<tr>(.*?)</tr>", m.group(1), re.S):
                cellen = _rij_cellen(rij)
                if len(cellen) < 5 or cellen[0].lower() == "jaar":
                    continue
                if cellen[0].strip():
                    jaar_huidig = cellen[0].strip()
                if "algemeen klassement" not in cellen[1].lower():
                    continue
                if jaar_huidig is None or not jaar_huidig.isdigit():
                    continue
                positie = _eerste_getal(cellen[3])
                totaal = _eerste_getal(cellen[4])
                rijen.append({
                    "jaar": int(jaar_huidig),
                    "positie": int(positie) if positie is not None else None,
                    "totaal": round(totaal, 2) if totaal is not None else None,
                })

    if len(_klassement_cache) > 200:
        _klassement_cache.clear()
    _klassement_cache[id_persoon] = (rijen, time.monotonic() + _CACHE_TTL)
    return rijen


_MAANDEN = {
    "januari": 1, "februari": 2, "maart": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "augustus": 8, "september": 9, "oktober": 10, "november": 11, "december": 12,
}


def _parse_nl_datum(tekst: str) -> str | None:
    """'za, 20 juni 2026' → '2026-06-20'."""
    m = re.search(r"(\d{1,2})\s+([a-z]+)\s+(\d{4})", tekst.lower())
    if not m:
        return None
    dag, maandnaam, jaar = int(m.group(1)), m.group(2), int(m.group(3))
    maand = _MAANDEN.get(maandnaam)
    if maand is None:
        return None
    try:
        return date(jaar, maand, dag).isoformat()
    except ValueError:
        return None


_aankomend_cache: dict[int, tuple[list[dict], float]] = {}


def haal_aankomend(id_persoon: int, naam_hint: str | None = None) -> list[dict]:
    """Aankomende wedstrijden waarvoor de springer is aangemeld."""
    cached = _aankomend_cache.get(id_persoon)
    if cached is not None and cached[1] > time.monotonic():
        return cached[0]

    persoon = _haal(f"{BASE}/persooninfo/?id_persoon={id_persoon}")
    profiel = parse_profiel(persoon)
    aankomend: list[dict] = []
    if profiel["id_springer"]:
        pagina = _haal(f"{BASE}/springer_aangemeldvoorwedstrijden/?id_springer={profiel['id_springer']}")
        idx = pagina.find('id="nfb_data"')
        seg = pagina[idx:] if idx != -1 else pagina
        seg = seg[: seg.find("</table>") + 8] if "</table>" in seg else seg
        for rij in re.findall(r"<tr>(.*?)</tr>", seg, re.S):
            cellen = _rij_cellen(rij)
            if len(cellen) < 5 or cellen[1].lower() == "datum":
                continue
            datum = _parse_nl_datum(cellen[1])
            if datum is None:
                continue
            wid = re.search(r"id_wedstrijd=(\d+)", rij)
            aankomend.append({
                "id_wedstrijd": int(wid.group(1)) if wid else None,
                "datum": datum,
                "tijd": cellen[2] or None,
                "plaats": cellen[3],
                "wedstrijd": cellen[4],
            })

    if len(_aankomend_cache) > 200:
        _aankomend_cache.clear()
    _aankomend_cache[id_persoon] = (aankomend, time.monotonic() + _CACHE_TTL)
    return aankomend


# ── Wedstrijden-overzicht + detail per wedstrijd ──────────────────────────

_wedstrijden_cache: dict[int, tuple[dict, float]] = {}
_detail_cache: dict[tuple[int, int], tuple[dict, float]] = {}


def haal_wedstrijden(id_persoon: int, naam_hint: str | None = None) -> dict:
    """Lichte wedstrijdenlijst voor de Wedstrijden-pagina (uit de resultatenlijst)."""
    cached = _wedstrijden_cache.get(id_persoon)
    if cached is not None and cached[1] > time.monotonic():
        return cached[0]

    persoon_pagina = _haal(f"{BASE}/persooninfo/?id_persoon={id_persoon}")
    profiel = parse_profiel(persoon_pagina)
    if not profiel["naam"] and naam_hint:
        profiel["naam"] = naam_hint.replace("_", " ")

    wedstrijden: list[dict] = []
    if profiel["id_springer"]:
        res_pagina = _haal(f"{BASE}/resultatenlijst_springer/?id_springer={profiel['id_springer']}")
        for r in parse_resultaten(res_pagina, profiel["naam"]):
            geldige = [s for s in r["sprongen"] if s > 0]
            wedstrijden.append(
                {
                    "id_wedstrijd": r["id_wedstrijd"],
                    "datum": r["datum"],
                    "plaats": r["plaats"],
                    "wedstrijd": r["wedstrijd"],
                    "categorie": r["categorie"],
                    "verste_afstand": r["verste_afstand"],
                    "plaats_finale": r["plaats_finale"],
                    "aantal_sprongen": len(r["sprongen"]),
                    "gemiddelde": round(sum(geldige) / len(geldige), 2) if geldige else None,
                }
            )

    payload = {
        "naam": profiel["naam"],
        "id_persoon": id_persoon,
        "id_springer": profiel["id_springer"],
        "profiel": profiel,
        "wedstrijden": wedstrijden,
    }
    if len(_wedstrijden_cache) > 200:
        _wedstrijden_cache.clear()
    _wedstrijden_cache[id_persoon] = (payload, time.monotonic() + _CACHE_TTL)
    return payload


def parse_meetgegevens(pagina: str) -> dict:
    """Tijd, geldigheid, afwijking en landingsplaats uit een meetgegevens-pagina."""
    velden: dict[str, str] = {}
    for rij in re.findall(r"<tr>(.*?)</tr>", pagina, re.S):
        cellen = _rij_cellen(rij)
        if len(cellen) >= 2 and cellen[0]:
            velden[cellen[0].lower()] = cellen[1]
    return {
        "tijd": velden.get("tijd"),
        "geldig": velden.get("geldig"),
        "sprong": velden.get("sprong"),
        "afwijking": _eerste_getal(velden.get("afwijking", "")),
        "landingsplaats": _eerste_getal(velden.get("landingsplaats", "")),
    }


def _attempt_label(index: int) -> str:
    # Eerste 3 = voorronde, daarna finale (zelfde indeling als pbholland).
    return f"Poging {index + 1}" if index < 3 else f"Finale {index - 2}"


# Mediaan tussentijd tussen opeenvolgende sprongen (uit data-analyse: ~20 min).
_STAP_MINUTEN = 20


def _schat_ontbrekende_tijden(pogingen: list[dict]) -> None:
    """Schat de tijd van sprongen zonder digitale meting, op basis van de wél
    gemeten sprongen in dezelfde wedstrijd (interpoleren / extrapoleren)."""
    from datetime import datetime, timedelta

    bekend: dict[int, datetime] = {}
    for i, p in enumerate(pogingen):
        if p["tijd"]:
            try:
                bekend[i] = datetime.strptime(p["tijd"], "%H:%M:%S")
            except ValueError:
                pass
    if not bekend:
        return  # geen ankerpunt → niet te schatten

    idxs = sorted(bekend)
    for i, p in enumerate(pogingen):
        if p["tijd"] or p["afstand"] is None:
            continue  # exacte tijd, of niet gesprongen
        voor = [k for k in idxs if k < i]
        na = [k for k in idxs if k > i]
        if voor and na:
            a, b = voor[-1], na[0]
            geschat = bekend[a] + (bekend[b] - bekend[a]) * ((i - a) / (b - a))
        elif voor:
            a = voor[-1]
            geschat = bekend[a] + timedelta(minutes=_STAP_MINUTEN * (i - a))
        else:
            b = na[0]
            geschat = bekend[b] - timedelta(minutes=_STAP_MINUTEN * (b - i))
        p["tijd_schatting"] = geschat.strftime("%H:%M:%S")


def haal_wedstrijd_detail(id_wedstrijd: int, id_persoon: int) -> dict:
    """Volledige sprongtabel van één wedstrijd voor deze springer.

    uitslaginfo levert de pogingen + (waar elektronisch gemeten) een
    id_meetgegevens per poging; die detailpagina geeft tijd/afwijking/landingsplaats.
    """
    cache_key = (id_wedstrijd, id_persoon)
    cached = _detail_cache.get(cache_key)
    if cached is not None and cached[1] > time.monotonic():
        return cached[0]

    pagina = _haal(f"{BASE}/uitslaginfo/?id_wedstrijd={id_wedstrijd}")
    pos = pagina.find(f"id_persoon={id_persoon}")
    if pos == -1:
        raise KeyError("Springer niet in deze uitslag gevonden.")
    rstart = pagina.rfind("<tr", 0, pos)
    rend = pagina.find("</tr>", pos)
    rij = pagina[rstart:rend]

    # Cellen mét hun eventuele meetgegevens-link.
    cel_htmls = re.findall(r"<td[^>]*>(.*?)</td>", rij, re.S)
    cellen = [_strip(c) for c in cel_htmls]
    positie = cellen[0] if cellen else None
    # Cel 0=positie, 1=naam, 2=type, 3=verste, 4+=pogingen.
    pogingen = []
    for i, ch in enumerate(cel_htmls[4:]):
        afstand = _eerste_getal(_strip(ch))
        mg = re.search(r"id_meetgegevens=(\d+)", ch)
        poging = {
            "label": _attempt_label(i),
            "afstand": afstand if (afstand and afstand > 0) else None,
            "geldig": bool(afstand and afstand > 0),
            "id_meetgegevens": int(mg.group(1)) if mg else None,
            "tijd": None,
            "tijd_schatting": None,
            "afwijking": None,
            "landingsplaats": None,
        }
        if poging["id_meetgegevens"]:
            try:
                meet = parse_meetgegevens(_haal(f"{BASE}/digitalemeetgegevens_info/?id_meetgegevens={poging['id_meetgegevens']}"))
                poging["tijd"] = meet["tijd"]
                poging["afwijking"] = meet["afwijking"]
                poging["landingsplaats"] = meet["landingsplaats"]
                if meet["geldig"]:
                    poging["geldig"] = meet["geldig"].lower() in ("ok", "geldig", "ja")
            except (httpx.HTTPError, KeyError):
                pass
        pogingen.append(poging)

    # Lege staart-pogingen (niet gesprongen) weglaten.
    while pogingen and pogingen[-1]["afstand"] is None and pogingen[-1]["id_meetgegevens"] is None:
        pogingen.pop()

    _schat_ontbrekende_tijden(pogingen)

    geldige = [p["afstand"] for p in pogingen if p["afstand"]]
    payload = {
        "id_wedstrijd": id_wedstrijd,
        "positie": positie,
        "beste": max(geldige) if geldige else None,
        "gemiddelde": round(sum(geldige) / len(geldige), 2) if geldige else None,
        "pogingen": pogingen,
    }
    if len(_detail_cache) > 400:
        _detail_cache.clear()
    _detail_cache[cache_key] = (payload, time.monotonic() + _CACHE_TTL)
    return payload


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
