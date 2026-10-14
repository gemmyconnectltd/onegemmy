// The product (this app) is one of three deployments: the public website, this customer app and the Super Admin
// portal. Links that leave this app go through these settings, never hardcoded domains.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://pesaa.io").replace(/\/+$/, "");
export const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.pesaa.io").replace(/\/+$/, "");
