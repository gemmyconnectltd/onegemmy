import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { AppConfigProvider } from "@/lib/appConfig";
import { Providers } from "./providers";
import MobileShell from "./shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#6f1a07",
};

export const metadata: Metadata = {
  title: "OneGemmy - Business Management Tool | Gemmy Connect Ltd",
  description:
    "OneGemmy is an all-in-one business management platform by Gemmy Connect Ltd. Manage sales, inventory, finance, HR, projects, and CRM from a single dashboard.",
  keywords: [
    "business management",
    "CRM",
    "inventory management",
    "sales pipeline",
    "project management",
    "accounting",
    "HR management",
    "OneGemmy",
    "Gemmy Connect",
  ],
  authors: [{ name: "Gemmy Connect Ltd" }],
  icons: {
    apple: "/icons/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OneGemmy",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "OneGemmy - Business Management Tool",
    description:
      "All-in-one business management platform for sales, inventory, finance, HR, and more.",
    url: "https://onegemmy.com",
    siteName: "OneGemmy",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OneGemmy - Business Management Tool",
    description:
      "All-in-one business management platform for sales, inventory, finance, HR, and more.",
  },
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
        <Providers>
          <AppConfigProvider>
            <AuthProvider>
              <MobileShell>{children}</MobileShell>
            </AuthProvider>
          </AppConfigProvider>
        </Providers>
      </body>
    </html>
  );
}
