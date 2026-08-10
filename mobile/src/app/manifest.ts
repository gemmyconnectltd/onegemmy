import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OneGemmy Mobile - Business Management",
    short_name: "OneGemmy",
    description:
      "OneGemmy mobile app. Sell, track stock, and manage your business on the go by Gemmy Connect Ltd.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f8f6",
    theme_color: "#6f1a07",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png" },
      { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
      { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png" },
      { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png" },
      { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Sell", url: "/pos", icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }] },
      { name: "Reports", url: "/stats", icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }] },
      { name: "Transactions", url: "/transactions", icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }] },
      { name: "Inventory", url: "/inventory", icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }] },
    ],
  };
}
