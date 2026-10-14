// Website-only settings. The product (customer app) and Super Admin are separate deployments with their own
// domains, so every "Sign In" / "Get Started" link is built from NEXT_PUBLIC_APP_URL, never hardcoded.

export const siteConfig = {
  name: "Pesaa",
  title: "Pesaa — ERP & Business Management Platform",
  description:
    "An all-in-one ERP platform for point of sale, inventory, accounting, and HR — built to scale from a single location to a multi-branch operation.",
  company: "Pesaa",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://pesaa.io",
  links: {
    github: "https://github.com/gemmyconnectltd",
    linkedin: "https://linkedin.com/company/gemmyconnectltd",
  },
};

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Absolute URL of a page in the customer app, e.g. appUrl("/register") → https://app.pesaa.io/register */
export function appUrl(path: string): string {
  return `${APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
