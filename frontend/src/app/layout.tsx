import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  robots: {
    index: true,
    follow: true,
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
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
