# AGENTS.md — FierlLab

## Doel

FierlLab is een web-app voor fierljeppers/polsstokverspringers om sprongresultaten bij te
houden, met automatische winddata en een fysica-gebaseerd theoretisch maximum. Gebouwd
voor de gebruiker die deze taken aanmeldt; gelijkenis met de N-is-1-app.

## Mappenstructuur

```
app/                   Next.js frontend (App Router, TypeScript) → Vercel
app/src/app/           Pagina's: /, /wedstrijden, /statistieken, /instellingen, login, register
app/src/app/api/       API-routes (proxy naar backend)
app/src/app/_components/  UI-componenten (nav, swipe-nav)
app/src/lib/           Utilities: fysica.ts, date.ts, supabase.ts, api.ts
app/public/            Statische bestanden (icon.svg)
api/                   FastAPI backend (Python 3.11+, SQLAlchemy) → Railway
api/app/               Pakket 'app'
api/app/routes/        Routers: profiel, schansen, wedstrijden, wind
api/app/models/        SQLAlchemy-modellen: profiel, schans, wedstrijd, user
api/app/schemas/       Pydantic-schemas: profiel, schans, wedstrijd
api/app/services/      Businesslogic: wind.py (Open-Meteo)
api/app/seeds/         Seed-data: schansen
api/app/db.py          Database-opzet (Base, engine)
api/app/auth.py        Supabase tokenverificatie
api/app/startup.py     Startup-lifespan, create_all
api/app/main.py        FastAPI-app, CORS, health-endpoint
api/pyproject.toml     Dependencies (FastAPI, SQLAlchemy, Pydantic, uvicorn, psycopg2, httpx)
```

## Testen

Geen tests gevonden. De repo bevat geen testbestanden (`pytest`, `unittest`, Jest,
of andere testrunners).

## Uitrollen

Railway (backend, root `api/`): Procfile en nixpacks.toml aanwezig.
Omgevingsvariabelen: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FIERLLAB_DATABASE_URL`
(Postgres via Supabase pooler; zonder waarde: lokale SQLite, niet persistent).

Vercel (frontend, root `app/`): next.config.js aanwezig.
Omgevingsvariabelen: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`FIERLLAB_BACKEND_URL` (publieke Railway-URL).

Lokaal: `cd api && pip install -e . && python -m uvicorn app.main:app --port 8021`
en `cd app && npm install && npm run dev -- -p 3021`.

## Conventies

- UI-teksten in het Nederlands.
- Code en importen in het Engels.
- TypeScript (App Router): paginapagina's in `src/app/`, API-routes in
  `src/app/api/`. Componenten in `src/app/_components/`, utilities in `src/lib/`.
- Python: type hints met `from __future__ import annotations`, `Mapped`/`mapped_column`
  van SQLAlchemy 2.0, Pydantic v2-schemas in `api/app/schemas/`.
- Design-classes uit globals.css: `.card`, `.text-input`, `.primary-button`,
  `.choice-button`, `.tegel`, `.banner`, `.auth-card`. Accent-kleur rood
  (`--accent: #d70015`).
- Navigatie: swipe-tabs tussen hoofdtabs (`swipe-nav.tsx`).

## Valkuilen

- Geen tests: wijzigingen aan de fysica-berekening (`app/src/lib/fysica.ts`) of
  backend-modellen niet valideren zonder handmatig testen.
- `fysica.ts` bevat een bekende onnauwkeurigheid (kalibratiepunt uit de briefing
  wordt niet gereproduceerd); vervanging door de exacte Excel-formules is gepland.
- De backend gebruikt SQLite lokaal maar Postgres in productie; schema-verschillen
  kunnen optreden. `FIERLLAB_DATABASE_URL` is vereist voor persistentie op Railway.
- De frontend proxyert API-aanroepen via `src/app/api/_lib/backend.ts` met een
  Bearer token; wijzigingen aan backend-routes moeten hier synced zijn.
- Supabase-tokenverificatie gebeurt in de backend (`api/app/auth.py`); de user wordt
  automatisch aangemaakt bij eerste login.
