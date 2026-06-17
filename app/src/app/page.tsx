"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUp, CalendarDays, Clock, MapPin, RefreshCw, Trophy, Wind } from "lucide-react";

import { type PbhAankomend, type PbhWind, fetchPbhAankomend, fetchPbhWindNu } from "@/lib/api";
import { WedstrijdDetail } from "@/app/_components/wedstrijd-detail";
import { formatDatum } from "@/lib/date";
import { kompasRichting } from "@/lib/fysica";

export default function InvullenPage() {
  const [wedstrijden, setWedstrijden] = useState<PbhAankomend[]>([]);
  const [vandaag, setVandaag] = useState<string>("");
  const [gekozenId, setGekozenId] = useState<number | null>(null);
  const [laden, setLaden] = useState(true);
  const [nietGekoppeld, setNietGekoppeld] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const [windNu, setWindNu] = useState<PbhWind | null>(null);
  const [windLaden, setWindLaden] = useState(false);
  const [windFout, setWindFout] = useState<string | null>(null);

  useEffect(() => {
    let actief = true;
    fetchPbhAankomend()
      .then((data) => {
        if (!actief) return;
        setVandaag(data.vandaag);
        const lijst = data.wedstrijden.filter((w) => w.id_wedstrijd !== null);
        setWedstrijden(lijst);
        const vandaagWed = lijst.find((w) => w.datum === data.vandaag);
        setGekozenId(vandaagWed?.id_wedstrijd ?? lijst[0]?.id_wedstrijd ?? null);
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

  const gekozen = useMemo(
    () => wedstrijden.find((w) => w.id_wedstrijd === gekozenId) ?? null,
    [wedstrijden, gekozenId]
  );

  function haalWind(plaats: string) {
    setWindLaden(true);
    setWindFout(null);
    setWindNu(null);
    fetchPbhWindNu(plaats)
      .then(setWindNu)
      .catch((e) => setWindFout(e instanceof Error ? e.message : "Wind ophalen mislukt."))
      .finally(() => setWindLaden(false));
  }

  useEffect(() => {
    if (gekozen?.plaats) haalWind(gekozen.plaats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gekozen?.plaats]);

  if (laden) {
    return (
      <main className="shell">
        <div className="card loading-card">
          <p className="muted">Laden…</p>
        </div>
      </main>
    );
  }

  if (nietGekoppeld) {
    return (
      <main className="shell">
        <header className="hero">
          <p className="eyebrow">Vandaag</p>
          <h1>Invullen</h1>
        </header>
        <div className="card">
          <div className="koppel-leeg">
            <Trophy size={30} />
            <p>Koppel je pbholland-profiel om je wedstrijden van vandaag te zien.</p>
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

  const isVandaag = gekozen?.datum === vandaag;
  const kompas = windNu?.windrichting_graden != null ? kompasRichting(windNu.windrichting_graden) : null;

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Vandaag</p>
        <h1>Invullen</h1>
      </header>

      {fout && <div className="banner error">{fout}</div>}

      {wedstrijden.length === 0 ? (
        <div className="card">
          <p className="muted">Geen aankomende wedstrijden gevonden waarvoor je bent aangemeld.</p>
        </div>
      ) : (
        <>
          {/* Selectie */}
          <section className="card" style={{ marginTop: 0 }}>
            <label className="field">
              <span className="field-label">Wedstrijd</span>
              <select
                className="text-input"
                value={gekozenId ?? ""}
                onChange={(e) => setGekozenId(Number(e.target.value))}
              >
                {wedstrijden.map((w) => (
                  <option key={w.id_wedstrijd} value={w.id_wedstrijd as number}>
                    {formatDatum(w.datum)} · {w.plaats} · {w.wedstrijd}
                    {w.datum === vandaag ? "  (vandaag)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* Wind nu t.o.v. de schans */}
          <section className="card windnu-card">
            <div className="windnu-head">
              <h2 style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Wind size={18} /> Wind nu{gekozen?.plaats ? ` — ${gekozen.plaats}` : ""}
              </h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Wind verversen"
                onClick={() => gekozen?.plaats && haalWind(gekozen.plaats)}
                disabled={windLaden}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            {windLaden ? (
              <p className="muted">Wind ophalen…</p>
            ) : windFout ? (
              <p className="muted">{windFout}</p>
            ) : windNu ? (
              (() => {
                const schansRel = windNu.orientatie_graden != null && windNu.windrichting_graden != null;
                const rotatie =
                  windNu.windrichting_graden == null
                    ? null
                    : schansRel
                      ? ((windNu.windrichting_graden + 180 - (windNu.orientatie_graden as number)) % 360 + 360) % 360
                      : (windNu.windrichting_graden + 180) % 360;
                return (
                  <>
                    <div className="windnu-body">
                      <span
                        className="windnu-pijl"
                        style={rotatie != null ? { transform: `rotate(${rotatie}deg)` } : undefined}
                      >
                        <ArrowUp size={26} />
                      </span>
                      <div>
                        <div>
                          <span className="windnu-waarde">{windNu.wind_ms} m/s</span>
                          {windNu.windtype && <span className={`windnu-type ${windNu.windtype}`}>{windNu.windtype}</span>}
                        </div>
                        <div className="windnu-sub">
                          {[
                            kompas ? `uit ${kompas}` : null,
                            windNu.windvlagen_ms != null ? `vlagen ${windNu.windvlagen_ms} m/s` : null,
                            windNu.wind_station ? `station ${windNu.wind_station}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    </div>
                    <div className="windnu-sub" style={{ marginTop: 8 }}>
                      Pijl wijst waar de wind heen waait — {schansRel ? "↑ = jouw springrichting" : "↑ = noord (schans-oriëntatie onbekend)"}
                    </div>
                  </>
                );
              })()
            ) : (
              <p className="muted">Geen winddata beschikbaar.</p>
            )}
          </section>

          {/* Gekozen wedstrijd */}
          {gekozen && (
            <>
              <section className="card">
                <div className="wed-detail-kop">
                  <div style={{ minWidth: 0 }}>
                    <div className="wed-datum">
                      <CalendarDays size={12} style={{ verticalAlign: "-2px" }} /> {formatDatum(gekozen.datum)}
                      {gekozen.tijd ? ` · ` : ""}
                      {gekozen.tijd && <><Clock size={12} style={{ verticalAlign: "-2px" }} /> {gekozen.tijd.slice(0, 5)}</>}
                      {isVandaag && <span className="vandaag-badge">vandaag</span>}
                    </div>
                    <h2 style={{ marginTop: 4 }}>{gekozen.wedstrijd}</h2>
                    <div className="wed-plaats" style={{ marginTop: 4 }}>
                      <MapPin size={13} /> {gekozen.plaats}
                    </div>
                  </div>
                </div>
              </section>

              {gekozen.id_wedstrijd !== null && (
                <WedstrijdDetail idWedstrijd={gekozen.id_wedstrijd} toonHeader={false} />
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
