"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Filter, LineChart, MapPin, Trophy } from "lucide-react";

import { type PbhSprongPunt, type PbhWedstrijd, fetchPbhSprongen, fetchPbhWedstrijden } from "@/lib/api";
import { formatDatum, seizoenVan } from "@/lib/date";

export default function WedstrijdenPage() {
  const [lijst, setLijst] = useState<PbhWedstrijd[]>([]);
  const [sprongen, setSprongen] = useState<PbhSprongPunt[]>([]);
  const [laden, setLaden] = useState(true);
  const [nietGekoppeld, setNietGekoppeld] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const [categorie, setCategorie] = useState("alle");
  const [schans, setSchans] = useState("alle");
  const [seizoen, setSeizoen] = useState("alle");
  const [grafiekOpen, setGrafiekOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const actiefFilter = categorie !== "alle" || schans !== "alle" || seizoen !== "alle";

  useEffect(() => {
    let actief = true;
    Promise.all([fetchPbhWedstrijden(), fetchPbhSprongen().catch(() => [])])
      .then(([data, sp]) => {
        if (!actief) return;
        setLijst(data.wedstrijden);
        setSprongen(sp);
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

  const categorieen = useMemo(
    () => Array.from(new Set(lijst.map((w) => w.categorie).filter(Boolean))).sort(),
    [lijst]
  );
  const schansen = useMemo(
    () => Array.from(new Set(lijst.map((w) => w.plaats).filter(Boolean))).sort(),
    [lijst]
  );
  const seizoenen = useMemo(
    () => Array.from(new Set(lijst.map((w) => seizoenVan(w.datum)))).sort((a, b) => b - a),
    [lijst]
  );

  const gefilterd = useMemo(
    () =>
      lijst.filter(
        (w) =>
          (categorie === "alle" || w.categorie === categorie) &&
          (schans === "alle" || w.plaats === schans) &&
          (seizoen === "alle" || String(seizoenVan(w.datum)) === seizoen)
      ),
    [lijst, categorie, schans, seizoen]
  );

  // Scatter: stok op (x) vs afstand (y), met dezelfde filters als het overzicht.
  const scatter = useMemo(() => {
    const punten = sprongen.filter(
      (s) =>
        (categorie === "alle" || s.categorie === categorie) &&
        (schans === "alle" || s.plaats === schans) &&
        (seizoen === "alle" || (s.datum != null && String(seizoenVan(s.datum)) === seizoen))
    );
    if (punten.length === 0) return null;
    const W = 600;
    const H = 320;
    const PAD = { l: 46, r: 16, t: 16, b: 40 };
    const xs = punten.map((p) => p.stok_op_m);
    const ys = punten.map((p) => p.afstand);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xSpan = Math.max(0.5, xMax - xMin);
    const ySpan = Math.max(0.5, yMax - yMin);
    const px = (v: number) => PAD.l + ((v - xMin) / xSpan) * (W - PAD.l - PAD.r);
    const py = (v: number) => PAD.t + (1 - (v - yMin) / ySpan) * (H - PAD.t - PAD.b);

    // Trendlijn via kleinste-kwadraten (alleen zinvol bij >=2 punten met spreiding in x).
    let trend: { x1: number; y1: number; x2: number; y2: number } | null = null;
    const n = punten.length;
    if (n >= 2) {
      const sx = xs.reduce((a, b) => a + b, 0);
      const sy = ys.reduce((a, b) => a + b, 0);
      const sxx = xs.reduce((a, b) => a + b * b, 0);
      const sxy = punten.reduce((a, p) => a + p.stok_op_m * p.afstand, 0);
      const noemer = n * sxx - sx * sx;
      if (noemer !== 0) {
        const helling = (n * sxy - sx * sy) / noemer;
        const intercept = (sy - helling * sx) / n;
        trend = {
          x1: px(xMin),
          y1: py(helling * xMin + intercept),
          x2: px(xMax),
          y2: py(helling * xMax + intercept),
        };
      }
    }
    return { punten, W, H, PAD, xMin, xMax, yMin, yMax, px, py, trend };
  }, [sprongen, categorie, schans, seizoen]);

  if (laden) {
    return (
      <main className="shell">
        <div className="card loading-card">
          <p className="muted">Wedstrijden laden…</p>
        </div>
      </main>
    );
  }

  if (nietGekoppeld) {
    return (
      <main className="shell">
        <header className="hero">
          <p className="eyebrow">Overzicht</p>
          <h1>Wedstrijden</h1>
        </header>
        <div className="card">
          <div className="koppel-leeg">
            <Trophy size={30} />
            <p>Koppel je pbholland-profiel om je wedstrijden en sprongen te zien.</p>
            <Link
              href="/instellingen"
              className="primary-button"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", padding: "0 20px" }}
            >
              Naar Instellingen
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="hero hero-met-knop">
        <div>
          <p className="eyebrow">Overzicht</p>
          <h1>Wedstrijden</h1>
        </div>
        <div className="filter-wrap">
          <button
            type="button"
            className={`filter-knop${actiefFilter ? " actief" : ""}`}
            onClick={() => setFiltersOpen((o) => !o)}
            aria-label="Filters"
            aria-expanded={filtersOpen}
          >
            <Filter size={18} />
            {actiefFilter && <span className="filter-dot" />}
          </button>
          {filtersOpen && (
            <>
              <div className="filter-backdrop" onClick={() => setFiltersOpen(false)} />
              <div className="filter-popover">
                <div className="filter-popover-titel">
                  <span>Filters</span>
                  {actiefFilter && (
                    <button
                      type="button"
                      className="filter-reset"
                      onClick={() => { setCategorie("alle"); setSchans("alle"); setSeizoen("alle"); }}
                    >
                      Wissen
                    </button>
                  )}
                </div>
                <select className="text-input" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                  <option value="alle">Alle categorieën</option>
                  {categorieen.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select className="text-input" value={schans} onChange={(e) => setSchans(e.target.value)}>
                  <option value="alle">Alle schansen</option>
                  {schansen.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select className="text-input" value={seizoen} onChange={(e) => setSeizoen(e.target.value)}>
                  <option value="alle">Alle seizoenen</option>
                  {seizoenen.map((j) => (
                    <option key={j} value={String(j)}>{j}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </header>

      {fout && <div className="banner error">{fout}</div>}

      {/* Uitklapbare grafiek: stok op vs afstand */}
      <section className="card wed-kaart">
        <button
          type="button"
          className="wed-kop"
          onClick={() => setGrafiekOpen((o) => !o)}
          aria-expanded={grafiekOpen}
        >
          <span className="tegel-icon"><LineChart size={16} /></span>
          <div className="wed-kop-tekst">
            <div className="wed-naam" style={{ fontSize: "1rem" }}>Stok op vs. afstand</div>
            <span className="wed-plaats">{sprongen.length > 0 ? "sprongen met ingevulde stok op" : "nog geen stok-op ingevuld"}</span>
          </div>
          <ChevronDown size={18} className={`wed-chevron${grafiekOpen ? " open" : ""}`} />
        </button>
        {grafiekOpen && (
          <div className="wed-body">
            {scatter ? (
              <>
                <svg className="ts-svg" style={{ height: "auto" }} viewBox={`0 0 ${scatter.W} ${scatter.H}`} role="img" aria-label="Stok op versus afstand">
                  {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                    const yy = scatter.PAD.t + f * (scatter.H - scatter.PAD.t - scatter.PAD.b);
                    const waarde = scatter.yMax - f * (scatter.yMax - scatter.yMin);
                    return (
                      <g key={`y${f}`}>
                        <line className="chart-grid" x1={scatter.PAD.l} x2={scatter.W - scatter.PAD.r} y1={yy} y2={yy} />
                        <text className="chart-tick" x={2} y={yy + 3}>{waarde.toFixed(1)}</text>
                      </g>
                    );
                  })}
                  {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                    const xx = scatter.PAD.l + f * (scatter.W - scatter.PAD.l - scatter.PAD.r);
                    const waarde = scatter.xMin + f * (scatter.xMax - scatter.xMin);
                    return (
                      <text key={`x${f}`} className="chart-tick" x={xx} y={scatter.H - 24} textAnchor="middle">{waarde.toFixed(1)}</text>
                    );
                  })}
                  {scatter.trend && (
                    <line className="chart-trend" x1={scatter.trend.x1} y1={scatter.trend.y1} x2={scatter.trend.x2} y2={scatter.trend.y2} />
                  )}
                  {scatter.punten.map((p, i) => (
                    <circle key={i} className="chart-point" cx={scatter.px(p.stok_op_m)} cy={scatter.py(p.afstand)} r={4} />
                  ))}
                  <text className="chart-tick" x={scatter.W / 2} y={scatter.H - 6} textAnchor="middle">stok op (m)</text>
                  <text className="chart-tick" x={-(scatter.H / 2)} y={12} textAnchor="middle" transform="rotate(-90)">afstand (m)</text>
                </svg>
                <p className="muted" style={{ fontSize: "0.74rem", marginTop: 6 }}>
                  {scatter.punten.length} sprongen · alleen met ingevulde stok op · volgt de filters hierboven
                </p>
              </>
            ) : (
              <p className="chart-empty">
                Geen sprongen met ingevulde stok op binnen dit filter. Vul stok op in bij een wedstrijd om punten te zien.
              </p>
            )}
          </div>
        )}
      </section>

      {gefilterd.length === 0 ? (
        <div className="tegel-empty">
          <Trophy size={28} />
          <p>Geen wedstrijden binnen dit filter.</p>
        </div>
      ) : (
        gefilterd.map((w) =>
          w.id_wedstrijd === null ? (
            <article key={`${w.datum}-${w.plaats}`} className="card wed-kaart">
              <div className="wed-kop" style={{ cursor: "default" }}>
                <div className="wed-kop-tekst">
                  <div className="wed-datum">{formatDatum(w.datum)}</div>
                  <div className="wed-naam">{w.wedstrijd || w.plaats}</div>
                  <span className="wed-plaats"><MapPin size={13} /> {w.plaats}</span>
                </div>
                <div className="wed-kop-rechts">
                  <span className="status-pill">{w.categorie}{w.plaats_finale ? ` · ${w.plaats_finale}e` : ""}</span>
                  {w.verste_afstand !== null && <span className="schans-afstand">{w.verste_afstand.toFixed(2)} m</span>}
                </div>
              </div>
            </article>
          ) : (
            <Link key={w.id_wedstrijd} href={`/wedstrijden/${w.id_wedstrijd}`} className="card wed-kaart wed-link">
              <div className="wed-kop">
                <div className="wed-kop-tekst">
                  <div className="wed-datum">{formatDatum(w.datum)}</div>
                  <div className="wed-naam">{w.wedstrijd || w.plaats}</div>
                  <span className="wed-plaats"><MapPin size={13} /> {w.plaats}</span>
                </div>
                <div className="wed-kop-rechts">
                  <span className="status-pill">{w.categorie}{w.plaats_finale ? ` · ${w.plaats_finale}e` : ""}</span>
                  {w.verste_afstand !== null && <span className="schans-afstand">{w.verste_afstand.toFixed(2)} m</span>}
                </div>
                <ChevronRight size={18} className="wed-chevron" />
              </div>
            </Link>
          )
        )
      )}
    </main>
  );
}
