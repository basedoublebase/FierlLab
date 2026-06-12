import { proxyJson } from "@/app/api/_lib/backend";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/wedstrijden/${id}/pogingen`, { method: "POST", body });
}
