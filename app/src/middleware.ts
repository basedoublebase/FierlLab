import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check for Supabase auth cookie
  const hasAuthCookie = request.cookies.getAll().some(
    (cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")
  );

  if (!hasAuthCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
