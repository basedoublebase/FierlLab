"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  type Profiel,
  type Schans,
  createSchans,
  deleteSchans,
  fetchProfiel,
  fetchSchansen,
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

  useEffect(() => {
    let actief = true;
    Promise.all([fetchProfiel(), fetchSchansen()])
      .then(([p, s]) => {
        if (!actief) return;
        setProfiel(p);
        setSchansen(s);
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
