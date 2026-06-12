import { proxyJson } from "@/app/api/_lib/backend";

export async function GET() {
  return proxyJson("/schansen");
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyJson("/schansen", { method: "POST", body });
}
