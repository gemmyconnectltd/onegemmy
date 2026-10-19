import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { AppConfigProvider } from "@/lib/appConfig";
import { Providers } from "./providers";
import { siteConfig } from "@/lib/config";

const geistSans = localFont({
  src: "./fonts/Geist-Variable.ttf",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.ttf",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  fallback: ["monospace"],
  adjustFontFallback: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16A34A",
};

export const metadata: Metadata = {
  title: `${siteConfig.name} - ERP & Business Management Platform`,
  description: `${siteConfig.name} is an all-in-one ERP platform for point of sale, inventory, accounting, HR, and CRM — unified in a single dashboard.`,
  keywords: [
    "ERP",
    "business management",
    "point of sale",
    "POS system",
    "CRM",
    "inventory management",
    "sales pipeline",
    "project management",
    "accounting",
    "HR management",
    siteConfig.name,
  ],
  authors: [{ name: siteConfig.company }],
  manifest: "/manifest.json",
  icons: {
    apple: "/icons/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteConfig.name,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: `${siteConfig.name} - Business Management Tool`,
    description:
      "All-in-one business management platform for sales, inventory, accounting, HR, and more.",
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} - Business Management Tool`,
    description:
      "All-in-one business management platform for sales, inventory, accounting, HR, and more.",
  },
  // The public face of Pesaa is the website project; the product app is not for search engines.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{if(localStorage.getItem("app_theme")==="dark")document.documentElement.classList.add("dark");}catch(e){}})();`}
        </Script>
      </head>
      {process.env.NODE_ENV === "production" && (
        <Script
          id="register-sw"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `if ("serviceWorker" in navigator) { window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); }); }`,
          }}
        />
      )}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers><AppConfigProvider><AuthProvider>{children}</AuthProvider></AppConfigProvider></Providers>
      </body>
    </html>
  );
}
