import { proxyJson } from "@/app/api/_lib/backend";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  return proxyJson(`/pogingen/${id}/knmi-wind`, { method: "POST" });
}
