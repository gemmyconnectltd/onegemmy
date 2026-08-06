import { NextRequest, NextResponse } from "next/server";
import { isMobileHost } from "@/lib/mobileHost";

// Mobile-app subdomains (Next.js 16: proxy, formerly middleware).
// Point e.g. shop.onegemmy.com or m.onegemmy.com at the same deployment and
// phone users always land in the /m/* mobile experience — the ERP pages are
// never shown there. The main domain keeps serving both surfaces.
//
// On the main domain, visiting /m/* sets an `app_surface=mobile` cookie so the
// dynamic PWA manifest (see app/manifest.json/route.ts) hands out the mobile
// manifest — an install from the mobile app opens the mobile app, not the ERP.
const AUTH_PATHS = new Set(["/login", "/register", "/forgot-password"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  if (isMobileHost(host)) {
    if (pathname === "/m" || pathname.startsWith("/m/")) return NextResponse.next();

    // Auth screens exist under /m/login; everything else collapses to the
    // mobile home (the mobile app's internal nav stays under /m/* untouched).
    const target = AUTH_PATHS.has(pathname) ? "/m/login" : "/m";
    const protocol = new URL(request.url).protocol;
    const url = new URL(target, `${protocol}//${host}`);
    return NextResponse.redirect(url);
  }

  if (pathname === "/m" || pathname.startsWith("/m/")) {
    const res = NextResponse.next();
    res.cookies.set("app_surface", "mobile", {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)",
  ],
};
