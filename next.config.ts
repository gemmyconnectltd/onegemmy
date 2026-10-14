import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Product pages live on the app domain (app.pesaa.io). Old links on the website domain keep working.
  async redirects() {
    const app = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    return ["login", "register", "forgot-password", "reset-password", "dashboard"].map((p) => ({
      source: `/${p}`,
      destination: `${app}/${p}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
