import { NextRequest, NextResponse } from "next/server";
import { isMobileHost } from "@/lib/mobileHost";

// Dynamic PWA manifest (served at /manifest.json). The mobile app gets a
// mobile-focused manifest — start_url /m, portrait, mobile shortcuts — so an
// install from the mobile app opens the mobile app. Everything else keeps the
// ERP manifest. Mobile surface is detected by host (shop.*/m.*/mobile.* or
// MOBILE_APP_HOSTS) or by the `app_surface=mobile` cookie set by the proxy
// when visiting /m/* on the main domain.

const ICONS = [
  { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png" },
  { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
  { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png" },
  { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png" },
  { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
  { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
  { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png" },
  { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
];

const MOBILE_MANIFEST = {
  name: "OneGemmy Shop",
  short_name: "OneGemmy",
  description:
    "OneGemmy mobile — sell, track inventory, and run your shop from your phone.",
  start_url: "/m",
  display: "standalone",
  background_color: "#f8f8f6",
  theme_color: "#6f1a07",
  orientation: "portrait",
  scope: "/m",
  lang: "en",
  categories: ["business", "productivity", "finance"],
  icons: ICONS,
  shortcuts: [
    {
      name: "Sell",
      url: "/m/pos",
      description: "Start a new sale",
    },
    {
      name: "Transactions",
      url: "/m/transactions",
      description: "Recent transactions",
    },
    {
      name: "Reports",
      url: "/m/stats",
      description: "Sales reports",
    },
    {
      name: "Inventory",
      url: "/m/inventory",
      description: "Stock levels",
    },
  ],
};

const ERP_MANIFEST = {
  name: "OneGemmy - Business Management",
  short_name: "OneGemmy",
  description:
    "All-in-one business management platform for sales, inventory, finance, HR, projects, and CRM.",
  start_url: "/dashboard",
  display: "standalone",
  background_color: "#f8f8f6",
  theme_color: "#6f1a07",
  orientation: "any",
  scope: "/",
  lang: "en",
  categories: ["business", "productivity", "finance"],
  icons: ICONS,
  screenshots: [],
  shortcuts: [
    {
      name: "Dashboard",
      url: "/dashboard",
      description: "View your business dashboard",
    },
    {
      name: "Sales",
      url: "/sales",
      description: "Manage your sales pipeline",
    },
    {
      name: "Inventory",
      url: "/inventory",
      description: "Manage your stock",
    },
    {
      name: "Finance",
      url: "/finance",
      description: "View financial reports",
    },
  ],
};

export function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const surface = request.cookies.get("app_surface")?.value;
  const mobile = isMobileHost(host) || surface === "mobile";

  return NextResponse.json(mobile ? MOBILE_MANIFEST : ERP_MANIFEST, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
