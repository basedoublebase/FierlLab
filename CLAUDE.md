# Polsstok Tracker

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
       - SQLite lokaal, Postgres (Supabase) in productie via POLSSTOK_DATABASE_URL
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

`app/src/lib/fysica.ts` — gekalibreerde approximatie (pendulum + uitsprongstoot).
Kalibratiepunt: stok_op=11.70, stoklengte=13.25, waterdiepte=1.70, schanshoogte=4.00,
massa=76.1, stoot=120Ns, gestrekt=2.25 → totaal 21.93 m, begin stok 6.33 m, hoek 47°.
**TODO:** vervangen door exacte Excel-formules zodra de gebruiker die deelt.

## Winddata

Het briefing-document noemt KNMI Data Platform, maar dat levert NetCDF-bestanden en
vereist een API-key. Voor nu gebruikt de backend **Open-Meteo** (gratis, geen key,
gebruikt KNMI-model voor NL): `api/app/services/wind.py`. Schansen hebben lat/lon.
KNMI-station-id staat al op het Schans-model voor een latere echte KNMI-integratie.

## pbholland.com

Nog niet geïntegreerd (Fase 3). Profiel heeft al `pbholland_id`, Wedstrijd heeft
`pbholland_wedstrijd_id` zodat import later kan koppelen.

## Lokaal draaien

```
# Backend (poort 8021)
cd api && pip install -e . && uvicorn app.main:app --port 8021

# Frontend (poort 3021)
cd app && npm install && npm run dev -- -p 3021
```

Env vars — `app/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase project)
- `POLSSTOK_BACKEND_URL` (default http://127.0.0.1:8021)

Env vars — backend:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (tokenverificatie)
- `POLSSTOK_DATABASE_URL` (default sqlite:///./polsstok.db)

## Deploy

- **Railway**: root = `api/`, ziet Procfile/nixpacks.toml. Zet SUPABASE_URL,
  SUPABASE_ANON_KEY en POLSSTOK_DATABASE_URL (Supabase Postgres pooler-URL).
- **Vercel**: root = `app/`. Zet NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
  en POLSSTOK_BACKEND_URL (Railway-URL).

## Design-richtlijnen

- globals.css is overgenomen van nis1; accent is rood (`--accent: #d70015`).
- Herbruik de bestaande classes (.card, .text-input, .primary-button, .choice-button,
  .exp-card-achtige tegels, .banner, .auth-card) — geen nieuwe design-taal introduceren.
- Alle UI-teksten in het Nederlands.
