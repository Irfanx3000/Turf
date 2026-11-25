import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/my-bookings", "/notifications", "/profile", "/checkout", "/booking-success",
  "/tenant", "/admin",
];

/**
 * Lightweight gate: redirects to /login when the session cookie is absent.
 * This is UX routing only — every API call is authenticated server-side;
 * no page trusts this check for data access.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const hasSession =
    request.cookies.has("turf_session") ||
    (request.headers.get("authorization") ?? "").startsWith("Bearer ");
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  // Keep query string (e.g. booking id) so progress survives sign-in.
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|placeholders|manifest.webmanifest|sw.js|offline).*)"],
};
