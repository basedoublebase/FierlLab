"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Filter, LineChart, MapPin, Trophy } from "lucide-react";

import { type PbhSprongPunt, type PbhWedstrijd, fetchPbhSprongen, fetchPbhWedstrijden } from "@/lib/api";
import { formatDatum, seizoenVan } from "@/lib/date";
import { netteAs } from "@/lib/grafiek";

// t-waarde (tweezijdig 95%) per vrijheidsgraden, voor het betrouwbaarheidsinterval.
function tWaarde(df: number): number {
  const tabel: Record<number, number> = {
    1: 12.71, 2: 4.3, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31,
    9: 2.26, 10: 2.23, 11: 2.2, 12: 2.18, 13: 2.16, 14: 2.14, 15: 2.13,
    20: 2.09, 30: 2.04,
  };
  if (df <= 0) return 12.71;
  if (tabel[df]) return tabel[df];
  if (df < 20) return tabel[15];
  if (df < 30) return tabel[20];
  return 1.98;
}

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
    const H = 340;
    const PAD = { l: 58, r: 18, t: 18, b: 56 };

    // Regressie over een subset (kleinste kwadraten).
    type Reg = { helling: number; intercept: number };
    const regressie = (idx: number[]): Reg | null => {
      const m = idx.length;
      if (m < 2) return null;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const i of idx) {
        sx += punten[i].stok_op_m; sy += punten[i].afstand;
        sxx += punten[i].stok_op_m ** 2; sxy += punten[i].stok_op_m * punten[i].afstand;
      }
      const noemer = m * sxx - sx * sx;
      if (noemer === 0) return null;
      const helling = (m * sxy - sx * sy) / noemer;
      return { helling, intercept: (sy - helling * sx) / m };
    };

    // Iteratieve uitschieterverwijdering: residu < -2σ (alleen naar beneden).
    let geldigIdx = punten.map((_, i) => i);
    let reg = regressie(geldigIdx);
    const verwijderd = new Set<number>();
    if (reg && punten.length >= 5) {
      for (let iter = 0; iter < 20; iter++) {
        const r = reg as Reg;
        const res = geldigIdx.map((i) => punten[i].afstand - (r.helling * punten[i].stok_op_m + r.intercept));
        const gem = res.reduce((a, b) => a + b, 0) / res.length;
        const sigma = Math.sqrt(res.reduce((a, b) => a + (b - gem) ** 2, 0) / res.length);
        if (sigma === 0) break;
        const drempel = gem - 2 * sigma;
        const blijft = geldigIdx.filter((i) => punten[i].afstand - (r.helling * punten[i].stok_op_m + r.intercept) >= drempel);
        if (blijft.length === geldigIdx.length || blijft.length < 2) break;
        geldigIdx.forEach((i) => { if (!blijft.includes(i)) verwijderd.add(i); });
        geldigIdx = blijft;
        reg = regressie(geldigIdx);
      }
    }

    // As-domein strak om álle punten (incl. uitschieters), met nette stappen.
    const xs = punten.map((p) => p.stok_op_m);
    const ys = punten.map((p) => p.afstand);
    const asX = netteAs(Math.min(...xs), Math.max(...xs));
    const asY = netteAs(Math.min(...ys), Math.max(...ys));
    const px = (v: number) => PAD.l + ((v - asX.domMin) / (asX.domMax - asX.domMin)) * (W - PAD.l - PAD.r);
    const py = (v: number) => PAD.t + (1 - (v - asY.domMin) / (asY.domMax - asY.domMin)) * (H - PAD.t - PAD.b);

    // Statistiek + betrouwbaarheidsband op de geldige sprongen (geen extrapolatie).
    let lijn: { punten: { x: number; y: number }[]; band: string | null } | null = null;
    let r2: number | null = null;
    let n = geldigIdx.length;
    if (reg && n >= 2) {
      const gx = geldigIdx.map((i) => punten[i].stok_op_m);
      const gy = geldigIdx.map((i) => punten[i].afstand);
      const xGem = gx.reduce((a, b) => a + b, 0) / n;
      const yGem = gy.reduce((a, b) => a + b, 0) / n;
      const sxx = gx.reduce((a, b) => a + (b - xGem) ** 2, 0);
      const sse = gy.reduce((a, y, k) => a + (y - (reg!.helling * gx[k] + reg!.intercept)) ** 2, 0);
      const sst = gy.reduce((a, y) => a + (y - yGem) ** 2, 0);
      r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : null;
      const xLo = Math.min(...gx), xHi = Math.max(...gx);
      const s = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
      const t = tWaarde(n - 2);
      const stappen = 24;
      const lijnPunten: { x: number; y: number }[] = [];
      const boven: [number, number][] = [];
      const onder: [number, number][] = [];
      for (let k = 0; k <= stappen; k++) {
        const x = xLo + ((xHi - xLo) * k) / stappen;
        const yhat = reg.helling * x + reg.intercept;
        lijnPunten.push({ x, y: yhat });
        if (s > 0 && sxx > 0) {
          const se = s * Math.sqrt(1 / n + (x - xGem) ** 2 / sxx);
          boven.push([px(x), py(yhat + t * se)]);
          onder.push([px(x), py(yhat - t * se)]);
        }
      }
      let band: string | null = null;
      if (boven.length) {
        band =
          `M ${boven.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join(" L ")}` +
          ` L ${onder.reverse().map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join(" L ")} Z`;
      }
      lijn = { punten: lijnPunten, band };
    }
    const zwak = n < 8 || (r2 != null && r2 < 0.3);

    return { punten, W, H, PAD, asX, asY, px, py, verwijderd, lijn, r2, n, zwak, geldigIdx };
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
            <span className="wed-plaats">verband tussen stokzetting en sprongafstand</span>
          </div>
          <ChevronDown size={18} className={`wed-chevron${grafiekOpen ? " open" : ""}`} />
        </button>
        {grafiekOpen && (
          <div className="wed-body">
            {scatter ? (
              <>
                <svg className="ts-svg" style={{ height: "auto" }} viewBox={`0 0 ${scatter.W} ${scatter.H}`} role="img" aria-label="Stok op versus afstand">
                  {/* Y: nette gridlijnen + labels */}
                  {scatter.asY.ticks.map((t) => (
                    <g key={`y${t}`}>
                      <line className="chart-grid" x1={scatter.PAD.l} x2={scatter.W - scatter.PAD.r} y1={scatter.py(t)} y2={scatter.py(t)} />
                      <text className="chart-tick" x={scatter.PAD.l - 8} y={scatter.py(t) + 4} textAnchor="end">{t.toFixed(scatter.asY.decimalen)}</text>
                    </g>
                  ))}
                  {/* X: nette labels (lichte gridlijnen) */}
                  {scatter.asX.ticks.map((t) => (
                    <g key={`x${t}`}>
                      <line className="chart-grid" x1={scatter.px(t)} x2={scatter.px(t)} y1={scatter.PAD.t} y2={scatter.H - scatter.PAD.b} style={{ opacity: 0.3 }} />
                      <text className="chart-tick" x={scatter.px(t)} y={scatter.H - scatter.PAD.b + 18} textAnchor="middle">{t.toFixed(scatter.asX.decimalen)}</text>
                    </g>
                  ))}
                  {/* 95%-betrouwbaarheidsband + trendlijn (alleen over databereik) */}
                  {scatter.lijn?.band && <path className="chart-band" d={scatter.lijn.band} />}
                  {scatter.lijn && (
                    <polyline
                      className="chart-trend"
                      points={scatter.lijn.punten.map((p) => `${scatter.px(p.x).toFixed(1)},${scatter.py(p.y).toFixed(1)}`).join(" ")}
                    />
                  )}
                  {scatter.punten.map((p, i) => {
                    const cx = scatter.px(p.stok_op_m);
                    const cy = scatter.py(p.afstand);
                    if (scatter.verwijderd.has(i)) {
                      return (
                        <g key={i} className="chart-kruis">
                          <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} />
                          <line x1={cx - 5} y1={cy + 5} x2={cx + 5} y2={cy - 5} />
                        </g>
                      );
                    }
                    return <circle key={i} className="scatter-point" cx={cx} cy={cy} r={4.5} />;
                  })}
                  <text className="chart-astitel" x={(scatter.PAD.l + scatter.W - scatter.PAD.r) / 2} y={scatter.H - 6} textAnchor="middle">Stok op (m)</text>
                  <text className="chart-astitel" x={-(scatter.PAD.t + scatter.H - scatter.PAD.b) / 2} y={16} textAnchor="middle" transform="rotate(-90)">Afstand (m)</text>
                </svg>
                <div className="chart-legenda">
                  <span><span className="legenda-stip" /> Geldige sprong</span>
                  {scatter.verwijderd.size > 0 && (
                    <span><span className="legenda-kruis">✕</span> Uitschieter (buiten trend)</span>
                  )}
                  {scatter.lijn && <span><span className="legenda-lijn" /> Trend ± 95%</span>}
                </div>
                <p className="muted" style={{ fontSize: "0.78rem", marginTop: 8, lineHeight: 1.5 }}>
                  Elk punt is een sprong met ingevulde stok op; hoe hoger de stok-op, hoe verder de sprong.{" "}
                  <strong>n = {scatter.n}</strong>
                  {scatter.r2 != null && <> · R² = {scatter.r2.toFixed(2)}</>}
                  {scatter.verwijderd.size > 0 && <> · {scatter.verwijderd.size} uitschieter(s) weggelaten</>}
                  {scatter.zwak && <> · <span style={{ color: "var(--error)" }}>indicatief — weinig of zwak verband</span></>}
                  . Assen starten niet op 0 om de spreiding te tonen.
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
