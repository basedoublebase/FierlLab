// Client-side API wrapper. Alle calls gaan via de Next.js /api proxy-routes,
// die het Supabase-token meesturen naar de FastAPI-backend.

export type Profiel = {
  naam: string;
  geboortejaar: number | null;
  massa_kg: number;
  springer_gestrekt_m: number;
  stoklengte_m: number;
  uitsprongstoot_ns: number;
  pbholland_id: number | null;
};

export type Schans = {
  id: number;
  naam: string;
  locatie: string;
  lat: number | null;
  lon: number | null;
  knmi_station_id: string | null;
  waterdiepte_m: number;
  schanshoogte_m: number;
};

export type Poging = {
  id: number;
  nummer: number;
  stok_op_m: number | null;
  afstand_m: number | null;
  wind_ms: number | null;
  windrichting_graden: number | null;
  timestamp: string;
};

export type Wedstrijd = {
  id: number;
  datum: string;
  categorie: string;
  pbholland_wedstrijd_id: number | null;
  schans: Schans;
  pogingen: Poging[];
};

export type WindResult = {
  wind_ms: number;
  windrichting_graden: number | null;
  bron: string;
};

const API_BASE_URL = "/api";

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") {
        message = body.detail;
      }
    } catch {
      // Ignore invalid JSON and keep the fallback message.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(buildApiUrl(path), init);
}

async function jsonRequest<T>(path: string, method: string, payload?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return parseJson<T>(response);
}

async function deleteRequest(path: string): Promise<void> {
  const response = await apiFetch(path, { method: "DELETE" });
  if (!response.ok) {
    let message = `Verwijderen mislukt (status ${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") message = body.detail;
    } catch { /* ignore */ }
    throw new Error(message);
  }
}

// Korte client-cache zodat tab-wissels niet steeds opnieuw fetchen.
const CACHE_TTL_MS = 60_000;
type CacheEntry<T> = { data: T; ts: number };
let wedstrijdenCache: CacheEntry<Wedstrijd[]> | null = null;
let schansenCache: CacheEntry<Schans[]> | null = null;
let profielCache: CacheEntry<Profiel> | null = null;

export function invalidateWedstrijdenCache(): void {
  wedstrijdenCache = null;
}

export function invalidateSchansenCache(): void {
  schansenCache = null;
}

export function invalidateProfielCache(): void {
  profielCache = null;
}

export async function fetchProfiel(): Promise<Profiel> {
  if (profielCache && Date.now() - profielCache.ts < CACHE_TTL_MS) {
    return profielCache.data;
  }
  const response = await apiFetch("/profiel", { cache: "no-store" });
  const data = await parseJson<Profiel>(response);
  profielCache = { data, ts: Date.now() };
  return data;
}

export async function updateProfiel(payload: Partial<Profiel>): Promise<Profiel> {
  const data = await jsonRequest<Profiel>("/profiel", "PUT", payload);
  profielCache = { data, ts: Date.now() };
  return data;
}

export async function fetchSchansen(): Promise<Schans[]> {
  if (schansenCache && Date.now() - schansenCache.ts < CACHE_TTL_MS) {
    return schansenCache.data;
  }
  const response = await apiFetch("/schansen", { cache: "no-store" });
  const data = await parseJson<Schans[]>(response);
  schansenCache = { data, ts: Date.now() };
  return data;
}

export async function createSchans(payload: Omit<Schans, "id">): Promise<Schans> {
  invalidateSchansenCache();
  return jsonRequest<Schans>("/schansen", "POST", payload);
}

export async function updateSchans(id: number, payload: Partial<Omit<Schans, "id">>): Promise<Schans> {
  invalidateSchansenCache();
  return jsonRequest<Schans>(`/schansen/${id}`, "PATCH", payload);
}

export async function deleteSchans(id: number): Promise<void> {
  invalidateSchansenCache();
  return deleteRequest(`/schansen/${id}`);
}

export async function fetchWedstrijden(): Promise<Wedstrijd[]> {
  if (wedstrijdenCache && Date.now() - wedstrijdenCache.ts < CACHE_TTL_MS) {
    return wedstrijdenCache.data;
  }
  const response = await apiFetch("/wedstrijden", { cache: "no-store" });
  const data = await parseJson<Wedstrijd[]>(response);
  wedstrijdenCache = { data, ts: Date.now() };
  return data;
}

export async function fetchWedstrijd(id: number | string): Promise<Wedstrijd> {
  const response = await apiFetch(`/wedstrijden/${id}`, { cache: "no-store" });
  return parseJson<Wedstrijd>(response);
}

export type WedstrijdPayload = {
  datum: string;
  schans_id: number;
  categorie?: string;
  pbholland_wedstrijd_id?: number | null;
};

export async function createWedstrijd(payload: WedstrijdPayload): Promise<Wedstrijd> {
  invalidateWedstrijdenCache();
  return jsonRequest<Wedstrijd>("/wedstrijden", "POST", payload);
}

export async function updateWedstrijd(id: number, payload: Partial<WedstrijdPayload>): Promise<Wedstrijd> {
  invalidateWedstrijdenCache();
  return jsonRequest<Wedstrijd>(`/wedstrijden/${id}`, "PATCH", payload);
}

export async function deleteWedstrijd(id: number): Promise<void> {
  invalidateWedstrijdenCache();
  return deleteRequest(`/wedstrijden/${id}`);
}

export async function createPoging(
  wedstrijdId: number,
  payload: { stok_op_m?: number | null; afstand_m?: number | null; timestamp?: string }
): Promise<Poging> {
  invalidateWedstrijdenCache();
  return jsonRequest<Poging>(`/wedstrijden/${wedstrijdId}/pogingen`, "POST", payload);
}

export async function updatePoging(
  id: number,
  payload: {
    stok_op_m?: number | null;
    afstand_m?: number | null;
    wind_ms?: number | null;
    windrichting_graden?: number | null;
  }
): Promise<Poging> {
  invalidateWedstrijdenCache();
  return jsonRequest<Poging>(`/pogingen/${id}`, "PATCH", payload);
}

export async function deletePoging(id: number): Promise<void> {
  invalidateWedstrijdenCache();
  return deleteRequest(`/pogingen/${id}`);
}

// ── pbholland ────────────────────────────────────────────────────────────

export type PbhPrPerSeizoen = { jaar: number; seizoensbeste: number; pr_tot: number };
export type PbhBesteSchans = { plaats: string; afstand: number; datum: string };

export type PbhStatistieken = {
  id_persoon: number;
  id_springer: number | null;
  naam: string;
  vereniging: string;
  woonplaats: string;
  categorie: string;
  wedstrijdcategorie: string;
  rugnummer: string;
  bond: string;
  ranking: number | null;
  titels: number | null;
  dagtitels: number | null;
  pr_overall: number | null;
  aantal_wedstrijden: number;
  aantal_sprongen: number | null;
  pr: { afstand: number; datum: string; plaats: string } | null;
  seizoensrecord: { afstand: number; jaar: number; verschil: number | null; vorig_jaar: number | null } | null;
  pr_per_seizoen: PbhPrPerSeizoen[];
  beste_per_schans: PbhBesteSchans[];
  gemiddelde_uitslag: number | null;
  gemiddelde_afwijking: number | null;
};

export async function fetchPbhStatistieken(): Promise<PbhStatistieken> {
  const response = await apiFetch("/pbholland/statistieken", { cache: "no-store" });
  return parseJson<PbhStatistieken>(response);
}

export async function previewPbhProfiel(idPersoon: number, naam?: string): Promise<PbhStatistieken> {
  const params = new URLSearchParams({ id_persoon: String(idPersoon) });
  if (naam) params.set("naam", naam);
  const response = await apiFetch(`/pbholland/preview?${params.toString()}`, { cache: "no-store" });
  return parseJson<PbhStatistieken>(response);
}

export async function fetchWind(schansId: number, timestamp: string): Promise<WindResult> {
  const response = await apiFetch(
    `/wind?schans_id=${schansId}&timestamp=${encodeURIComponent(timestamp)}`,
    { cache: "no-store" }
  );
  return parseJson<WindResult>(response);
}
