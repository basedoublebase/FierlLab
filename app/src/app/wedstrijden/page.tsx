"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, MapPin, Trophy } from "lucide-react";

import { type PbhWedstrijd, fetchPbhWedstrijden } from "@/lib/api";
import { formatDatum, seizoenVan } from "@/lib/date";

export default function WedstrijdenPage() {
  const [lijst, setLijst] = useState<PbhWedstrijd[]>([]);
  const [laden, setLaden] = useState(true);
  const [nietGekoppeld, setNietGekoppeld] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const [categorie, setCategorie] = useState("alle");
  const [schans, setSchans] = useState("alle");
  const [seizoen, setSeizoen] = useState("alle");

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
