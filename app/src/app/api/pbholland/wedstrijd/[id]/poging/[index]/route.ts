import { proxyJson } from "@/app/api/_lib/backend";

type Params = { params: Promise<{ id: string; index: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id, index } = await params;
  const body = await request.text();
  return proxyJson(`/pbholland/wedstrijd/${id}/poging/${index}`, { method: "PUT", body });
}
