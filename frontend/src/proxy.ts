import { NextRequest, NextResponse } from "next/server";
import { isMobileHost } from "@/lib/mobileHost";

// Mobile-app subdomains (Next.js 16: proxy, formerly middleware).
// The mobile app is its own separate deployment (the root mobile/ project),
// not a route group inside this one — visiting shop.pesaa.com / m.pesaa.com
// / mobile.pesaa.com (or a host listed in MOBILE_APP_HOSTS) externally
// redirects there instead of rendering anything from this deployment.
//
// MOBILE_APP_URL must be set to that deployment's own URL for the redirect to
// fire; until it is, mobile hosts just fall through to the normal ERP pages
// on this deployment rather than 404ing.
const AUTH_PATHS = new Set(["/login", "/register", "/forgot-password"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;
  const mobileAppUrl = process.env.MOBILE_APP_URL;

  if (isMobileHost(host) && mobileAppUrl) {
    const target = AUTH_PATHS.has(pathname) ? "/login" : "/";
    return NextResponse.redirect(new URL(target, mobileAppUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)",
  ],
};
