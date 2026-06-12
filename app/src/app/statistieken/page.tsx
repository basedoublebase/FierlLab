"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";

import { type Profiel, type Wedstrijd, fetchProfiel, fetchWedstrijden } from "@/lib/api";
import { formatDatum, seizoenVan } from "@/lib/date";

type Sprongpunt = {
  datum: string;
  afstand: number;
  schans: string;
};

export default function StatistiekenPage() {
  const [profiel, setProfiel] = useState<Profiel | null>(null);
  const [wedstrijden, setWedstrijden] = useState<Wedstrijd[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [seizoen, setSeizoen] = useState<number | null>(null);

  useEffect(() => {
    let actief = true;
    Promise.all([fetchProfiel(), fetchWedstrijden()])
      .then(([p, w]) => {
        if (!actief) return;
        setProfiel(p);
        setWedstrijden(w);
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

  // Alle geldige sprongen, oplopend op datum.
  const sprongen = useMemo<Sprongpunt[]>(() => {
    const punten: Sprongpunt[] = [];
    for (const w of wedstrijden) {
      for (const p of w.pogingen) {
        if ((p.afstand_m ?? 0) > 0) {
          punten.push({ datum: w.datum, afstand: p.afstand_m as number, schans: w.schans.naam });
        }
      }
    }
    return punten.sort((a, b) => a.datum.localeCompare(b.datum));
  }, [wedstrijden]);

  const seizoenen = useMemo(
    () => Array.from(new Set(sprongen.map((s) => seizoenVan(s.datum)))).sort((a, b) => b - a),
    [sprongen]
  );

  const zichtbaar = useMemo(
    () => (seizoen === null ? sprongen : sprongen.filter((s) => seizoenVan(s.datum) === seizoen)),
    [sprongen, seizoen]
  );

  const stats = useMemo(() => {
    if (zichtbaar.length === 0) return null;
    const afstanden = zichtbaar.map((s) => s.afstand);
    const beste = Math.max(...afstanden);
    const gemiddelde = afstanden.reduce((a, b) => a + b, 0) / afstanden.length;
    const wedstrijdenMet = new Set(
      (seizoen === null ? wedstrijden : wedstrijden.filter((w) => seizoenVan(w.datum) === seizoen)).map(
        (w) => w.id
      )
    ).size;
    return {
      beste,
      gemiddelde: Math.round(gemiddelde * 100) / 100,
      wedstrijden: wedstrijdenMet,
      sprongen: zichtbaar.length,
    };
  }, [zichtbaar, wedstrijden, seizoen]);

  // PR over alle data (niet gefilterd).
  const pr = useMemo(() => {
    let bestePunt: Sprongpunt | null = null;
    for (const s of sprongen) {
      if (bestePunt === null || s.afstand > bestePunt.afstand) bestePunt = s;
    }
    return bestePunt;
  }, [sprongen]);

  // Simpele SVG-lijngrafiek: beste sprong per wedstrijddatum.
  const grafiek = useMemo(() => {
    const perDatum = new Map<string, number>();
    for (const s of zichtbaar) {
      const huidige = perDatum.get(s.datum);
      if (huidige === undefined || s.afstand > huidige) perDatum.set(s.datum, s.afstand);
    }
    const punten = Array.from(perDatum.entries())
      .map(([datum, afstand]) => ({ datum, afstand }))
      .sort((a, b) => a.datum.localeCompare(b.datum));
    if (punten.length === 0) return null;

    const W = 600;
    const H = 180;
    const PAD = { l: 34, r: 10, t: 12, b: 22 };
    const min = Math.min(...punten.map((p) => p.afstand));
    const max = Math.max(...punten.map((p) => p.afstand));
    const span = Math.max(0.5, max - min);
    const x = (i: number) =>
      punten.length === 1
        ? (W + PAD.l - PAD.r) / 2
        : PAD.l + (i / (punten.length - 1)) * (W - PAD.l - PAD.r);
    const y = (afstand: number) => PAD.t + (1 - (afstand - min) / span) * (H - PAD.t - PAD.b);
    const pad = `M ${punten.map((p, i) => `${x(i).toFixed(1)} ${y(p.afstand).toFixed(1)}`).join(" L ")}`;
    return { punten, W, H, PAD, min, max, x, y, pad };
  }, [zichtbaar]);

  if (laden) {
    return (
      <main className="shell">
        <div className="card loading-card">
          <p className="muted">Laden…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Profiel &amp; cijfers</p>
        <h1>Statistieken</h1>
      </header>

      {fout && <div className="banner error">{fout}</div>}

      {/* PR-kaart */}
      {pr && (
        <div className="stat-grid" style={{ marginTop: 14 }}>
          <div className="stat-card pr-card" style={{ gridColumn: "1 / -1" }}>
            <Trophy size={34} className="pr-icoon" />
            <div>
              <div className="pr-waarde">{pr.afstand.toFixed(2)} m</div>
              <div className="pr-label">
                Persoonlijk record · {pr.schans}, {formatDatum(pr.datum)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Seizoensfilter */}
      <div className="ts-chips" style={{ marginTop: 8 }}>
        <button
          type="button"
          className={`ts-chip${seizoen === null ? " active" : ""}`}
          onClick={() => setSeizoen(null)}
        >
          All-time
        </button>
        {seizoenen.map((jaar) => (
          <button
            key={jaar}
            type="button"
            className={`ts-chip${seizoen === jaar ? " active" : ""}`}
            onClick={() => setSeizoen(jaar)}
          >
            {jaar}
          </button>
        ))}
      </div>

      {/* Statistieken */}
      {stats ? (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">Beste</span>
            <span className="stat-value">{stats.beste.toFixed(2)} m</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Gemiddelde</span>
            <span className="stat-value">{stats.gemiddelde.toFixed(2)} m</span>
            <span className="stat-sub">van geldige sprongen</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Wedstrijden</span>
            <span className="stat-value">{stats.wedstrijden}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Geldige sprongen</span>
            <span className="stat-value">{stats.sprongen}</span>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted">
            Nog geen geldige sprongen{seizoen !== null ? ` in ${seizoen}` : ""}. Vul je eerste wedstrijd in
            op het Invullen-scherm.
          </p>
        </div>
      )}

      {/* Grafiek */}
      <section className="card">
        <div className="section-header">
          <h2>Afstand over tijd</h2>
          <p className="muted">Beste geldige sprong per wedstrijd.</p>
        </div>
        {grafiek ? (
          <>
            <svg
              className="ts-svg"
              viewBox={`0 0 ${grafiek.W} ${grafiek.H}`}
              role="img"
              aria-label="Sprongafstand over tijd"
            >
              {[0, 0.5, 1].map((f) => {
                const waarde = grafiek.min + f * (grafiek.max - grafiek.min);
                const yy = grafiek.y(waarde);
                return (
                  <g key={f}>
                    <line className="chart-grid" x1={grafiek.PAD.l} x2={grafiek.W - grafiek.PAD.r} y1={yy} y2={yy} />
                    <text className="chart-tick" x={2} y={yy + 3}>
                      {waarde.toFixed(1)}
                    </text>
                  </g>
                );
              })}
              <path className="chart-lijn" d={grafiek.pad} />
              {grafiek.punten.map((p, i) => (
                <circle key={p.datum} className="chart-point" cx={grafiek.x(i)} cy={grafiek.y(p.afstand)} r={3.2} />
              ))}
              <text className="chart-tick" x={grafiek.PAD.l} y={grafiek.H - 6}>
                {formatDatum(grafiek.punten[0].datum)}
              </text>
              <text
                className="chart-tick"
                x={grafiek.W - grafiek.PAD.r}
                y={grafiek.H - 6}
                textAnchor="end"
              >
                {formatDatum(grafiek.punten[grafiek.punten.length - 1].datum)}
              </text>
            </svg>
          </>
        ) : (
          <p className="chart-empty">Nog geen data voor de grafiek.</p>
        )}
      </section>

      {/* Profiel */}
      {profiel && (
        <section className="card">
          <div className="section-header">
            <h2>Springersprofiel</h2>
            <p className="muted">Deze waarden voeden het fysica-model. Aanpassen kan bij Instellingen.</p>
          </div>
          <div className="metrics-grid">
            <div className="metric-cell">
              <span className="metric-label">Naam</span>
              <span className="metric-value">{profiel.naam || "—"}</span>
            </div>
            <div className="metric-cell">
              <span className="metric-label">Geboortejaar</span>
              <span className="metric-value">{profiel.geboortejaar ?? "—"}</span>
            </div>
            <div className="metric-cell">
              <span className="metric-label">Gewicht</span>
              <span className="metric-value">{profiel.massa_kg} kg</span>
            </div>
            <div className="metric-cell">
              <span className="metric-label">Stoklengte</span>
              <span className="metric-value">{profiel.stoklengte_m} m</span>
            </div>
            <div className="metric-cell">
              <span className="metric-label">Gestrekt</span>
              <span className="metric-value">{profiel.springer_gestrekt_m} m</span>
            </div>
            <div className="metric-cell">
              <span className="metric-label">Uitsprongstoot</span>
              <span className="metric-value">{profiel.uitsprongstoot_ns} Ns</span>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
