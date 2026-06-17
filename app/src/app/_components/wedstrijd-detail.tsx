"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Check, Pencil, Wind, X } from "lucide-react";

import {
  type PbhWedstrijdDetail,
  type Profiel,
  fetchPbhWedstrijdDetail,
  fetchPbhWind,
  fetchProfiel,
  savePbhStok,
} from "@/lib/api";
import { formatDatum } from "@/lib/date";
import { FYSICA_DEFAULTS, benutting, berekenSprongMax, kompasRichting } from "@/lib/fysica";

type WindStatus = {
  laden: boolean;
  ms?: number;
  graden?: number | null;
  windtype?: string;
  geschat?: boolean;
  fout?: boolean;
};

export function WedstrijdDetail({ idWedstrijd, toonHeader = true }: { idWedstrijd: number; toonHeader?: boolean }) {
  const [detail, setDetail] = useState<PbhWedstrijdDetail | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [geenUitslag, setGeenUitslag] = useState(false);
  const [wind, setWind] = useState<Record<number, WindStatus>>({});

  const [profiel, setProfiel] = useState<Profiel | null>(null);
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
    setLaden(true);
    setFout(null);
    setGeenUitslag(false);
    setDetail(null);
    setWind({});
    Promise.all([fetchPbhWedstrijdDetail(idWedstrijd), fetchProfiel().catch(() => null)])
      .then(([d, p]) => {
        if (!actief) return;
        setDetail(d);
        setProfiel(p);
      })
      .catch((e) => {
        if (!actief) return;
        const msg = e instanceof Error ? e.message : "Laden mislukt.";
        // 404 = de springer staat (nog) niet in de uitslag van deze wedstrijd.
        if (msg.toLowerCase().includes("geen sprongen") || msg.toLowerCase().includes("niet gevonden")) {
          setGeenUitslag(true);
        } else {
          setFout(msg);
        }
      })
      .finally(() => {
        if (actief) setLaden(false);
      });
    return () => {
      actief = false;
    };
  }, [idWedstrijd]);

  const fysicaConfig = {
    ...FYSICA_DEFAULTS,
    massa_kg: profiel?.massa_kg ?? FYSICA_DEFAULTS.massa_kg,
    stoklengte_m: profiel?.stoklengte_m ?? FYSICA_DEFAULTS.stoklengte_m,
    uitsprongstoot_ns: profiel?.uitsprongstoot_ns ?? FYSICA_DEFAULTS.uitsprongstoot_ns,
    springer_gestrekt_m: profiel?.springer_gestrekt_m ?? FYSICA_DEFAULTS.springer_gestrekt_m,
  };

  useEffect(() => {
    if (!detail || !detail.plaats || !detail.datum) return;
    let actief = true;
    detail.pogingen.forEach((p, i) => {
      const tijd = p.tijd ?? p.tijd_schatting;
      if (!tijd) return;
      const geschat = !p.tijd;
      if (p.wind && p.wind.wind_ms != null) {
        setWind((w) => ({
          ...w,
          [i]: { laden: false, ms: p.wind!.wind_ms, graden: p.wind!.windrichting_graden, windtype: p.wind!.windtype, geschat },
        }));
        return;
      }
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
      <div className="card loading-card">
        <p className="muted">Wedstrijd laden…</p>
      </div>
    );
  }

  if (geenUitslag) {
    return (
      <div className="card">
        <p className="muted">
          Nog geen uitslag. De sprongen verschijnen zodra pbholland de resultaten publiceert.
        </p>
      </div>
    );
  }

  if (fout || !detail) {
    return <div className="banner error">{fout ?? "Wedstrijd niet gevonden."}</div>;
  }

  return (
    <>
      {toonHeader && (
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
      )}

      <p className="eyebrow" style={{ margin: "22px 0 0 2px" }}>Pogingen</p>

      {detail.pogingen.map((p, i) => {
        const isBeste = detail.beste !== null && p.afstand === detail.beste;
        const berekening = p.stok_op_m != null ? berekenSprongMax(p.stok_op_m, fysicaConfig) : null;
        const benut =
          berekening && p.afstand != null && p.afstand > 0
            ? benutting(p.afstand, berekening.theoretisch_max_m)
            : null;
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
                <div className="meet-waarde blauw">
                  {berekening ? `${berekening.theoretisch_max_m.toFixed(2)} m` : "—"}
                </div>
                <div className="meet-sub">
                  {berekening
                    ? benut !== null
                      ? `benutting ${benut}% · hoek ${berekening.optimale_hoek_graden}°`
                      : `optimale hoek ${berekening.optimale_hoek_graden}°`
                    : "vul stok op in"}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </>
  );
}
