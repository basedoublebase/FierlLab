// Fysica-model voor het theoretisch maximum van een sprong.
//
// STATUS: approximatie (pendulum + uitsprongstoot), letterlijk overgenomen
// uit het briefing-document.
// Kalibratiepunt uit de briefing: stok_op=11.70, waterdiepte=1.70,
// schanshoogte=4.00, massa=76.1, stoot=120Ns → doel 21.93 m / 6.33 m / 47°.
// Deze formule geeft daarvoor 23.10 m / 6.33 m / 39°: begin-stok klopt exact,
// totaal en hoek wijken af van de geclaimde waarden in het document zelf.
// TODO: vervangen door de exacte Excel-formules zodra die gedeeld zijn.

export interface FysicaConfig {
  massa_kg: number;
  stoklengte_m: number;
  uitsprongstoot_ns: number;
  springer_gestrekt_m: number;
  waterdiepte_m: number;
  schanshoogte_m: number;
}

export const FYSICA_DEFAULTS: FysicaConfig = {
  massa_kg: 76.1,
  stoklengte_m: 13.25,
  uitsprongstoot_ns: 120,
  springer_gestrekt_m: 2.25,
  waterdiepte_m: 1.7,
  schanshoogte_m: 4.0,
};

export interface SprongBerekening {
  theoretisch_max_m: number;
  begin_stok_afstand_m: number;
  optimale_hoek_graden: number;
  h_eff_m: number;
}

const g = 9.81;

export function berekenSprongMax(stok_op: number, config: FysicaConfig): SprongBerekening | null {
  const { massa_kg, uitsprongstoot_ns, waterdiepte_m, schanshoogte_m } = config;

  const h_eff = stok_op - waterdiepte_m - schanshoogte_m;
  if (h_eff <= 0 || !Number.isFinite(h_eff)) return null;

  const h_swing = stok_op - waterdiepte_m;
  // Slingerbeweging (pendulum) — factor 0.52 = energie-efficiëntie
  const v_pend = Math.sqrt(2 * g * h_swing * 0.52);
  // Uitsprongstoot (impulse) — factor 0.42 = overdrachtsefficiëntie
  const v_extra = (uitsprongstoot_ns / massa_kg) * 0.42;
  const v = v_pend + v_extra;

  // Optimale afschiethoek
  const disc = v * v + 2 * g * h_eff;
  const opt_rad = Math.atan(v / Math.sqrt(disc));
  const opt_deg = Math.round(opt_rad * (180 / Math.PI) + 4);

  // Begin stok afstand (horizontaal, vóór het water)
  const h_plant = waterdiepte_m + schanshoogte_m;
  const bsa = Math.sqrt(Math.max(0, stok_op * stok_op - h_plant * h_plant)) * 0.62;

  // Vluchttijd en vliegafstand
  const vx = v * Math.cos(opt_rad);
  const vy = v * Math.sin(opt_rad);
  const t = (vy + Math.sqrt(vy * vy + 2 * g * h_eff)) / g;
  const fly = vx * t;

  const totaal = parseFloat((bsa + fly).toFixed(2));

  return {
    theoretisch_max_m: totaal,
    begin_stok_afstand_m: parseFloat(bsa.toFixed(2)),
    optimale_hoek_graden: opt_deg,
    h_eff_m: parseFloat(h_eff.toFixed(2)),
  };
}

// TODO windcorrectie: ±0.05 m per m/s rugwind op de vliegfase. Vereist de
// sprongrichting van de schans; tot die bekend is tonen we wind alleen als info.

const KOMPAS = [
  "N", "NNO", "NO", "ONO", "O", "OZO", "ZO", "ZZO",
  "Z", "ZZW", "ZW", "WZW", "W", "WNW", "NW", "NNW",
];

export function kompasRichting(graden: number | null | undefined): string | null {
  if (graden === null || graden === undefined || !Number.isFinite(graden)) return null;
  const index = Math.round(((graden % 360) + 360) % 360 / 22.5) % 16;
  return KOMPAS[index];
}

export function benutting(afstand: number, theoretischMax: number): number | null {
  if (!Number.isFinite(afstand) || !Number.isFinite(theoretischMax) || theoretischMax <= 0) return null;
  return Math.round((afstand / theoretischMax) * 1000) / 10;
}
