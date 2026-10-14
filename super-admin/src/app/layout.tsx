import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { siteConfig } from "@/lib/config";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16a34a" };

// An internal tool: never indexed, never previewed.
export const metadata: Metadata = {
  title: siteConfig.title,
  description: "Pesaa platform administration",
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{if(localStorage.getItem("admin_theme")==="dark")document.documentElement.classList.add("dark");}catch(e){}})();`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
