"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, LogOut, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

import {
  type GekoppeldProfiel,
  type PbhStatistieken,
  type Profiel,
  type Schans,
  createSchans,
  deleteSchans,
  fetchGekoppeldeProfielen,
  fetchProfiel,
  fetchSchansen,
  invalidatePbhCaches,
  previewPbhProfiel,
  updateProfiel,
  updateSchans,
} from "@/lib/api";
import { createClient } from "@/lib/supabase";

type SchansVorm = {
  naam: string;
  locatie: string;
  lat: string;
  lon: string;
  waterdiepte_m: string;
  schanshoogte_m: string;
};

const LEGE_SCHANS: SchansVorm = {
  naam: "",
  locatie: "",
  lat: "",
  lon: "",
  waterdiepte_m: "1.70",
  schanshoogte_m: "4.00",
};

function naarVorm(schans: Schans): SchansVorm {
  return {
    naam: schans.naam,
    locatie: schans.locatie,
    lat: schans.lat?.toString() ?? "",
    lon: schans.lon?.toString() ?? "",
    waterdiepte_m: schans.waterdiepte_m.toString(),
    schanshoogte_m: schans.schanshoogte_m.toString(),
  };
}

function parseGetal(tekst: string): number | null {
  if (tekst.trim() === "") return null;
  const n = Number(tekst.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Haalt id_persoon (+ naam) uit een geplakte pbholland-URL of losse invoer.
function parsePbhInvoer(invoer: string): { id: number; naam?: string } | null {
  const tekst = invoer.trim();
  if (tekst === "") return null;
  const idMatch = tekst.match(/id_persoon=(\d+)/) ?? tekst.match(/^(\d+)$/);
  if (!idMatch) return null;
  const naamMatch = tekst.match(/[?&]nm=([^&]+)/);
  const naam = naamMatch ? decodeURIComponent(naamMatch[1]).replace(/_/g, " ") : undefined;
  return { id: Number(idMatch[1]), naam };
}

export default function InstellingenPage() {
  const router = useRouter();
  const [profiel, setProfiel] = useState<Profiel | null>(null);
  const [schansen, setSchansen] = useState<Schans[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  // Profiel-formulier (strings voor vlotte invoer)
  const [naam, setNaam] = useState("");
  const [geboortejaar, setGeboortejaar] = useState("");
  const [massa, setMassa] = useState("");
  const [gestrekt, setGestrekt] = useState("");
  const [stoklengte, setStoklengte] = useState("");
  const [stoot, setStoot] = useState("");

  // Schans-beheer
  const [bewerkId, setBewerkId] = useState<number | "nieuw" | null>(null);
  const [schansVorm, setSchansVorm] = useState<SchansVorm>(LEGE_SCHANS);

  // pbholland-koppeling
  const [pbhInvoer, setPbhInvoer] = useState("");
  const [pbhPreview, setPbhPreview] = useState<PbhStatistieken | null>(null);
  const [pbhBezig, setPbhBezig] = useState(false);
  const [pbhFout, setPbhFout] = useState<string | null>(null);
  const [gekoppeld, setGekoppeld] = useState<GekoppeldProfiel[]>([]);
  const [toonNieuw, setToonNieuw] = useState(false);

  async function laadGekoppelde() {
    try {
      const data = await fetchGekoppeldeProfielen();
      setGekoppeld(data.profielen);
    } catch {
      // niet kritisch: de snelwissel-lijst is optioneel
    }
  }

  useEffect(() => {
    let actief = true;
    Promise.all([fetchProfiel(), fetchSchansen(), fetchGekoppeldeProfielen()])
      .then(([p, s, g]) => {
        if (!actief) return;
        setProfiel(p);
        setSchansen(s);
        setGekoppeld(g.profielen);
        setNaam(p.naam);
        setGeboortejaar(p.geboortejaar?.toString() ?? "");
        setMassa(p.massa_kg.toString());
        setGestrekt(p.springer_gestrekt_m.toString());
        setStoklengte(p.stoklengte_m.toString());
        setStoot(p.uitsprongstoot_ns.toString());
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

  async function bewaarProfiel(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    setMelding(null);
    try {
      const bijgewerkt = await updateProfiel({
        naam: naam.trim(),
        geboortejaar: parseGetal(geboortejaar),
        massa_kg: parseGetal(massa) ?? profiel?.massa_kg,
        springer_gestrekt_m: parseGetal(gestrekt) ?? profiel?.springer_gestrekt_m,
        stoklengte_m: parseGetal(stoklengte) ?? profiel?.stoklengte_m,
        uitsprongstoot_ns: parseGetal(stoot) ?? profiel?.uitsprongstoot_ns,
      });
      setProfiel(bijgewerkt);
      setMelding("Profiel opgeslagen.");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBezig(false);
    }
  }

  async function zoekPbhProfiel() {
    const geparsed = parsePbhInvoer(pbhInvoer);
    if (geparsed === null) {
      setPbhFout("Plak een pbholland-profiel-URL of vul een id_persoon in.");
      return;
    }
    setPbhBezig(true);
    setPbhFout(null);
    setPbhPreview(null);
    try {
      const preview = await previewPbhProfiel(geparsed.id, geparsed.naam);
      setPbhPreview(preview);
    } catch (e) {
      setPbhFout(e instanceof Error ? e.message : "Profiel ophalen mislukt.");
    } finally {
      setPbhBezig(false);
    }
  }

  async function koppelPbhProfiel() {
    if (pbhPreview === null) return;
    setPbhBezig(true);
    setPbhFout(null);
    setMelding(null);
    try {
      const bijgewerkt = await updateProfiel({
        pbholland_id: pbhPreview.id_persoon,
        naam: pbhPreview.naam,
      });
      invalidatePbhCaches();
      setProfiel(bijgewerkt);
      setNaam(bijgewerkt.naam);
      setPbhInvoer("");
      setPbhPreview(null);
      setToonNieuw(false);
      await laadGekoppelde();
      setMelding(`pbholland-profiel gekoppeld: ${bijgewerkt.naam}.`);
    } catch (e) {
      setPbhFout(e instanceof Error ? e.message : "Koppelen mislukt.");
    } finally {
      setPbhBezig(false);
    }
  }

  // Terugwisselen naar een eerder gekoppeld profiel: de opgeslagen data van dat
  // profiel is nog aanwezig en verschijnt direct weer.
  async function wisselProfiel(doel: GekoppeldProfiel) {
    setPbhBezig(true);
    setPbhFout(null);
    setMelding(null);
    try {
      const bijgewerkt = await updateProfiel({ pbholland_id: doel.id_persoon, naam: doel.naam });
      invalidatePbhCaches();
      setProfiel(bijgewerkt);
      setNaam(bijgewerkt.naam);
      await laadGekoppelde();
      setMelding(`Gewisseld naar ${bijgewerkt.naam}.`);
    } catch (e) {
      setPbhFout(e instanceof Error ? e.message : "Wisselen mislukt.");
    } finally {
      setPbhBezig(false);
    }
  }

  async function ontkoppelPbhProfiel() {
    setPbhBezig(true);
    setPbhFout(null);
    try {
      const bijgewerkt = await updateProfiel({ pbholland_id: null });
      invalidatePbhCaches();
      setProfiel(bijgewerkt);
      setMelding("pbholland-profiel ontkoppeld. De opgeslagen data blijft bewaard.");
    } catch (e) {
      setPbhFout(e instanceof Error ? e.message : "Ontkoppelen mislukt.");
    } finally {
      setPbhBezig(false);
    }
  }

  async function bewaarSchans(e: React.FormEvent) {
    e.preventDefault();
    if (bewerkId === null) return;
    setBezig(true);
    setFout(null);
    setMelding(null);
    const payload = {
      naam: schansVorm.naam.trim(),
      locatie: schansVorm.locatie.trim(),
      lat: parseGetal(schansVorm.lat),
      lon: parseGetal(schansVorm.lon),
      knmi_station_id: null,
      waterdiepte_m: parseGetal(schansVorm.waterdiepte_m) ?? 1.7,
      schanshoogte_m: parseGetal(schansVorm.schanshoogte_m) ?? 4.0,
    };
    try {
      if (bewerkId === "nieuw") {
        await createSchans(payload);
        setMelding("Schans toegevoegd.");
      } else {
        await updateSchans(bewerkId, payload);
        setMelding("Schans opgeslagen.");
      }
      setSchansen(await fetchSchansen());
      setBewerkId(null);
      setSchansVorm(LEGE_SCHANS);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBezig(false);
    }
  }

  async function verwijderSchans(schans: Schans) {
    setFout(null);
    setMelding(null);
    try {
      await deleteSchans(schans.id);
      setSchansen(await fetchSchansen());
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  async function uitloggen() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Beheer</p>
        <h1>Instellingen</h1>
      </header>

      {fout && <div className="banner error">{fout}</div>}
      {melding && <div className="banner success">{melding}</div>}

      {/* pbholland-koppeling */}
      <section className="card">
        <div className="section-header">
          <h2>pbholland-profiel</h2>
          <p className="muted">
            Koppel je officiële profiel zodat je statistieken (PR, seizoensrecord, resultaten per
            schans) worden opgehaald van pbholland.com.
          </p>
        </div>

        {profiel?.pbholland_id ? (
          <div className="settings-row">
            <div className="settings-row-text">
              <strong>Gekoppeld: {profiel.naam || `id ${profiel.pbholland_id}`}</strong>
              <p className="settings-row-help muted">
                <a
                  href={`https://pbholland.com/index.php/persooninfo/?id_persoon=${profiel.pbholland_id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  Bekijk op pbholland.com ↗
                </a>
              </p>
            </div>
            <button type="button" className="settings-logout" onClick={ontkoppelPbhProfiel} disabled={pbhBezig}>
              Ontkoppelen
            </button>
          </div>
        ) : null}

        {/* Eerder gekoppelde profielen — één klik terugwisselen, data blijft bewaard. */}
        {gekoppeld.filter((g) => g.id_persoon !== profiel?.pbholland_id).length > 0 && (
          <div className="rij-lijst" style={{ marginTop: profiel?.pbholland_id ? 16 : 0 }}>
            <span className="field-label">Eerder gekoppelde profielen</span>
            {gekoppeld
              .filter((g) => g.id_persoon !== profiel?.pbholland_id)
              .map((g) => (
                <div key={g.id_persoon} className="rij">
                  <span className="rij-icoon">
                    <RefreshCw size={15} />
                  </span>
                  <div className="rij-content">
                    <div className="rij-naam">{g.naam || `id ${g.id_persoon}`}</div>
                    <div className="rij-sub">
                      {[
                        g.vereniging,
                        g.pr_overall ? `PR ${g.pr_overall.toFixed(2)} m` : null,
                        `${g.aantal_wedstrijden} wedstrijden`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="rij-acties">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => wisselProfiel(g)}
                      disabled={pbhBezig}
                    >
                      Wissel
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Nieuw profiel koppelen: ingeklapt zolang er al één gekoppeld is. */}
        {profiel?.pbholland_id && !toonNieuw ? (
          <div className="detail-actions">
            <button type="button" className="secondary-button" onClick={() => setToonNieuw(true)}>
              <Plus size={16} style={{ verticalAlign: "-3px" }} /> Ander profiel koppelen
            </button>
          </div>
        ) : (
          <div className="field-list" style={{ marginTop: profiel?.pbholland_id ? 16 : 0 }}>
            <label className="field">
              <span className="field-label">Profiel-URL of id_persoon</span>
              <p className="field-help">
                Zoek een springer op{" "}
                <a href="https://pbholland.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                  pbholland.com
                </a>{" "}
                en plak de URL van de persoonlijke pagina hieronder.
              </p>
              <div className="new-var-name-row">
                <input
                  className="text-input"
                  value={pbhInvoer}
                  onChange={(e) => setPbhInvoer(e.target.value)}
                  placeholder="https://pbholland.com/index.php/persooninfo/?id_persoon=…"
                />
                <button type="button" className="secondary-button" onClick={zoekPbhProfiel} disabled={pbhBezig}>
                  <Search size={16} style={{ verticalAlign: "-3px" }} /> {pbhBezig ? "Bezig…" : "Zoek"}
                </button>
              </div>
            </label>

            {pbhFout && <div className="banner error">{pbhFout}</div>}

            {pbhPreview && (
              <div className="day-card">
                <div className="profiel-head" style={{ gap: 12 }}>
                  <span className="profiel-avatar" style={{ width: 44, height: 44, fontSize: "1rem" }}>
                    {pbhPreview.naam.split(/\s+/).map((d) => d[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: "1.05rem" }}>{pbhPreview.naam}</strong>
                    <p className="muted" style={{ fontSize: "0.85rem" }}>
                      {[pbhPreview.vereniging, pbhPreview.wedstrijdcategorie].filter(Boolean).join(" · ")}
                      {pbhPreview.pr ? ` · PR ${pbhPreview.pr.afstand.toFixed(2)} m` : ""}
                    </p>
                  </div>
                </div>
                <div className="detail-actions">
                  <button type="button" className="primary-button" onClick={koppelPbhProfiel} disabled={pbhBezig}>
                    <Link2 size={16} style={{ verticalAlign: "-3px" }} /> Dit ben ik — koppelen
                  </button>
                  {profiel?.pbholland_id && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setToonNieuw(false);
                        setPbhPreview(null);
                        setPbhInvoer("");
                        setPbhFout(null);
                      }}
                    >
                      Annuleren
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Profiel */}
      <section className="card">
        <div className="section-header">
          <h2>Springersprofiel</h2>
          <p className="muted">Deze waarden voeden het fysica-model voor het theoretisch maximum.</p>
        </div>
        <form onSubmit={bewaarProfiel} className="field-list">
          <div className="two-column-grid">
            <label className="field">
              <span className="field-label">Naam</span>
              <input className="text-input" value={naam} onChange={(e) => setNaam(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Geboortejaar</span>
              <input
                className="text-input"
                inputMode="numeric"
                value={geboortejaar}
                onChange={(e) => setGeboortejaar(e.target.value)}
                placeholder="bijv. 1998"
              />
            </label>
            <label className="field">
              <span className="field-label">Gewicht (kg)</span>
              <input
                className="text-input"
                inputMode="decimal"
                value={massa}
                onChange={(e) => setMassa(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Springer gestrekt (m)</span>
              <input
                className="text-input"
                inputMode="decimal"
                value={gestrekt}
                onChange={(e) => setGestrekt(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Stoklengte (m)</span>
              <input
                className="text-input"
                inputMode="decimal"
                value={stoklengte}
                onChange={(e) => setStoklengte(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Uitsprongstoot (Ns)</span>
              <input
                className="text-input"
                inputMode="decimal"
                value={stoot}
                onChange={(e) => setStoot(e.target.value)}
              />
            </label>
          </div>
          <div className="detail-actions">
            <button type="submit" className="primary-button" disabled={bezig}>
              {bezig ? "Bezig…" : "Profiel opslaan"}
            </button>
          </div>
        </form>
      </section>

      {/* Schansen */}
      <section className="card">
        <div className="section-header">
          <h2>Schansen</h2>
          <p className="muted">
            Waterdiepte en schanshoogte bepalen de berekening; lat/lon wordt gebruikt voor winddata.
          </p>
        </div>

        <div className="rij-lijst">
          {schansen.map((schans) => (
            <div key={schans.id} className="rij">
              <span className="rij-icoon">
                <MapPin size={15} />
              </span>
              <div className="rij-content">
                <div className="rij-naam">{schans.naam}</div>
                <div className="rij-sub">
                  {schans.locatie || "—"} · water {schans.waterdiepte_m} m · schans {schans.schanshoogte_m} m
                </div>
              </div>
              <div className="rij-acties">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Schans ${schans.naam} bewerken`}
                  onClick={() => {
                    setBewerkId(schans.id);
                    setSchansVorm(naarVorm(schans));
                  }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  aria-label={`Schans ${schans.naam} verwijderen`}
                  onClick={() => verwijderSchans(schans)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {bewerkId === null ? (
          <div className="detail-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setBewerkId("nieuw");
                setSchansVorm(LEGE_SCHANS);
              }}
            >
              <Plus size={16} style={{ verticalAlign: "-3px" }} /> Nieuwe schans
            </button>
          </div>
        ) : (
          <form onSubmit={bewaarSchans} className="field-list" style={{ marginTop: 16 }}>
            <div className="section-header" style={{ marginBottom: 0 }}>
              <div className="settings-row">
                <h2 style={{ fontSize: "1rem" }}>
                  {bewerkId === "nieuw" ? "Nieuwe schans" : "Schans bewerken"}
                </h2>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Sluiten"
                  onClick={() => setBewerkId(null)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="two-column-grid">
              <label className="field">
                <span className="field-label">Naam</span>
                <input
                  className="text-input"
                  value={schansVorm.naam}
                  onChange={(e) => setSchansVorm({ ...schansVorm, naam: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Locatie</span>
                <input
                  className="text-input"
                  value={schansVorm.locatie}
                  onChange={(e) => setSchansVorm({ ...schansVorm, locatie: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">Waterdiepte (m)</span>
                <input
                  className="text-input"
                  inputMode="decimal"
                  value={schansVorm.waterdiepte_m}
                  onChange={(e) => setSchansVorm({ ...schansVorm, waterdiepte_m: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">Schanshoogte (m)</span>
                <input
                  className="text-input"
                  inputMode="decimal"
                  value={schansVorm.schanshoogte_m}
                  onChange={(e) => setSchansVorm({ ...schansVorm, schanshoogte_m: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">Latitude</span>
                <input
                  className="text-input"
                  inputMode="decimal"
                  value={schansVorm.lat}
                  onChange={(e) => setSchansVorm({ ...schansVorm, lat: e.target.value })}
                  placeholder="bijv. 51.9706"
                />
              </label>
              <label className="field">
                <span className="field-label">Longitude</span>
                <input
                  className="text-input"
                  inputMode="decimal"
                  value={schansVorm.lon}
                  onChange={(e) => setSchansVorm({ ...schansVorm, lon: e.target.value })}
                  placeholder="bijv. 4.7964"
                />
              </label>
            </div>
            <div className="detail-actions">
              <button type="submit" className="primary-button" disabled={bezig}>
                {bezig ? "Bezig…" : bewerkId === "nieuw" ? "Schans toevoegen" : "Schans opslaan"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Uitloggen */}
      <section className="card">
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>Account</strong>
            <p className="settings-row-help muted">Log uit op dit apparaat.</p>
          </div>
          <button type="button" className="settings-logout" onClick={uitloggen}>
            <LogOut size={15} /> Uitloggen
          </button>
        </div>
      </section>
    </main>
  );
}
