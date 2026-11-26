import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap first gate for signed-in areas: no session cookie means no page, redirect to /login?next=.
 * The real check (valid, not revoked, not suspended) happens in the layouts through GET /me.
 * Also forwards the path so server layouts can build the `next` target.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has("ss_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname + search);
  return NextResponse.next({ request: { headers } });
}

// Signed-in areas only. Public pages, /login, /verify, assets and /api are untouched.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/welcome/:path*",
    "/journeyguard/:path*",
    // /saferoute and /saferoute/[id] are readable by guests; only these two need an account.
    "/saferoute/new",
    "/saferoute/mine",
    // /automate and /automate/[id] are readable by guests; only these two need an account.
    "/automate/new",
    "/automate/mine",
    // /safealert and /safealert/[id] are readable by guests; only these two need an account.
    "/safealert/new",
    "/safealert/settings",
    "/notifications/:path*",
    "/admin/:path*",
  ],
};
