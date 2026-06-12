# Polsstok Tracker

Persoonlijke web-app voor polsstokverspringen/fierljeppen: sprongen bijhouden per
wedstrijd, automatische winddata en een fysica-gebaseerd theoretisch maximum per sprong.

Opzet en design zijn gelijk aan de **N is 1** app (rood accent in plaats van blauw):
Next.js op Vercel, FastAPI op Railway, Supabase voor login.

## Structuur

```
app/   Next.js frontend (Vercel) — login, swipe-tabs Invullen / Wedstrijden / Statistieken / Instellingen
api/   FastAPI backend (Railway) — profiel, schansen, wedstrijden, pogingen, wind
```

## Lokaal draaien

1. **Supabase**: maak een project op [supabase.com](https://supabase.com)
   (Authentication → Providers → Email aan; e-mailbevestiging uit voor makkelijk testen).
2. **Backend**:
   ```
   cd api
   pip install -e .
   $env:SUPABASE_URL = "https://xxxx.supabase.co"
   $env:SUPABASE_ANON_KEY = "eyJ..."
   uvicorn app.main:app --port 8021
   ```
3. **Frontend**:
   ```
   cd app
   npm install
   # kopieer .env.local.example naar .env.local en vul de Supabase-waarden in
   npm run dev -- -p 3021
   ```
4. Open http://localhost:3021, registreer een account en log in.

## Deploy

### Railway (backend)
- Nieuw project → deploy vanuit deze repo, **root directory `api/`**.
- Environment variables:
  - `SUPABASE_URL` — https://xxxx.supabase.co
  - `SUPABASE_ANON_KEY` — anon key van het Supabase-project
  - `POLSSTOK_DATABASE_URL` — Postgres-URL (bijv. Supabase → Database → Connection string,
    session pooler). Zonder deze variabele gebruikt de API een lokale SQLite-file
    (niet persistent op Railway!).

### Vercel (frontend)
- Nieuw project → importeer deze repo, **root directory `app/`**.
- Environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `POLSSTOK_BACKEND_URL` — de publieke Railway-URL (https://...up.railway.app)

## Roadmap (uit de briefing)

- [x] Fase 1 — Invullen-scherm met live fysica-berekening
- [x] Fase 2 — Wind automatisch ophalen (Open-Meteo; KNMI-station-veld staat klaar)
- [ ] Fase 3 — pbholland.com import (wedstrijden + profiel)
- [ ] Fase 4 — uitgebreidere statistieken
- [ ] Fase 5 — exacte fysica-formules uit de Excel van de gebruiker
