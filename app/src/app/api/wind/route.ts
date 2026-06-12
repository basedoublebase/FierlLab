import { proxyJson } from "@/app/api/_lib/backend";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return proxyJson(`/wind?${searchParams.toString()}`);
}
