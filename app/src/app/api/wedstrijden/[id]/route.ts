import { proxyJson } from "@/app/api/_lib/backend";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return proxyJson(`/wedstrijden/${id}`);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/wedstrijden/${id}`, { method: "PATCH", body });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return proxyJson(`/wedstrijden/${id}`, { method: "DELETE" });
}
