import { proxyJson } from "@/app/api/_lib/backend";

export async function GET() {
  return proxyJson("/profiel");
}

export async function PUT(request: Request) {
  const body = await request.text();
  return proxyJson("/profiel", { method: "PUT", body });
}
