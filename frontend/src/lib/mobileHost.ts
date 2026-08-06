// Mobile-app host detection shared by the proxy (subdomain routing) and the
// dynamic PWA manifest. Matches host prefixes ("shop.", "m.", "mobile.") so
// local dev works out of the box with shop.localhost:3000, and can be extended
// with exact domains via the MOBILE_APP_HOSTS env var (comma-separated).
const MOBILE_HOST_PREFIXES = ["shop.", "m.", "mobile."];

export function isMobileHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0];
  if (MOBILE_HOST_PREFIXES.some((p) => h.startsWith(p))) return true;
  const extra = process.env.MOBILE_APP_HOSTS;
  if (extra) {
    const hosts = extra
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return hosts.some((d) => h === d || h.endsWith(`.${d}`));
  }
  return false;
}
