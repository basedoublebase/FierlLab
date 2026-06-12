const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

export function vandaagISO(): string {
  const nu = new Date();
  const jaar = nu.getFullYear();
  const maand = String(nu.getMonth() + 1).padStart(2, "0");
  const dag = String(nu.getDate()).padStart(2, "0");
  return `${jaar}-${maand}-${dag}`;
}

export function formatDatum(iso: string): string {
  const [jaar, maand, dag] = iso.split("-").map(Number);
  if (!jaar || !maand || !dag) return iso;
  return `${dag} ${MAANDEN[maand - 1]} ${jaar}`;
}

export function formatTijd(isoDatetime: string): string {
  const datum = new Date(isoDatetime.endsWith("Z") || isoDatetime.includes("+") ? isoDatetime : `${isoDatetime}Z`);
  if (Number.isNaN(datum.getTime())) return "";
  return datum.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

export function seizoenVan(isoDatum: string): number {
  return Number(isoDatum.slice(0, 4));
}
