import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const BACKEND_BASE_URL = (process.env.POLSSTOK_BACKEND_URL ?? "http://127.0.0.1:8021").trim().replace(/\/+$/, "");

export function buildBackendUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_BASE_URL}${normalizedPath}`;
}

async function getAccessToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function proxyJson(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getAccessToken();

  const response = await fetch(buildBackendUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
