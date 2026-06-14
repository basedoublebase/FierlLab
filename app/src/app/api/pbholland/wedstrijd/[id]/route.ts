import { proxyJson } from "@/app/api/_lib/backend";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return proxyJson(`/pbholland/wedstrijd/${id}`);
}
