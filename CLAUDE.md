# FierlLab

Web-app voor fierljeppers/polsstokverspringers om sprong-resultaten bij te houden,
gecombineerd met winddata en een fysica-gebaseerd theoretisch maximum per sprong.

De opzet, layout en feel zijn bewust identiek aan de **N is 1** app
(`C:\Users\Bascv\Desktop\projecten\nis1`), maar met een **rood** accent in plaats van blauw.

## Architectuur (zelfde als nis1)

```
app/   Next.js (App Router) + TypeScript  → Vercel
       - Supabase auth (login/register, middleware redirect)
       - API-routes proxyen naar de backend met Bearer token (app/src/app/api/_lib/backend.ts)
       - Swipe-navigatie tussen hoofdtabs (app/src/app/_components/swipe-nav.tsx)
api/   FastAPI + SQLAlchemy (Python)      → Railway
       - Supabase tokenverificatie (api/app/auth.py), user auto-aanmaak bij eerste login
       - SQLite lokaal, Postgres (Supabase) in productie via FIERLLAB_DATABASE_URL
       - Tabellen worden bij startup aangemaakt (create_all in api/app/startup.py)
```

## Schermen (hoofdtabs, swipe-volgorde)

1. `/` **Invullen** — live wedstrijdinvoer: wedstrijd selecteren/aanmaken, pogingen
   invullen (stok op, afstand), wind automatisch ophalen, live fysica-berekening
   per poging + samenvattingskaart.
2. `/wedstrijden` — tegeloverzicht van eigen wedstrijden (datum, locatie, beste sprong,
   geldige pogingen, wind), filters op seizoen/schans, tap → detail met alle pogingen.
3. `/statistieken` — persoonsprofiel, PR, grafiek afstand over tijd (seizoen/alltime),
   gemiddelde/beste/aantallen.
4. `/instellingen` — profiel bewerken, schansen beheren (CRUD), uitloggen.

## Fysica

`app/src/lib/fysica.ts` — **exacte port van de Excel van de gebruiker**
(VoorBas_volledig.xlsx, Blad1). Twee passes: (1) hoek-sweep 90°→1° die de optimale
uitspronghoek vindt door de balistische afstand (slingerenergie uit PEtop/Inertia +
afzetimpuls) te maximaliseren; (2) tijdstap-integratie (dt=0.02s) met luchtweerstand
vanaf het uitsprongpunt tot de landing op het zandbed. Gevalideerd tegen de
spreadsheet: stok_op=10.5, massa_springer=88, L=13.25, impuls=40, schans 4.0/1.7 →
begin stok 5.16 m, hoek 44°, totaal 19.85 m (exacte match).

Inputs: stok_op (per sprong, handmatig), massa_springer/stoklengte/uitsprongstoot/
springer_gestrekt (uit Profiel), waterdiepte/schanshoogte (schans, nu defaults),
massa_polsstok=20 + snelheid_overgaan=0 + CW=1 + Effopp=0.15 (constanten). Op de
wedstrijd-detailpagina wordt het theoretisch max berekend zodra stok_op is ingevuld.

## Winddata

Het briefing-document noemt KNMI Data Platform, maar dat levert NetCDF-bestanden en
vereist een API-key. Voor nu gebruikt de backend **Open-Meteo** (gratis, geen key,
gebruikt KNMI-model voor NL): `api/app/services/wind.py`. Schansen hebben lat/lon.
KNMI-station-id staat al op het Schans-model voor een latere echte KNMI-integratie.

## pbholland.com

Statistieken-integratie is live (`api/app/services/pbholland.py`). Een gebruiker
koppelt zijn profiel in Instellingen door de pbholland-profiel-URL te plakken; daaruit
halen we `id_persoon` (+ naam). De scraper haalt twee pagina's op:
- `persooninfo?id_persoon=...` → profielvelden + het interne `id_springer`
- `resultatenlijst_springer?id_springer=...` → alle wedstrijden + losse sprongen

Daaruit worden PR, seizoensrecord, PR-verloop per seizoen, beste per schans en
gemiddelden afgeleid (endpoints `/pbholland/preview` en `/pbholland/statistieken`,
in-memory gecachet, 10 min). De Statistieken-pagina draait hier volledig op.

**Let op:** `id_persoon` (op het Profiel als `pbholland_id`) ≠ `id_springer` (intern,
wordt live uit de persoonspagina geparsed). Wedstrijd heeft `pbholland_wedstrijd_id`
voor latere resultaat-import.

## Lokaal draaien

```
# Backend (poort 8021) — uvicorn staat niet in PATH, gebruik python -m
cd api && pip install -e . && python -m uvicorn app.main:app --port 8021

# Frontend (poort 3021)
cd app && npm install && npm run dev -- -p 3021
```

Env vars — `app/.env.local` (bestaat al, met echte waarden):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key)
- `FIERLLAB_BACKEND_URL` (default http://127.0.0.1:8021)

Env vars — backend:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (tokenverificatie; publishable key werkt)
- `FIERLLAB_DATABASE_URL` (default sqlite:///./fierllab.db)

Supabase-project: qvxmodatqusfhppznhub (e-mailbevestiging staat uit).

## Deploy

- **Railway**: root = `api/`, ziet Procfile/nixpacks.toml. Zet SUPABASE_URL,
  SUPABASE_ANON_KEY en FIERLLAB_DATABASE_URL (Supabase Postgres pooler-URL).
- **Vercel**: root = `app/`. Zet NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
  en FIERLLAB_BACKEND_URL (Railway-URL).

## Design-richtlijnen

- globals.css is overgenomen van nis1; accent is rood (`--accent: #d70015`).
- Herbruik de bestaande classes (.card, .text-input, .primary-button, .choice-button,
  .tegel, .banner, .auth-card) — geen nieuwe design-taal introduceren.
- Alle UI-teksten in het Nederlands.
