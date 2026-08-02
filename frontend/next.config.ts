import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Force deep-import code splitting for icon libs that Next doesn't
    // optimize by default; lucide-react is in Next's default list too.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
