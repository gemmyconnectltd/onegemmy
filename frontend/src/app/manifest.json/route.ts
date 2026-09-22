import { NextResponse } from "next/server";
import { siteConfig } from "@/lib/config";

// Dynamic PWA manifest (served at /manifest.json). This deployment only ever
// serves the ERP surface now — the mobile app is its own separate deployment
// (see the root mobile/ project, which serves its own manifest via
// src/app/manifest.ts) — so there's no host/cookie branching here anymore.

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

const ERP_MANIFEST = {
  name: `${siteConfig.name} - Business Management`,
  short_name: siteConfig.name,
  description:
    "All-in-one business management platform for sales, inventory, accounting, HR, projects, and CRM.",
  start_url: "/dashboard",
  display: "standalone",
  background_color: "#f8f8f6",
  theme_color: "#16a34a",
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
      name: "Accounting",
      url: "/accounting",
      description: "View financial reports",
    },
  ],
};

export function GET() {
  return NextResponse.json(ERP_MANIFEST, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
