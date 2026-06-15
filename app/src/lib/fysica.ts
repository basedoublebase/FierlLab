// Fysica-model voor het theoretisch maximum van een sprong.
//
// Exacte port van de Excel van de gebruiker (VoorBas_volledig.xlsx, Blad1):
// 1. Hoek-sweep 90°→1°: vind de optimale uitspronghoek door de balistische
//    afstand (slingerenergie + afzetimpuls) te maximaliseren.
// 2. Tijdstap-integratie (dt=0.02s) mét luchtweerstand vanaf het uitsprongpunt
//    tot de landing op het zandbed → totale afstand.
// Gevalideerd: stok_op=10.5, massa_springer=88, L=13.25, impuls=40, schans 4.0/1.7
// → begin stok 5.16 m, hoek 44°, totaal 19.85 m (gelijk aan de spreadsheet).

export interface FysicaConfig {
  massa_kg: number; // massa springer
  stoklengte_m: number;
  uitsprongstoot_ns: number; // impuls afzet
  springer_gestrekt_m: number;
  waterdiepte_m: number;
  schanshoogte_m: number;
  massa_polsstok_kg: number;
  snelheid_overgaan_ms: number;
  wind_ms: number; // - is tegenwind
  cw: number;
  eff_opp_m2: number;
}

export const FYSICA_DEFAULTS: FysicaConfig = {
  massa_kg: 88,
  stoklengte_m: 13.25,
  uitsprongstoot_ns: 40,
  springer_gestrekt_m: 2.43,
  waterdiepte_m: 1.7,
  schanshoogte_m: 4.0,
  massa_polsstok_kg: 20,
  snelheid_overgaan_ms: 0,
  wind_ms: 0,
  cw: 1,
  eff_opp_m2: 0.15,
};

export interface SprongBerekening {
  theoretisch_max_m: number;
  begin_stok_afstand_m: number;
  optimale_hoek_graden: number;
  h_eff_m: number; // uitspronghoogte boven het zandbed
}

const g = 9.81;

export function berekenSprongMax(stok_op: number, config: FysicaConfig): SprongBerekening | null {
  const {
    massa_kg: mspringer,
    stoklengte_m: L,
    uitsprongstoot_ns: impuls,
    springer_gestrekt_m: springerGestrekt,
    waterdiepte_m: waterdiepte,
    schanshoogte_m: schanshoogte,
    massa_polsstok_kg: mstok,
    snelheid_overgaan_ms: vovergaan,
    wind_ms: wind,
    cw: CW,
    eff_opp_m2: Effopp,
  } = config;

  const zandbed = waterdiepte + 0.05;
  const hoogteVingers = schanshoogte + springerGestrekt;
  if (!Number.isFinite(stok_op) || stok_op <= hoogteVingers) return null;

  const pythagoras = Math.sqrt(stok_op * stok_op - hoogteVingers * hoogteVingers);
  const l7 = (springerGestrekt / hoogteVingers) * pythagoras;
  const stokafstand = pythagoras - l7;

  const peTop = 0.5 * mstok * g * L + mspringer * g * L;
  const inertia = (1 / 3) * mstok * L * L + mspringer * L * L;
  const vafzet = impuls / mspringer;
  const luchtw = 0.5 * CW * Effopp * 1.293;

  // Pass 1: optimale uitspronghoek zoeken.
  let best: { ag: number; vx: number; vy: number; hoek: number; hoogte: number } | null = null;
  for (let a = 90; a >= 1; a--) {
    const rad = (a * Math.PI) / 180;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);
    const E = sinA * L;
    const F = E - zandbed;
    const H = cosA * L;
    const iPe = 0.5 * mstok * g * E + mspringer * g * E;
    const omegaTop = vovergaan / L;
    const lKeu = peTop + 0.5 * inertia * omegaTop * omegaTop - iPe;
    if (lKeu < 0) continue;
    const O = Math.sqrt((2 * lKeu) / inertia) * L;
    const Q = sinA * O;
    const R = cosA * O;
    const X = cosA * vafzet;
    const Y = sinA * vafzet;
    const Z = Q + X;
    const AA = R - Y;
    const disc = AA * AA + 2 * g * F;
    if (disc < 0 || F < 0) continue;
    const AD = (-AA + Math.sqrt(disc)) / g;
    const AG = H + Z * AD + stokafstand;
    if (best === null || AG > best.ag) {
      best = { ag: AG, vx: Z, vy: AA, hoek: a, hoogte: F };
    }
  }
  if (best === null) return null;

  // Pass 2: tijdstap-integratie met luchtweerstand tot landing op het zandbed.
  const dt = 0.02;
  let az = best.hoogte;
  let vy = best.vy;
  let vx = best.vx;
  let ay = 0;
  const basis = stokafstand + L * Math.cos((best.hoek * Math.PI) / 180);
  let totaal: number | null = null;
  for (let i = 0; i < 5000; i++) {
    const fwrx = -luchtw * (vx - wind) * (vx - wind) * (vx - wind >= 0 ? 1 : -1);
    const awx = fwrx / mspringer;
    const awy = (mspringer * g - luchtw * vy * vy) / mspringer;
    const ayNext = ay + dt * vx;
    const azNext = az - dt * vy;
    if (azNext <= 0) {
      totaal = basis + ayNext;
      break;
    }
    ay = ayNext;
    az = azNext;
    vy = vy + dt * awy;
    vx = vx + dt * awx;
  }
  if (totaal === null) return null;

  return {
    theoretisch_max_m: Math.round(totaal * 100) / 100,
    begin_stok_afstand_m: Math.round(stokafstand * 100) / 100,
    optimale_hoek_graden: best.hoek,
    h_eff_m: Math.round(best.hoogte * 100) / 100,
  };
}

const KOMPAS = [
  "N", "NNO", "NO", "ONO", "O", "OZO", "ZO", "ZZO",
  "Z", "ZZW", "ZW", "WZW", "W", "WNW", "NW", "NNW",
];

export function kompasRichting(graden: number | null | undefined): string | null {
  if (graden === null || graden === undefined || !Number.isFinite(graden)) return null;
  const index = Math.round((((graden % 360) + 360) % 360) / 22.5) % 16;
  return KOMPAS[index];
}

export function benutting(afstand: number, theoretischMax: number): number | null {
  if (!Number.isFinite(afstand) || !Number.isFinite(theoretischMax) || theoretischMax <= 0) return null;
  return Math.round((afstand / theoretischMax) * 1000) / 10;
}
