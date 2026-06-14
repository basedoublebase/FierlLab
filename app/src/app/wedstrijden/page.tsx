"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, MapPin, Trophy } from "lucide-react";

import {
  type PbhWedstrijd,
  type PbhWedstrijdDetail,
  fetchPbhWedstrijdDetail,
  fetchPbhWedstrijden,
} from "@/lib/api";
import { formatDatum, seizoenVan } from "@/lib/date";

export default function WedstrijdenPage() {
  const [lijst, setLijst] = useState<PbhWedstrijd[]>([]);
  const [laden, setLaden] = useState(true);
  const [nietGekoppeld, setNietGekoppeld] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const [categorie, setCategorie] = useState("alle");
  const [schans, setSchans] = useState("alle");
  const [seizoen, setSeizoen] = useState("alle");

  const [open, setOpen] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, PbhWedstrijdDetail>>({});
  const [detailLaden, setDetailLaden] = useState<number | null>(null);
  const [detailFout, setDetailFout] = useState<Record<number, string>>({});

  useEffect(() => {
    let actief = true;
    fetchPbhWedstrijden()
      .then((data) => {
        if (actief) setLijst(data.wedstrijden);
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

  async function toggle(w: PbhWedstrijd) {
    if (w.id_wedstrijd === null) return;
    if (open === w.id_wedstrijd) {
      setOpen(null);
      return;
    }
    setOpen(w.id_wedstrijd);
    if (!details[w.id_wedstrijd]) {
      setDetailLaden(w.id_wedstrijd);
      setDetailFout((p) => ({ ...p, [w.id_wedstrijd as number]: "" }));
      try {
        const d = await fetchPbhWedstrijdDetail(w.id_wedstrijd);
        setDetails((p) => ({ ...p, [w.id_wedstrijd as number]: d }));
      } catch (e) {
        setDetailFout((p) => ({
          ...p,
          [w.id_wedstrijd as number]: e instanceof Error ? e.message : "Detail laden mislukt.",
        }));
      } finally {
        setDetailLaden(null);
      }
    }
  }

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
      <header className="hero">
        <p className="eyebrow">Overzicht</p>
        <h1>Wedstrijden</h1>
      </header>

      {fout && <div className="banner error">{fout}</div>}

      <div className="wed-filters">
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

      {gefilterd.length === 0 ? (
        <div className="tegel-empty">
          <Trophy size={28} />
          <p>Geen wedstrijden binnen dit filter.</p>
        </div>
      ) : (
        gefilterd.map((w) => {
          const isOpen = open === w.id_wedstrijd;
          const detail = w.id_wedstrijd !== null ? details[w.id_wedstrijd] : undefined;
          const aanHetLaden = detailLaden === w.id_wedstrijd;
          const dfout = w.id_wedstrijd !== null ? detailFout[w.id_wedstrijd] : undefined;
          return (
            <article key={`${w.id_wedstrijd}-${w.datum}`} className="card wed-kaart">
              <button type="button" className="wed-kop" onClick={() => toggle(w)} aria-expanded={isOpen}>
                <div className="wed-kop-tekst">
                  <div className="wed-datum">{formatDatum(w.datum)}</div>
                  <div className="wed-naam">{w.wedstrijd || w.plaats}</div>
                  <span className="wed-plaats">
                    <MapPin size={13} /> {w.plaats}
                  </span>
                </div>
                <div className="wed-kop-rechts">
                  <span className="status-pill">
                    {w.categorie}
                    {w.plaats_finale ? ` · ${w.plaats_finale}e` : ""}
                  </span>
                  {w.verste_afstand !== null && (
                    <span className="schans-afstand">{w.verste_afstand.toFixed(2)} m</span>
                  )}
                </div>
                <ChevronDown size={18} className={`wed-chevron${isOpen ? " open" : ""}`} />
              </button>

              {isOpen && (
                <div className="wed-body">
                  {aanHetLaden && <div className="wed-detail-laden">Sprongen laden…</div>}
                  {dfout && <div className="banner error">{dfout}</div>}
                  {detail && (
                    <>
                      <table className="wed-tabel">
                        <thead>
                          <tr>
                            <th>Poging</th>
                            <th>Afstand</th>
                            <th>Afwijking</th>
                            <th>Landing</th>
                            <th>Tijd</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.pogingen.map((p, i) => (
                            <tr key={i}>
                              <td>{p.label}</td>
                              <td>
                                {p.afstand !== null ? (
                                  <span className={`wed-afstand${detail.beste !== null && p.afstand === detail.beste ? " beste" : ""}`}>
                                    {p.afstand.toFixed(2)}
                                    {detail.beste !== null && p.afstand === detail.beste && <span className="wed-pr">beste</span>}
                                  </span>
                                ) : (
                                  <span className="wed-ongeldig">ongeldig</span>
                                )}
                              </td>
                              <td>
                                {p.afwijking !== null ? (
                                  <span className="afwijking-pijl">
                                    {p.afwijking >= 0 ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
                                    {Math.abs(p.afwijking).toFixed(2)}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>{p.landingsplaats !== null ? `${p.landingsplaats.toFixed(2)} m` : "—"}</td>
                              <td>{p.tijd ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="wed-foot">
                        <div className="wed-foot-cel">
                          <span className="wed-foot-label">Beste sprong</span>
                          <span className="wed-foot-waarde accent">
                            {detail.beste !== null ? detail.beste.toFixed(2) : "—"}
                          </span>
                        </div>
                        <div className="wed-foot-cel">
                          <span className="wed-foot-label">Gemiddelde</span>
                          <span className="wed-foot-waarde">
                            {detail.gemiddelde !== null ? `${detail.gemiddelde.toFixed(2)} m` : "—"}
                          </span>
                        </div>
                        <div className="wed-foot-cel">
                          <span className="wed-foot-label">Positie</span>
                          <span className="wed-foot-waarde">{detail.positie ? `${detail.positie}e` : "—"}</span>
                        </div>
                      </div>

                      <p className="muted" style={{ fontSize: "0.74rem", marginTop: 10 }}>
                        Afwijking: <ArrowRight size={11} style={{ verticalAlign: "-1px" }} /> naar rechts,{" "}
                        <ArrowLeft size={11} style={{ verticalAlign: "-1px" }} /> naar links. Landing = afstand recht
                        vooruit. Tijd/afwijking/landing alleen bij elektronisch gemeten sprongen.
                      </p>
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })
      )}
    </main>
  );
}
