import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/lib/site";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-icon.png" },
  formatDetection: { telephone: false },
  openGraph: {
    title: `${siteConfig.name} - Business Management Tool`,
    description: "All-in-one business management platform for sales, inventory, accounting, HR, and more.",
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} - Business Management Tool`,
    description: "All-in-one business management platform for sales, inventory, accounting, HR, and more.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
