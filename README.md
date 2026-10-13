# FierlLab

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

Vereist: Python 3.11 of hoger (zie `api/pyproject.toml`) en Node.js.

1. **Backend** — voer dit uit vanuit de repositorymap.

   PowerShell:
   ```powershell
   cd api
   pip install -e .
   $env:SUPABASE_URL = "<jouw waarde>"
   $env:SUPABASE_ANON_KEY = "<jouw waarde>"
   python -m uvicorn app.main:app --port 8021
   ```
   bash/zsh:
   ```sh
   cd api
   pip install -e .
   export SUPABASE_URL="<jouw waarde>"
   export SUPABASE_ANON_KEY="<jouw waarde>"
   python -m uvicorn app.main:app --port 8021
   ```
2. **Frontend** — open een tweede terminal vanuit de repositorymap:
   ```sh
   cd app
   npm install
   npm run dev -- -p 3021
   ```
   De frontend draait op poort 3021 en verwacht de backend op poort 8021.
   Open daarna http://localhost:3021. Zet frontendvariabelen in `app/.env.local`; zie [`app/.env.local.example`](app/.env.local.example).

Omgevingsvariabelen (alleen namen; vul je eigen waarden in):
| Onderdeel | Variabele | Verplicht | Doel |
| --- | --- | --- | --- |
| Backend | `SUPABASE_URL` | Ja, voor tokenverificatie | Supabase Auth-URL. |
| Backend | `SUPABASE_ANON_KEY` | Ja, voor tokenverificatie | Supabase Auth-verzoek. |
| Backend | `FIERLLAB_DATABASE_URL` | Nee | Database-URL; standaard `sqlite:///./fierllab.db`. |
| Frontend | `NEXT_PUBLIC_SUPABASE_URL` | Ja | Supabase-client en server-auth. |
| Frontend | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ja | Supabase-client en server-auth. |
| Frontend | `FIERLLAB_BACKEND_URL` | Nee | Backend-URL; standaard `http://127.0.0.1:8021`. |

## Deploy

### Railway (backend)
- Nieuw project → deploy vanuit deze repo, **root directory `api/`**.
- Environment variables:
  - `SUPABASE_URL` — https://xxxx.supabase.co
  - `SUPABASE_ANON_KEY` — publishable key van het Supabase-project
  - `FIERLLAB_DATABASE_URL` — Postgres-URL (bijv. Supabase → Database → Connection string,
    session pooler). Zonder deze variabele gebruikt de API een lokale SQLite-file
    (niet persistent op Railway!).

### Vercel (frontend)
- Nieuw project → importeer deze repo, **root directory `app/`**.
- Environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `FIERLLAB_BACKEND_URL` — de publieke Railway-URL (https://...up.railway.app)

## Roadmap (uit de briefing)

- [x] Fase 1 — Invullen-scherm met live fysica-berekening
- [x] Fase 2 — Wind automatisch ophalen (Open-Meteo; KNMI-station-veld staat klaar)
- [ ] Fase 3 — pbholland.com import (wedstrijden + profiel)
- [ ] Fase 4 — uitgebreidere statistieken
- [ ] Fase 5 — exacte fysica-formules uit de Excel van de gebruiker

## Tests en controles

Voer de commando's vanuit `app/` uit. `app/package.json` bevat geen `test`-script,
dus `npm test` kan daar niet als tests-script worden uitgevoerd. Het script
`typecheck` voert `tsc --noEmit` uit:

- Tests: `npm test` (script ontbreekt momenteel)
- Typecontrole: `npm run typecheck`
