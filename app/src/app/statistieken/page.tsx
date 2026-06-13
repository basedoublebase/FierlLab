"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MapPin, TrendingDown, TrendingUp, Trophy } from "lucide-react";

import { type PbhStatistieken, fetchPbhStatistieken } from "@/lib/api";
import { formatDatum } from "@/lib/date";

function initialen(naam: string): string {
  const delen = naam.trim().split(/\s+/);
  if (delen.length === 0) return "?";
  if (delen.length === 1) return delen[0].slice(0, 2).toUpperCase();
  return (delen[0][0] + delen[delen.length - 1][0]).toUpperCase();
}

export default function StatistiekenPage() {
  const [stats, setStats] = useState<PbhStatistieken | null>(null);
  const [laden, setLaden] = useState(true);
  const [nietGekoppeld, setNietGekoppeld] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let actief = true;
    fetchPbhStatistieken()
      .then((data) => {
        if (actief) setStats(data);
      })
      .catch((e) => {
        if (!actief) return;
        const msg = e instanceof Error ? e.message : "Laden mislukt.";
        if (msg.toLowerCase().includes("gekoppeld")) setNietGekoppeld(true);
        else setFout(msg);
      })
      .finally(() => {
        if (actief) setLaden(false);
      });
    return () => {
      actief = false;
    };
  }, []);

  // PR-verloop grafiek (lopend PR per seizoen).
  const grafiek = useMemo(() => {
    if (!stats || stats.pr_per_seizoen.length === 0) return null;
    const punten = stats.pr_per_seizoen.map((p) => ({ jaar: p.jaar, waarde: p.pr_tot }));
    const W = 600;
    const H = 190;
    const PAD = { l: 34, r: 14, t: 14, b: 40 };
    const waarden = punten.map((p) => p.waarde);
    const min = Math.min(...waarden);
    const max = Math.max(...waarden);
    const span = Math.max(0.5, max - min);
    const x = (i: number) =>
      punten.length === 1 ? (W + PAD.l - PAD.r) / 2 : PAD.l + (i / (punten.length - 1)) * (W - PAD.l - PAD.r);
    const y = (w: number) => PAD.t + (1 - (w - min) / span) * (H - PAD.t - PAD.b);
    const pad = `M ${punten.map((p, i) => `${x(i).toFixed(1)} ${y(p.waarde).toFixed(1)}`).join(" L ")}`;
    // Toon maximaal ~8 jaarlabels zodat het niet overvol wordt.
    const stap = Math.ceil(punten.length / 8);
    return { punten, W, H, PAD, min, max, x, y, pad, stap };
  }, [stats]);

  // Afwijkingsbalken: schaal t.o.v. de grootste waarde.
  const balken = useMemo(() => {
    if (!stats) return null;
    const items = [
      { label: "PR overall", waarde: stats.pr_overall, sterk: true },
      { label: "Seizoensrecord", waarde: stats.seizoensrecord?.afstand ?? null, sterk: false },
      { label: "Gem. uitslag", waarde: stats.gemiddelde_uitslag, sterk: false },
    ].filter((b): b is { label: string; waarde: number; sterk: boolean } => b.waarde !== null);
    if (items.length === 0) return null;
    const maxWaarde = Math.max(...items.map((b) => b.waarde));
    return items.map((b) => ({ ...b, pct: Math.round((b.waarde / maxWaarde) * 100) }));
  }, [stats]);

  if (laden) {
    return (
      <main className="shell">
        <div className="card loading-card">
          <p className="muted">Statistieken laden…</p>
        </div>
      </main>
    );
  }

  if (nietGekoppeld) {
    return (
      <main className="shell">
        <header className="hero">
          <p className="eyebrow">Profiel &amp; cijfers</p>
          <h1>Statistieken</h1>
        </header>
        <div className="card">
          <div className="koppel-leeg">
            <Trophy size={30} />
            <p>
              Koppel je pbholland-profiel om je officiële resultaten, PR-verloop en cijfers per schans te zien.
            </p>
            <Link href="/instellingen" className="primary-button" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", padding: "0 20px" }}>
              Naar Instellingen
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (fout || !stats) {
    return (
      <main className="shell">
        <header className="hero">
          <p className="eyebrow">Profiel &amp; cijfers</p>
          <h1>Statistieken</h1>
        </header>
        <div className="banner error">{fout ?? "Geen data beschikbaar."}</div>
      </main>
    );
  }

  const subtitel = [stats.vereniging, stats.wedstrijdcategorie, stats.rugnummer ? `#${stats.rugnummer}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="shell">
      {/* Profielheader */}
      <section className="card" style={{ marginTop: 0 }}>
        <div className="profiel-head">
          <span className="profiel-avatar">{initialen(stats.naam)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="profiel-naam">{stats.naam}</div>
            {subtitel && <div className="profiel-sub">{subtitel}</div>}
            <div className="profiel-badges">
              {stats.bond && <span className="profiel-badge bond">{stats.bond}{stats.categorie ? ` · ${stats.categorie}` : ""}</span>}
              {stats.ranking !== null && <span className="profiel-badge ranking">Ranking {stats.ranking}</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Kerncijfers */}
      <div className="stat-grid" style={{ marginTop: 14 }}>
        <div className="stat-card">
          <span className="stat-label">Persoonlijk record</span>
          <span className="stat-value">{stats.pr ? `${stats.pr.afstand.toFixed(2)}` : "—"}</span>
          {stats.pr && <span className="stat-sub">{stats.pr.plaats}, {formatDatum(stats.pr.datum)}</span>}
        </div>
        <div className="stat-card">
          <span className="stat-label">Seizoensrecord</span>
          <span className="stat-value">{stats.seizoensrecord ? stats.seizoensrecord.afstand.toFixed(2) : "—"}</span>
          {stats.seizoensrecord?.verschil !== null && stats.seizoensrecord?.verschil !== undefined && (
            <span className={`stat-sub`} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: stats.seizoensrecord.verschil >= 0 ? "var(--success)" : "var(--error)" }}>
              {stats.seizoensrecord.verschil >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {stats.seizoensrecord.verschil >= 0 ? "+" : ""}{stats.seizoensrecord.verschil.toFixed(2)} t.o.v. {stats.seizoensrecord.vorig_jaar}
            </span>
          )}
        </div>
        <div className="stat-card">
          <span className="stat-label">Wedstrijden</span>
          <span className="stat-value">{stats.aantal_wedstrijden}</span>
          {stats.aantal_sprongen !== null && <span className="stat-sub">{stats.aantal_sprongen} sprongen</span>}
        </div>
        <div className="stat-card">
          <span className="stat-label">Dagtitels</span>
          <span className="stat-value">{stats.dagtitels ?? "—"}</span>
          {stats.titels !== null && <span className="stat-sub">{stats.titels} titels</span>}
        </div>
      </div>

      {/* PR-verloop per seizoen */}
      <section className="card">
        <div className="section-header">
          <h2 style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.92rem" }}>PR-verloop per seizoen</h2>
        </div>
        {grafiek ? (
          <svg className="ts-svg" viewBox={`0 0 ${grafiek.W} ${grafiek.H}`} role="img" aria-label="PR-verloop per seizoen">
            {[0, 0.5, 1].map((f) => {
              const waarde = grafiek.min + f * (grafiek.max - grafiek.min);
              const yy = grafiek.y(waarde);
              return (
                <g key={f}>
                  <line className="chart-grid" x1={grafiek.PAD.l} x2={grafiek.W - grafiek.PAD.r} y1={yy} y2={yy} />
                  <text className="chart-tick" x={2} y={yy + 3}>{waarde.toFixed(1)}</text>
                </g>
              );
            })}
            <path className="chart-lijn" d={grafiek.pad} />
            {grafiek.punten.map((p, i) => (
              <circle key={p.jaar} className="chart-point" cx={grafiek.x(i)} cy={grafiek.y(p.waarde)} r={3.4} />
            ))}
            {grafiek.punten.map((p, i) =>
              i % grafiek.stap === 0 || i === grafiek.punten.length - 1 ? (
                <g key={`lbl-${p.jaar}`}>
                  <text className="chart-tick" x={grafiek.x(i)} y={grafiek.H - 22} textAnchor="middle">{p.jaar}</text>
                  <text className="chart-tick" x={grafiek.x(i)} y={grafiek.H - 9} textAnchor="middle" style={{ fontWeight: 700 }}>{p.waarde.toFixed(2)}</text>
                </g>
              ) : null
            )}
          </svg>
        ) : (
          <p className="chart-empty">Nog geen data.</p>
        )}
      </section>

      {/* Beste resultaten per schans */}
      <section className="card">
        <div className="section-header">
          <h2 style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.92rem" }}>Beste resultaten per schans</h2>
        </div>
        {stats.beste_per_schans.length === 0 ? (
          <p className="chart-empty">Nog geen data.</p>
        ) : (
          <div>
            {stats.beste_per_schans.map((s) => (
              <div key={s.plaats} className="schans-rij">
                <MapPin size={15} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                <div className="schans-naam">
                  {s.plaats}
                  <div className="schans-datum">{formatDatum(s.datum)}</div>
                </div>
                <span className="schans-afstand">{s.afstand.toFixed(2)} m</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Gemiddelde afwijking */}
      {balken && (
        <section className="card">
          <div className="section-header">
            <h2 style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.92rem" }}>Gemiddelde afwijking</h2>
          </div>
          {stats.gemiddelde_afwijking !== null && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span className={`afwijking-waarde ${stats.gemiddelde_afwijking >= 0 ? "positief" : "negatief"}`}>
                {stats.gemiddelde_afwijking >= 0 ? "+" : ""}{stats.gemiddelde_afwijking.toFixed(2)}
              </span>
              <span className="muted" style={{ fontSize: "0.85rem" }}>t.o.v. beste poging per wedstrijd</span>
            </div>
          )}
          {balken.map((b) => (
            <div key={b.label} className="balk-rij">
              <span className="balk-label">{b.label}</span>
              <span className="balk-spoor">
                <span className={`balk-vul${b.sterk ? " sterk" : ""}`} style={{ width: `${b.pct}%` }} />
              </span>
              <span className="balk-getal">{b.waarde.toFixed(2)}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
