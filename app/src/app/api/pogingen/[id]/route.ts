import { proxyJson } from "@/app/api/_lib/backend";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/pogingen/${id}`, { method: "PATCH", body });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return proxyJson(`/pogingen/${id}`, { method: "DELETE" });
}
