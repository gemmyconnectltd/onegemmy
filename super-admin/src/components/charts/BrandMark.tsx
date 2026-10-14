"use client";

// Real branding for the admin pie-chart legends. Colored dots are swapped
// for something recognisable per category:
//   - country       → the actual flag emoji (from the static `world-countries`
//                     dataset — same source the register form's country list
//                     uses, so names always line up)
//   - heard_about   → the real app logo (Instagram/WhatsApp/Google/Google Ads)
//   - industry      → a lucide icon per sector
//   - business_type → a lucide icon per legal form
// Everything else (plans, status) keeps its plain colored dot.
//
// Brand SVGs are hand-embedded from simple-icons `viewBox="0 0 24 24"` paths
// with their official brand colors, so we avoid adding a dependency just for
// a handful of logos.
import { createElement } from "react";
import {
  ShoppingBag, Truck, Factory, Wrench, Utensils, Cpu, Wheat, HardHat,
  Stethoscope, GraduationCap, Briefcase, UserRound, Users, Building2,
  FileQuestion,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import worldCountriesData from "world-countries";

export type BrandKind = "none" | "country" | "heard_about" | "industry" | "business_type";

const BRAND_LOGOS: Record<string, { title: string; fill: string; d: string }> = {
  instagram: {
    title: "Instagram",
    fill: "#E4405F",
    d: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  },
  whatsapp: {
    title: "WhatsApp",
    fill: "#25D366",
    d: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  },
  google: {
    title: "Google",
    fill: "#4285F4",
    d: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z",
  },
  googleads: {
    title: "Google Ads",
    fill: "#4285F4",
    d: "M3.9998 22.9291C1.7908 22.9291 0 21.1383 0 18.9293s1.7908-3.9998 3.9998-3.9998 3.9998 1.7908 3.9998 3.9998-1.7908 3.9998-3.9998 3.9998zm19.4643-6.0004L15.4632 3.072C14.3586 1.1587 11.9121.5028 9.9988 1.6074S7.4295 5.1585 8.5341 7.0718l8.0009 13.8567c1.1046 1.9133 3.5511 2.5679 5.4644 1.4646 1.9134-1.1046 2.568-3.5511 1.4647-5.4644zM7.5137 4.8438L1.5645 15.1484A4.5 4.5 0 0 1 4 14.4297c2.5597-.0075 4.6248 2.1585 4.4941 4.7148l3.2168-5.5723-3.6094-6.25c-.4499-.7793-.6322-1.6394-.5878-2.4784z",
  },
  facebook: {
    title: "Facebook",
    fill: "#1877F2",
    d: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  },
};

function heardAboutLogo(name: string): { title: string; fill: string; d: string } | null {
  const n = name.toLowerCase();
  if (n.includes("instagram")) return BRAND_LOGOS.instagram;
  if (n.includes("facebook")) return BRAND_LOGOS.facebook;
  if (n.includes("whatsapp")) return BRAND_LOGOS.whatsapp;
  if (n.includes("advertis")) return BRAND_LOGOS.googleads;
  if (n.includes("social") || n.includes("media")) return BRAND_LOGOS.instagram;
  if (n.includes("friend") || n.includes("colleague") || n.includes("referr")) return BRAND_LOGOS.whatsapp;
  if (n.includes("search")) return BRAND_LOGOS.google;
  return null;
}

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  retail: ShoppingBag,
  wholesale: Truck,
  manufacturing: Factory,
  services: Wrench,
  hospitality: Utensils,
  technology: Cpu,
  agriculture: Wheat,
  construction: HardHat,
  healthcare: Stethoscope,
  education: GraduationCap,
};

function industryIcon(name: string): LucideIcon | null {
  const n = name.toLowerCase();
  for (const [key, icon] of Object.entries(INDUSTRY_ICONS)) {
    if (n.includes(key)) return icon;
  }
  return null;
}

const BIZ_TYPE_ICONS: Record<string, LucideIcon> = {
  sole: UserRound,
  partnership: Users,
  llc: Building2,
  limited: Building2,
  unregistered: FileQuestion,
};

function bizTypeIcon(name: string): LucideIcon | null {
  const n = name.toLowerCase();
  for (const [key, icon] of Object.entries(BIZ_TYPE_ICONS)) {
    if (n.includes(key)) return icon;
  }
  return null;
}

const COUNTRY_FLAGS = new Map<string, string>();
for (const c of worldCountriesData as { name: { common: string }; flag: string; cca2: string; cca3: string; altSpellings?: string[] }[]) {
  COUNTRY_FLAGS.set(c.name.common.toLowerCase(), c.flag);
  COUNTRY_FLAGS.set(c.cca2.toLowerCase(), c.flag);
  COUNTRY_FLAGS.set(c.cca3.toLowerCase(), c.flag);
  for (const alt of c.altSpellings ?? []) COUNTRY_FLAGS.set(alt.toLowerCase(), c.flag);
}

/** Best-effort name → flag-emoji lookup; falls back to null (keep the dot). */
export function countryFlag(name: string): string | null {
  if (!name) return null;
  return COUNTRY_FLAGS.get(name.trim().toLowerCase()) ?? null;
}

export function BrandMark({
  kind, name, color, size = 12,
}: {
  kind: BrandKind;
  name: string;
  /** Legend slice color — used as the dot for plain kinds and the icon tint. */
  color?: string;
  size?: number;
}) {
  if (kind === "country") {
    const flag = countryFlag(name);
    if (flag) {
      return (
        <span className="flex-shrink-0 leading-none" aria-label={name} title={name} style={{ fontSize: size + 2 }}>
          {flag}
        </span>
      );
    }
  }

  if (kind === "heard_about") {
    const logo = heardAboutLogo(name);
    if (logo) {
      return (
        <svg viewBox="0 0 24 24" role="img" aria-label={logo.title}
          className="flex-shrink-0" width={size} height={size} fill={logo.fill}>
          <title>{logo.title}</title>
          <path d={logo.d} />
        </svg>
      );
    }
  }

  if (kind === "industry" || kind === "business_type") {
    const lookup = kind === "industry" ? industryIcon(name) : bizTypeIcon(name);
    const Icon = lookup ?? (kind === "industry" ? Briefcase : null);
    if (Icon) {
      return createElement(Icon, { size, className: "flex-shrink-0", style: { color }, strokeWidth: 2.2 });
    }
  }

  return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />;
}