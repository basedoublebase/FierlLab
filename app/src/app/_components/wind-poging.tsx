"use client";

import { useState } from "react";
import { Wind } from "lucide-react";

import { type Poging, fetchKnmiWind } from "@/lib/api";
import { kompasRichting } from "@/lib/fysica";

export function WindPoging({ poging, onUpdate }: { poging: Poging; onUpdate: (p: Poging) => void }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function ophalen() {
    setBezig(true);
    setFout(null);
    try {
      const bijgewerkt = await fetchKnmiWind(poging.id);
      onUpdate(bijgewerkt);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Wind ophalen mislukt.");
    } finally {
      setBezig(false);
    }
  }

  // KNMI-data aanwezig → toon de gecachete waarden.
  if (poging.wind_station && poging.wind_ms !== null) {
    const kompas = kompasRichting(poging.windrichting_graden);
    const titel = [
      `Station ${poging.wind_station}`,
      poging.wind_station_afstand_km !== null ? `${poging.wind_station_afstand_km} km` : null,
      poging.wind_resolutie === "uur" ? "uurdata" : "10-min",
      poging.wind_gevalideerd ? "gevalideerd" : "ongevalideerd",
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <span className="wind-pill" title={titel}>
        <Wind size={13} />
        {poging.wind_ms} m/s{kompas ? ` ${kompas}` : ""}
        {poging.windvlagen_ms !== null ? ` · vlaag ${poging.windvlagen_ms}` : ""}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
      <button type="button" className="wind-knop" onClick={ophalen} disabled={bezig}>
        <Wind size={13} /> {bezig ? "Ophalen…" : "Wind via KNMI"}
      </button>
      {fout && <span style={{ fontSize: "0.72rem", color: "var(--error)", maxWidth: 220, textAlign: "right" }}>{fout}</span>}
    </span>
  );
}
