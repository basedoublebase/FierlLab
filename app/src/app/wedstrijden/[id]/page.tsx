"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Wind } from "lucide-react";

import {
  type Profiel,
  type Wedstrijd,
  deleteWedstrijd,
  fetchProfiel,
  fetchWedstrijd,
} from "@/lib/api";
import { formatDatum, formatTijd } from "@/lib/date";
import { FYSICA_DEFAULTS, benutting, berekenSprongMax, kompasRichting } from "@/lib/fysica";

export default function WedstrijdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [wedstrijd, setWedstrijd] = useState<Wedstrijd | null>(null);
  const [profiel, setProfiel] = useState<Profiel | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [bevestigVerwijderen, setBevestigVerwijderen] = useState(false);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let actief = true;
    Promise.all([fetchWedstrijd(id), fetchProfiel()])
      .then(([w, p]) => {
        if (!actief) return;
        setWedstrijd(w);
        setProfiel(p);
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

  const fysicaConfig = useMemo(() => {
    if (!wedstrijd) return FYSICA_DEFAULTS;
    return {
      massa_kg: profiel?.massa_kg ?? FYSICA_DEFAULTS.massa_kg,
      stoklengte_m: profiel?.stoklengte_m ?? FYSICA_DEFAULTS.stoklengte_m,
      uitsprongstoot_ns: profiel?.uitsprongstoot_ns ?? FYSICA_DEFAULTS.uitsprongstoot_ns,
      springer_gestrekt_m: profiel?.springer_gestrekt_m ?? FYSICA_DEFAULTS.springer_gestrekt_m,
      waterdiepte_m: wedstrijd.schans.waterdiepte_m,
      schanshoogte_m: wedstrijd.schans.schanshoogte_m,
    };
  }, [wedstrijd, profiel]);

  async function verwijderen() {
    if (!wedstrijd) return;
    setBezig(true);
    setFout(null);
    try {
      await deleteWedstrijd(wedstrijd.id);
      router.push("/wedstrijden");
      router.refresh();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
      setBezig(false);
    }
  }

  if (laden) {
    return (
      <main className="shell">
        <div className="card loading-card">
          <p className="muted">Laden…</p>
        </div>
      </main>
    );
  }

  if (!wedstrijd) {
    return (
      <main className="shell">
        <Link href="/wedstrijden" className="terug-link">← Terug naar wedstrijden</Link>
        <div className="banner error">{fout ?? "Wedstrijd niet gevonden."}</div>
      </main>
    );
  }

  const geldig = wedstrijd.pogingen.filter((p) => (p.afstand_m ?? 0) > 0);
  const beste = geldig.length > 0 ? Math.max(...geldig.map((p) => p.afstand_m as number)) : null;

  return (
    <main className="shell">
      <Link href="/wedstrijden" className="terug-link">← Terug naar wedstrijden</Link>

      <header className="hero">
        <p className="eyebrow">{formatDatum(wedstrijd.datum)} · {wedstrijd.categorie}</p>
        <h1>{wedstrijd.schans.naam}</h1>
      </header>

      {fout && <div className="banner error">{fout}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Beste sprong</span>
          <span className="stat-value">{beste !== null ? `${beste.toFixed(2)} m` : "—"}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Geldige pogingen</span>
          <span className="stat-value">{geldig.length}</span>
          <span className="stat-sub">van {wedstrijd.pogingen.length} totaal</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Locatie</span>
          <span className="stat-value" style={{ fontSize: "1.1rem" }}>
            {wedstrijd.schans.locatie || wedstrijd.schans.naam}
          </span>
          <span className="stat-sub">
            water {wedstrijd.schans.waterdiepte_m} m · schans {wedstrijd.schans.schanshoogte_m} m
          </span>
        </div>
      </div>

      <section className="card">
        <div className="section-header">
          <h2>Alle pogingen</h2>
        </div>

        {wedstrijd.pogingen.length === 0 ? (
          <p className="rij-leeg">Geen pogingen ingevuld.</p>
        ) : (
          <div className="poging-list">
            {wedstrijd.pogingen.map((poging) => {
              const berekening =
                poging.stok_op_m !== null ? berekenSprongMax(poging.stok_op_m, fysicaConfig) : null;
              const benut =
                berekening && poging.afstand_m !== null && poging.afstand_m > 0
                  ? benutting(poging.afstand_m, berekening.theoretisch_max_m)
                  : null;
              const kompas = kompasRichting(poging.windrichting_graden);
              return (
                <article key={poging.id} className="poging-card">
                  <div className="poging-header">
                    <span className="poging-nummer">{poging.nummer}</span>
                    <span className="muted" style={{ fontSize: "0.84rem" }}>
                      {formatTijd(poging.timestamp)}
                    </span>
                    <span className="poging-wind">
                      <Wind size={14} />
                      {poging.wind_ms !== null
                        ? `${poging.wind_ms} m/s${kompas ? ` ${kompas}` : ""}`
                        : "geen winddata"}
                    </span>
                  </div>
                  <div className="berekening-grid">
                    <div className="berekening-cel">
                      <span className="berekening-label">Stok op</span>
                      <span className="berekening-waarde">
                        {poging.stok_op_m !== null ? `${poging.stok_op_m.toFixed(2)} m` : "—"}
                      </span>
                    </div>
                    <div className="berekening-cel">
                      <span className="berekening-label">Afstand</span>
                      <span className="berekening-waarde">
                        {poging.afstand_m !== null
                          ? poging.afstand_m > 0
                            ? `${poging.afstand_m.toFixed(2)} m`
                            : "ongeldig"
                          : "—"}
                      </span>
                    </div>
                    <div className="berekening-cel">
                      <span className="berekening-label">Theoretisch max</span>
                      <span className="berekening-waarde">
                        {berekening ? `${berekening.theoretisch_max_m.toFixed(2)} m` : "—"}
                      </span>
                    </div>
                    <div className="berekening-cel">
                      <span className="berekening-label">Benutting</span>
                      <span className="berekening-waarde">{benut !== null ? `${benut}%` : "—"}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        {bevestigVerwijderen ? (
          <div className="delete-confirm-banner">
            <p className="muted">
              Weet je zeker dat je deze wedstrijd en alle pogingen wilt verwijderen?
            </p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setBevestigVerwijderen(false)}
                disabled={bezig}
              >
                Annuleren
              </button>
              <button
                type="button"
                className="primary-button delete-confirm-btn"
                onClick={verwijderen}
                disabled={bezig}
              >
                {bezig ? "Bezig…" : "Definitief verwijderen"}
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-row">
            <div className="settings-row-text">
              <strong>Wedstrijd verwijderen</strong>
              <p className="settings-row-help muted">Verwijdert ook alle pogingen van deze wedstrijd.</p>
            </div>
            <button type="button" className="settings-logout" onClick={() => setBevestigVerwijderen(true)}>
              Verwijderen
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
