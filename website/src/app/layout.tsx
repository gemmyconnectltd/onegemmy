import type { Metadata, Viewport } from "next";
import { Comfortaa, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/lib/site";
import { VisitTracker } from "@/components/marketing/VisitTracker";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Official brand font (brand pack: Light, Regular, Bold), used for headings.
const comfortaa = Comfortaa({ variable: "--font-comfortaa", subsets: ["latin"], weight: ["300", "400", "700"], display: "swap" });

// Pinch-zoom stays enabled on the public site (accessibility).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16A34A",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: `${siteConfig.name} - ERP & Business Management Platform`, template: `%s | ${siteConfig.name}` },
  description: `${siteConfig.name} is an all-in-one ERP platform for point of sale, inventory, accounting, HR, and CRM — unified in a single system.`,
  keywords: ["ERP", "business management", "point of sale", "POS system", "CRM", "inventory management", "accounting", "HR management", siteConfig.name],
  authors: [{ name: siteConfig.company }],
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/apple-icon.png",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: `${siteConfig.name} - Business Management Tool`,
    description: "All-in-one business management platform for sales, inventory, accounting, HR, and more.",
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: "en_US",
    type: "website",
    images: [{ url: "/branding/pesaa-social-card.jpg", width: 1200, height: 630, alt: "Pesaa — Manage smarter. Operate efficiently. Grow confidently." }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} - Business Management Tool`,
    description: "All-in-one business management platform for sales, inventory, accounting, HR, and more.",
    images: ["/branding/pesaa-social-card.jpg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${comfortaa.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}<VisitTracker /></body>
    </html>
  );
}
