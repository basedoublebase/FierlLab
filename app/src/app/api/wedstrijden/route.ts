import { proxyJson } from "@/app/api/_lib/backend";

export async function GET() {
  return proxyJson("/wedstrijden");
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyJson("/wedstrijden", { method: "POST", body });
}
