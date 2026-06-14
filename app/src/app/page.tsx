"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  type Poging,
  type Profiel,
  type Schans,
  type Wedstrijd,
  createPoging,
  createWedstrijd,
  deletePoging,
  fetchProfiel,
  fetchSchansen,
  fetchWedstrijden,
  updatePoging,
} from "@/lib/api";
import { WindPoging } from "@/app/_components/wind-poging";
import { formatDatum, vandaagISO } from "@/lib/date";
import { FYSICA_DEFAULTS, benutting, berekenSprongMax } from "@/lib/fysica";

const CATEGORIEEN = ["senioren", "junioren", "jongens", "dames", "meisjes"];

type Invoer = { stok_op: string; afstand: string };

export default function InvullenPage() {
  const [profiel, setProfiel] = useState<Profiel | null>(null);
  const [schansen, setSchansen] = useState<Schans[]>([]);
  const [wedstrijden, setWedstrijden] = useState<Wedstrijd[]>([]);
  const [actieveId, setActieveId] = useState<number | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);

  // Nieuwe-wedstrijd formulier
  const [toonNieuw, setToonNieuw] = useState(false);
  const [nieuwDatum, setNieuwDatum] = useState(vandaagISO());
  const [nieuwSchansId, setNieuwSchansId] = useState<number | null>(null);
  const [nieuwCategorie, setNieuwCategorie] = useState("senioren");
  const [bezig, setBezig] = useState(false);

  // Lokale invoer per poging-id, opslaan op blur.
  const [invoer, setInvoer] = useState<Record<number, Invoer>>({});

  const herlaad = useCallback(async () => {
    const data = await fetchWedstrijden();
    setWedstrijden(data);
    return data;
  }, []);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const [p, s, w] = await Promise.all([fetchProfiel(), fetchSchansen(), fetchWedstrijden()]);
        if (!actief) return;
        setProfiel(p);
        setSchansen(s);
        setWedstrijden(w);
        if (s.length > 0) setNieuwSchansId(s[0].id);
        // Standaard: wedstrijd van vandaag, anders niets geselecteerd.
        const vandaag = w.find((x) => x.datum === vandaagISO());
        if (vandaag) setActieveId(vandaag.id);
        else setToonNieuw(w.length === 0);
      } catch (e) {
        if (actief) setFout(e instanceof Error ? e.message : "Laden mislukt.");
      } finally {
        if (actief) setLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  const wedstrijd = useMemo(
    () => wedstrijden.find((w) => w.id === actieveId) ?? null,
    [wedstrijden, actieveId]
  );

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

  function invoerVoor(poging: Poging): Invoer {
    return (
      invoer[poging.id] ?? {
        stok_op: poging.stok_op_m?.toString() ?? "",
        afstand: poging.afstand_m?.toString() ?? "",
      }
    );
  }

  function zetInvoer(poging: Poging, deel: Partial<Invoer>) {
    setInvoer((prev) => ({ ...prev, [poging.id]: { ...invoerVoor(poging), ...deel } }));
  }

  async function bewaarPoging(poging: Poging) {
    const huidige = invoerVoor(poging);
    const stokOp = huidige.stok_op.trim() === "" ? null : Number(huidige.stok_op.replace(",", "."));
    const afstand = huidige.afstand.trim() === "" ? null : Number(huidige.afstand.replace(",", "."));
    if ((stokOp !== null && !Number.isFinite(stokOp)) || (afstand !== null && !Number.isFinite(afstand))) {
      return;
    }
    if (stokOp === poging.stok_op_m && afstand === poging.afstand_m) return;
    try {
      await updatePoging(poging.id, { stok_op_m: stokOp, afstand_m: afstand });
      await herlaad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    }
  }

  async function nieuwePoging() {
    if (!wedstrijd) return;
    setBezig(true);
    setFout(null);
    try {
      const timestamp = new Date().toISOString();
      await createPoging(wedstrijd.id, { timestamp });
      // Winddata haal je per sprong on-demand op via de KNMI-knop.
      await herlaad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Poging toevoegen mislukt.");
    } finally {
      setBezig(false);
    }
  }

  async function verwijderPoging(poging: Poging) {
    setFout(null);
    try {
      await deletePoging(poging.id);
      setInvoer((prev) => {
        const kopie = { ...prev };
        delete kopie[poging.id];
        return kopie;
      });
      await herlaad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  async function maakWedstrijd(e: React.FormEvent) {
    e.preventDefault();
    if (nieuwSchansId === null) return;
    setBezig(true);
    setFout(null);
    try {
      const w = await createWedstrijd({
        datum: nieuwDatum,
        schans_id: nieuwSchansId,
        categorie: nieuwCategorie,
      });
      await herlaad();
      setActieveId(w.id);
      setToonNieuw(false);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Wedstrijd aanmaken mislukt.");
    } finally {
      setBezig(false);
    }
  }

  // Samenvatting van de actieve wedstrijd.
  const samenvatting = useMemo(() => {
    if (!wedstrijd) return null;
    const geldig = wedstrijd.pogingen.filter((p) => (p.afstand_m ?? 0) > 0);
    const beste = geldig.length > 0 ? Math.max(...geldig.map((p) => p.afstand_m as number)) : null;
    const besteStokOp = wedstrijd.pogingen.reduce<number | null>(
      (max, p) => (p.stok_op_m !== null && (max === null || p.stok_op_m > max) ? p.stok_op_m : max),
      null
    );
    const maxVanBesteStok =
      besteStokOp !== null ? berekenSprongMax(besteStokOp, fysicaConfig)?.theoretisch_max_m ?? null : null;
    const benuttingen = geldig
      .map((p) => {
        if (p.stok_op_m === null) return null;
        const max = berekenSprongMax(p.stok_op_m, fysicaConfig);
        return max ? benutting(p.afstand_m as number, max.theoretisch_max_m) : null;
      })
      .filter((b): b is number => b !== null);
    const gemBenutting =
      benuttingen.length > 0
        ? Math.round((benuttingen.reduce((a, b) => a + b, 0) / benuttingen.length) * 10) / 10
        : null;
    return { beste, maxVanBesteStok, gemBenutting, geldigAantal: geldig.length };
  }, [wedstrijd, fysicaConfig]);

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
        <p className="eyebrow">Live invoer</p>
        <h1>Invullen</h1>
      </header>

      {fout && <div className="banner error">{fout}</div>}

      {/* Wedstrijd kiezen / aanmaken */}
      <section className="card">
        <div className="section-header">
          <h2>Actieve wedstrijd</h2>
          <p className="muted">Kies een wedstrijd of maak een nieuwe aan.</p>
        </div>

        <div className="toolbar-row">
          <select
            className="text-input"
            value={actieveId ?? ""}
            onChange={(e) => {
              setActieveId(e.target.value === "" ? null : Number(e.target.value));
              setToonNieuw(false);
            }}
          >
            <option value="">— Kies een wedstrijd —</option>
            {wedstrijden.map((w) => (
              <option key={w.id} value={w.id}>
                {formatDatum(w.datum)} · {w.schans.naam} ({w.categorie})
              </option>
            ))}
          </select>

          {!toonNieuw && (
            <button type="button" className="secondary-button" onClick={() => setToonNieuw(true)}>
              <Plus size={16} style={{ verticalAlign: "-3px" }} /> Nieuwe wedstrijd
            </button>
          )}
        </div>

        {toonNieuw && (
          <form onSubmit={maakWedstrijd} className="field-list" style={{ marginTop: 16 }}>
            <div className="field">
              <span className="field-label">Datum</span>
              <input
                type="date"
                className="text-input"
                value={nieuwDatum}
                onChange={(e) => setNieuwDatum(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <span className="field-label">Schans</span>
              <select
                className="text-input"
                value={nieuwSchansId ?? ""}
                onChange={(e) => setNieuwSchansId(Number(e.target.value))}
                required
              >
                {schansen.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.naam} — {s.locatie}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field-label">Categorie</span>
              <div className="filter-group">
                {CATEGORIEEN.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`choice-button${nieuwCategorie === cat ? " active" : ""}`}
                    onClick={() => setNieuwCategorie(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="toolbar-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <button type="button" className="secondary-button" onClick={() => setToonNieuw(false)}>
                Annuleren
              </button>
              <button type="submit" className="primary-button" disabled={bezig || nieuwSchansId === null}>
                {bezig ? "Bezig…" : "Wedstrijd aanmaken"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Pogingen */}
      {wedstrijd && (
        <>
          <section className="card">
            <div className="section-header">
              <h2>
                Pogingen — {wedstrijd.schans.naam}, {formatDatum(wedstrijd.datum)}
              </h2>
              <p className="muted">
                Stok op en afstand in meters. Wind wordt automatisch opgehaald per poging.
              </p>
            </div>

            <div className="poging-list">
              {wedstrijd.pogingen.length === 0 && (
                <p className="rij-leeg">Nog geen pogingen. Voeg je eerste poging toe.</p>
              )}

              {wedstrijd.pogingen.map((poging) => {
                const huidige = invoerVoor(poging);
                const stokOpGetal = Number(huidige.stok_op.replace(",", "."));
                const afstandGetal = Number(huidige.afstand.replace(",", "."));
                const berekening =
                  huidige.stok_op.trim() !== "" && Number.isFinite(stokOpGetal)
                    ? berekenSprongMax(stokOpGetal, fysicaConfig)
                    : null;
                const werkelijk =
                  huidige.afstand.trim() !== "" && Number.isFinite(afstandGetal) ? afstandGetal : null;
                const verschil =
                  berekening && werkelijk !== null
                    ? Math.round((werkelijk - berekening.theoretisch_max_m) * 100) / 100
                    : null;
                const benut =
                  berekening && werkelijk !== null ? benutting(werkelijk, berekening.theoretisch_max_m) : null;

                return (
                  <article key={poging.id} className="poging-card">
                    <div className="poging-header">
                      <span className="poging-nummer">{poging.nummer}</span>
                      <span className="muted" style={{ fontSize: "0.84rem" }}>
                        Poging {poging.nummer}
                      </span>
                      <span style={{ marginLeft: "auto" }}>
                        <WindPoging poging={poging} onUpdate={() => herlaad()} />
                      </span>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        aria-label="Poging verwijderen"
                        onClick={() => verwijderPoging(poging)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="poging-inputs">
                      <label className="field">
                        <span className="field-label">Stok op (m)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="text-input"
                          placeholder="bijv. 11.70"
                          value={huidige.stok_op}
                          onChange={(e) => zetInvoer(poging, { stok_op: e.target.value })}
                          onBlur={() => bewaarPoging(poging)}
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">Afstand (m)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="text-input"
                          placeholder="leeg = nog niet"
                          value={huidige.afstand}
                          onChange={(e) => zetInvoer(poging, { afstand: e.target.value })}
                          onBlur={() => bewaarPoging(poging)}
                        />
                      </label>
                    </div>

                    {berekening && (
                      <div className="berekening-grid">
                        <div className="berekening-cel">
                          <span className="berekening-label">Theoretisch max</span>
                          <span className="berekening-waarde">{berekening.theoretisch_max_m.toFixed(2)} m</span>
                        </div>
                        <div className="berekening-cel">
                          <span className="berekening-label">Werkelijk</span>
                          <span className="berekening-waarde">
                            {werkelijk !== null ? `${werkelijk.toFixed(2)} m` : "—"}
                          </span>
                        </div>
                        <div className="berekening-cel">
                          <span className="berekening-label">Verschil</span>
                          <span
                            className={`berekening-waarde${
                              verschil === null ? "" : verschil >= 0 ? " positief" : " negatief"
                            }`}
                          >
                            {verschil !== null ? `${verschil > 0 ? "+" : ""}${verschil.toFixed(2)} m` : "—"}
                          </span>
                        </div>
                        <div className="berekening-cel">
                          <span className="berekening-label">Benutting</span>
                          <span className="berekening-waarde">{benut !== null ? `${benut}%` : "—"}</span>
                        </div>
                        <div className="berekening-cel">
                          <span className="berekening-label">Begin stok</span>
                          <span className="berekening-waarde">{berekening.begin_stok_afstand_m.toFixed(2)} m</span>
                        </div>
                        <div className="berekening-cel">
                          <span className="berekening-label">Optimale hoek</span>
                          <span className="berekening-waarde">{berekening.optimale_hoek_graden}°</span>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="detail-actions">
              <button type="button" className="primary-button" onClick={nieuwePoging} disabled={bezig}>
                <Plus size={16} style={{ verticalAlign: "-3px" }} /> Nieuwe poging
              </button>
            </div>
          </section>

          {/* Samenvattingskaart */}
          {samenvatting && wedstrijd.pogingen.length > 0 && (
            <section className="card samenvatting-card">
              <div className="section-header">
                <h2>Samenvatting</h2>
              </div>
              <div className="berekening-grid">
                <div className="berekening-cel">
                  <span className="berekening-label">Beste sprong</span>
                  <span className="berekening-waarde">
                    {samenvatting.beste !== null ? `${samenvatting.beste.toFixed(2)} m` : "—"}
                  </span>
                </div>
                <div className="berekening-cel">
                  <span className="berekening-label">Max beste stok-op</span>
                  <span className="berekening-waarde">
                    {samenvatting.maxVanBesteStok !== null
                      ? `${samenvatting.maxVanBesteStok.toFixed(2)} m`
                      : "—"}
                  </span>
                </div>
                <div className="berekening-cel">
                  <span className="berekening-label">Gem. benutting</span>
                  <span className="berekening-waarde">
                    {samenvatting.gemBenutting !== null ? `${samenvatting.gemBenutting}%` : "—"}
                  </span>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
