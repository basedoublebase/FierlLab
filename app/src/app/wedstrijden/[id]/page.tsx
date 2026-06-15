"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Check, Pencil, Wind, X } from "lucide-react";

import {
  type PbhWedstrijdDetail,
  fetchPbhWedstrijdDetail,
  fetchPbhWind,
  savePbhStok,
} from "@/lib/api";
import { formatDatum } from "@/lib/date";
import { kompasRichting } from "@/lib/fysica";

type WindStatus = {
  laden: boolean;
  ms?: number;
  graden?: number | null;
  windtype?: string;
  geschat?: boolean;
  fout?: boolean;
};

// Dummy theoretisch maximum tot de exacte formules er zijn.
function dummyMax(afstand: number): { max: number; benutting: number } {
  const max = Math.round((afstand / 0.93) * 100) / 100;
  return { max, benutting: Math.round((afstand / max) * 100) };
}

export default function WedstrijdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<PbhWedstrijdDetail | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [wind, setWind] = useState<Record<number, WindStatus>>({});

  const [bewerk, setBewerk] = useState<number | null>(null);
  const [stokOp, setStokOp] = useState("");
  const [stokUit, setStokUit] = useState("");
  const [opslaanBezig, setOpslaanBezig] = useState(false);

  function startBewerk(p: { poging_index: number; stok_op_m: number | null; stok_uit_hand_m: number | null }) {
    setBewerk(p.poging_index);
    setStokOp(p.stok_op_m?.toString() ?? "");
    setStokUit(p.stok_uit_hand_m?.toString() ?? "");
  }

  async function bewaarStok(pogingIndex: number) {
    if (!detail) return;
    const parse = (s: string): number | null => {
      const t = s.trim().replace(",", ".");
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    setOpslaanBezig(true);
    try {
      const res = await savePbhStok(detail.id_wedstrijd, pogingIndex, {
        stok_op_m: parse(stokOp),
        stok_uit_hand_m: parse(stokUit),
      });
      setDetail((d) =>
        d
          ? {
              ...d,
              pogingen: d.pogingen.map((x) =>
                x.poging_index === pogingIndex
                  ? { ...x, stok_op_m: res.stok_op_m, stok_uit_hand_m: res.stok_uit_hand_m }
                  : x
              ),
            }
          : d
      );
      setBewerk(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setOpslaanBezig(false);
    }
  }

  useEffect(() => {
    let actief = true;
    fetchPbhWedstrijdDetail(Number(id))
      .then((d) => {
        if (actief) setDetail(d);
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
  }, [id]);

  // Wind per gemeten sprong lazy + parallel ophalen zodra detail er is.
  useEffect(() => {
    if (!detail || !detail.plaats || !detail.datum) return;
    let actief = true;
    detail.pogingen.forEach((p, i) => {
      const tijd = p.tijd ?? p.tijd_schatting;
      if (!tijd) return;
      const geschat = !p.tijd;
      setWind((w) => ({ ...w, [i]: { laden: true, geschat } }));
      fetchPbhWind(detail.plaats as string, detail.datum as string, tijd)
        .then((res) => {
          if (actief)
            setWind((w) => ({
              ...w,
              [i]: { laden: false, ms: res.wind_ms, graden: res.windrichting_graden, windtype: res.windtype, geschat },
            }));
        })
        .catch(() => {
          if (actief) setWind((w) => ({ ...w, [i]: { laden: false, fout: true } }));
        });
    });
    return () => {
      actief = false;
    };
  }, [detail]);

  if (laden) {
    return (
      <main className="shell">
        <div className="card loading-card">
          <p className="muted">Wedstrijd laden…</p>
        </div>
      </main>
    );
  }

  if (fout || !detail) {
    return (
      <main className="shell">
        <Link href="/wedstrijden" className="terug-link">← Terug naar wedstrijden</Link>
        <div className="banner error">{fout ?? "Wedstrijd niet gevonden."}</div>
      </main>
    );
  }

  return (
    <main className="shell">
      <Link href="/wedstrijden" className="terug-link">← Terug naar wedstrijden</Link>

      <section className="card" style={{ marginTop: 0 }}>
        <div className="wed-detail-kop">
          <div style={{ minWidth: 0 }}>
            {detail.datum && <div className="wed-datum">{formatDatum(detail.datum)}</div>}
            <h1 style={{ fontSize: "1.6rem" }}>{detail.wedstrijd || detail.plaats}</h1>
            {detail.plaats && <div className="wed-plaats" style={{ marginTop: 4 }}>📍 {detail.plaats}</div>}
          </div>
          <div className="wed-kop-rechts">
            <span className="status-pill">
              {detail.categorie}
              {detail.positie ? ` · ${detail.positie}e` : ""}
            </span>
            {detail.beste !== null && <span className="wed-detail-verste">{detail.beste.toFixed(2)} m</span>}
          </div>
        </div>
      </section>

      <p className="eyebrow" style={{ margin: "22px 0 0 2px" }}>Pogingen</p>

      {detail.pogingen.map((p, i) => {
        const isBeste = detail.beste !== null && p.afstand === detail.beste;
        const themax = p.afstand !== null ? dummyMax(p.afstand) : null;
        const w = wind[i];
        const kompas = w?.graden != null ? kompasRichting(w.graden) : null;
        return (
          <article key={i} className={`poging-detail${isBeste ? " beste" : ""}`}>
            <div className="poging-detail-kop">
              <span className="poging-detail-naam">{p.label}</span>
              {isBeste && <span className="wed-pr">beste</span>}
              {bewerk === p.poging_index ? (
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
                  <button type="button" className="icon-btn" aria-label="Annuleren" onClick={() => setBewerk(null)}>
                    <X size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Opslaan"
                    onClick={() => bewaarStok(p.poging_index)}
                    disabled={opslaanBezig}
                    style={{ color: "var(--success)" }}
                  >
                    <Check size={16} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Stok op / stok uit hand bewerken"
                  onClick={() => startBewerk(p)}
                  style={{ marginLeft: "auto" }}
                >
                  <Pencil size={15} />
                </button>
              )}
              <span className="poging-detail-afstand">
                {p.afstand !== null ? `${p.afstand.toFixed(2)} m` : <span className="wed-ongeldig">ongeldig</span>}
              </span>
            </div>

            <div className="meet-grid">
              <div className="meet-cel">
                <div className="meet-label">Stok op</div>
                {bewerk === p.poging_index ? (
                  <input
                    className="text-input"
                    inputMode="decimal"
                    value={stokOp}
                    onChange={(e) => setStokOp(e.target.value)}
                    placeholder="bijv. 10.80"
                    style={{ minHeight: 36, marginTop: 4 }}
                  />
                ) : (
                  <div className="meet-waarde">{p.stok_op_m != null ? `${p.stok_op_m.toFixed(2)} m` : "—"}</div>
                )}
                <div className="meet-sub">in het water</div>
              </div>
              <div className="meet-cel">
                <div className="meet-label">Stok uit hand</div>
                {bewerk === p.poging_index ? (
                  <input
                    className="text-input"
                    inputMode="decimal"
                    value={stokUit}
                    onChange={(e) => setStokUit(e.target.value)}
                    placeholder="bijv. 12.40"
                    style={{ minHeight: 36, marginTop: 4 }}
                  />
                ) : (
                  <div className="meet-waarde">{p.stok_uit_hand_m != null ? `${p.stok_uit_hand_m.toFixed(2)} m` : "—"}</div>
                )}
                <div className="meet-sub">greephoogte</div>
              </div>

              <div className="meet-cel">
                <div className="meet-label">Wind</div>
                <div className="meet-waarde">
                  {!p.tijd && !p.tijd_schatting ? (
                    "—"
                  ) : w?.laden ? (
                    <span className="muted" style={{ fontWeight: 400, fontSize: "0.9rem" }}>ophalen…</span>
                  ) : w?.ms != null ? (
                    <>
                      {w.graden != null && (
                        <ArrowUp
                          size={15}
                          className="meet-wind-pijl"
                          style={{ transform: `rotate(${(w.graden + 180) % 360}deg)` }}
                        />
                      )}
                      {w.ms} m/s
                    </>
                  ) : (
                    <Wind size={15} style={{ color: "var(--text-faint)" }} />
                  )}
                </div>
                <div className="meet-sub">
                  {!p.tijd && !p.tijd_schatting
                    ? "geen tijd"
                    : w?.fout
                      ? "niet beschikbaar"
                      : [kompas, w?.windtype, w?.geschat ? "geschatte tijd" : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="meet-cel">
                <div className="meet-label">Tijd</div>
                <div className="meet-waarde">
                  {p.tijd ?? (p.tijd_schatting ? `~${p.tijd_schatting.slice(0, 5)}` : "—")}
                </div>
                <div className="meet-sub">
                  {p.afwijking != null ? (
                    <span className="afwijking-pijl">
                      afwijking {p.afwijking >= 0 ? <ArrowRight size={11} /> : <ArrowLeft size={11} />}
                      {Math.abs(p.afwijking).toFixed(2)}
                    </span>
                  ) : p.tijd_schatting ? (
                    "geschat"
                  ) : (
                    "geen meting"
                  )}
                </div>
              </div>

              <div className="meet-cel">
                <div className="meet-label">Landing</div>
                <div className="meet-waarde">{p.landingsplaats != null ? `${p.landingsplaats.toFixed(2)} m` : "—"}</div>
                <div className="meet-sub">{p.landingsplaats != null ? "recht vooruit" : "geen meting"}</div>
              </div>
              <div className="meet-cel">
                <div className="meet-label">Theoretisch max</div>
                <div className="meet-waarde blauw">{themax ? `${themax.max.toFixed(2)} m` : "—"}</div>
                <div className="meet-sub">{themax ? `benutting ${themax.benutting}% · dummy` : ""}</div>
              </div>
            </div>
          </article>
        );
      })}
    </main>
  );
}
