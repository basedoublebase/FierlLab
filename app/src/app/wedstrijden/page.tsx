"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Flag, MapPin, Wind } from "lucide-react";

import { type Wedstrijd, fetchWedstrijden } from "@/lib/api";
import { formatDatum, seizoenVan } from "@/lib/date";

function besteAfstand(wedstrijd: Wedstrijd): number | null {
  const geldig = wedstrijd.pogingen.filter((p) => (p.afstand_m ?? 0) > 0);
  if (geldig.length === 0) return null;
  return Math.max(...geldig.map((p) => p.afstand_m as number));
}

function gemiddeldeWind(wedstrijd: Wedstrijd): number | null {
  const metWind = wedstrijd.pogingen.filter((p) => p.wind_ms !== null);
  if (metWind.length === 0) return null;
  const som = metWind.reduce((a, p) => a + (p.wind_ms as number), 0);
  return Math.round((som / metWind.length) * 10) / 10;
}

export default function WedstrijdenPage() {
  const [wedstrijden, setWedstrijden] = useState<Wedstrijd[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [seizoen, setSeizoen] = useState<number | null>(null);
  const [schansFilter, setSchansFilter] = useState<number | null>(null);

  useEffect(() => {
    let actief = true;
    fetchWedstrijden()
      .then((data) => {
        if (actief) setWedstrijden(data);
      })
      .catch((e) => {
        if (actief) setFout(e instanceof Error ? e.message : "Laden mislukt.");
      })
      .finally(() => {
        if (actief) setLaden(false);
      });
    return () => {
      actief = false;
    };
  }, []);

  const seizoenen = useMemo(
    () => Array.from(new Set(wedstrijden.map((w) => seizoenVan(w.datum)))).sort((a, b) => b - a),
    [wedstrijden]
  );

  const schansen = useMemo(() => {
    const map = new Map<number, string>();
    for (const w of wedstrijden) map.set(w.schans.id, w.schans.naam);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [wedstrijden]);

  const gefilterd = useMemo(
    () =>
      wedstrijden.filter(
        (w) =>
          (seizoen === null || seizoenVan(w.datum) === seizoen) &&
          (schansFilter === null || w.schans.id === schansFilter)
      ),
    [wedstrijden, seizoen, schansFilter]
  );

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Overzicht</p>
        <h1>Wedstrijden</h1>
      </header>

      {fout && <div className="banner error">{fout}</div>}

      <div className="tegel-toolbar">
        <div className="tegel-filters">
          <button
            type="button"
            className={`tegel-filter${seizoen === null ? " active" : ""}`}
            onClick={() => setSeizoen(null)}
          >
            Alle seizoenen
          </button>
          {seizoenen.map((jaar) => (
            <button
              key={jaar}
              type="button"
              className={`tegel-filter${seizoen === jaar ? " active" : ""}`}
              onClick={() => setSeizoen(seizoen === jaar ? null : jaar)}
            >
              {jaar}
            </button>
          ))}
        </div>
        {schansen.length > 1 && (
          <div className="tegel-filters">
            <button
              type="button"
              className={`tegel-filter${schansFilter === null ? " active" : ""}`}
              onClick={() => setSchansFilter(null)}
            >
              Alle schansen
            </button>
            {schansen.map(([id, naam]) => (
              <button
                key={id}
                type="button"
                className={`tegel-filter${schansFilter === id ? " active" : ""}`}
                onClick={() => setSchansFilter(schansFilter === id ? null : id)}
              >
                {naam}
              </button>
            ))}
          </div>
        )}
      </div>

      {laden ? (
        <div className="card loading-card">
          <p className="muted">Laden…</p>
        </div>
      ) : gefilterd.length === 0 ? (
        <div className="tegel-empty">
          <Flag size={28} />
          <p>
            {wedstrijden.length === 0
              ? "Nog geen wedstrijden. Maak je eerste wedstrijd aan op het Invullen-scherm."
              : "Geen wedstrijden binnen dit filter."}
          </p>
        </div>
      ) : (
        <div className="tegel-grid">
          {gefilterd.map((w) => {
            const beste = besteAfstand(w);
            const geldig = w.pogingen.filter((p) => (p.afstand_m ?? 0) > 0).length;
            const wind = gemiddeldeWind(w);
            return (
              <Link key={w.id} href={`/wedstrijden/${w.id}`} className="tegel">
                <div className="tegel-top">
                  <span className="tegel-icon">
                    <Flag size={16} />
                  </span>
                  <span className="status-pill">{w.categorie}</span>
                  <span className="tegel-datum">
                    <CalendarDays size={12} style={{ verticalAlign: "-2px" }} /> {formatDatum(w.datum)}
                  </span>
                </div>
                <h3 className="tegel-naam">{w.schans.naam}</h3>
                <div>
                  <span className="tegel-beste">{beste !== null ? `${beste.toFixed(2)} m` : "—"}</span>
                  <div className="tegel-beste-sub">beste sprong</div>
                </div>
                <div className="tegel-meta">
                  <span className="tegel-meta-item">
                    <MapPin size={13} /> {w.schans.locatie || w.schans.naam}
                  </span>
                  <span className="tegel-meta-item">
                    {geldig} geldige {geldig === 1 ? "poging" : "pogingen"}
                  </span>
                  {wind !== null && (
                    <span className="tegel-meta-item">
                      <Wind size={13} /> {wind} m/s
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
