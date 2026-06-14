import { proxyJson } from "@/app/api/_lib/backend";

export async function GET() {
  return proxyJson("/pbholland/wedstrijden");
}
