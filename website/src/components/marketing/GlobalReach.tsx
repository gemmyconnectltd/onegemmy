import Image from "next/image";
import { Globe2 } from "lucide-react";

// Countries where businesses use the platform. Each appears once; keep this list in step with reality.
const countries = [
  { name: "Rwanda", code: "rw" },
  { name: "DR Congo", code: "cd" },
  { name: "Uganda", code: "ug" },
  { name: "Tanzania", code: "tz" },
  { name: "Kenya", code: "ke" },
  { name: "Zambia", code: "zm" },
  { name: "Madagascar", code: "mg" },
  { name: "Mozambique", code: "mz" },
  { name: "Burundi", code: "bi" },
  { name: "Malawi", code: "mw" },
  { name: "Somalia", code: "so" },
  { name: "South Africa", code: "za" },
  { name: "Canada", code: "ca" },
  { name: "Poland", code: "pl" },
  { name: "United Kingdom", code: "gb" },
  { name: "United Arab Emirates", code: "ae" },
];

export function GlobalReach({ compact = false, variant = "default" }: { compact?: boolean; variant?: "default" | "strip" | "summary" }) {
  if (variant === "summary") return <div><p className="mb-2 inline-flex rounded-lg bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase text-accent">Global reach & security</p><div className="flex items-center gap-4"><Globe2 size={64} strokeWidth={1.3} className="shrink-0 text-accent" /><div><h2 className="text-xl font-semibold leading-tight">Powering businesses<br /> across <span className="text-accent">{countries.length} countries</span></h2><p className="mt-2 text-xs leading-relaxed text-muted">Connected tools for your growing business.</p></div></div></div>;
  if (variant === "strip") return <section aria-label="Businesses and countries using Pesaa" className="border-y border-primary/5 bg-gradient-to-b from-white to-primary/5 py-8 sm:py-10"><div className="landing-container text-center"><p className="mb-3 inline-flex rounded-lg bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase leading-none text-accent">Our global user experience</p><h2 className="landing-title">Trusted by 15,000+ businesses across</h2><p className="mt-3 text-sm text-muted">{countries.length} countries and growing</p><ul className="mx-auto mt-6 grid max-w-[1190px] grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" aria-label="Countries where businesses use the platform">{countries.map(country=><li key={country.code} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-white bg-white px-3 py-3 text-xs font-medium text-muted shadow-sm sm:text-[13px]"><Image src={`/flags/${country.code}.svg`} alt="" width={28} height={28} unoptimized className="h-7 w-7 shrink-0 rounded-full object-cover" /><span className="min-w-0 break-words text-left leading-snug">{country.name}</span></li>)}</ul></div></section>;

  return (
    <section className={compact ? "border-y border-emerald-50 bg-[#fbfefc] px-5 py-9 sm:px-8" : "py-14 md:py-20 px-4 sm:px-6 lg:px-8 bg-background"}>
      <div className="max-w-5xl mx-auto text-center">
        <p className={`${compact ? "text-[10px] mb-2" : "text-sm mb-3"} font-semibold text-[#16a34a] uppercase tracking-wide inline-flex items-center gap-2`}>
          <Globe2 size={16} aria-hidden /> Our Global User Experience
        </p>
        <h2 className={`${compact ? "text-xl sm:text-2xl" : "text-3xl md:text-4xl"} font-bold text-foreground mb-3 text-balance`}>
          Trusted by 15,000+ businesses across
        </h2>
        <p className={`${compact ? "mb-5 text-xs" : "mb-10"} text-muted`}>{countries.length} countries and growing</p>
        <ul className="flex flex-wrap justify-center gap-2.5" aria-label="Countries where businesses use the platform">
          {countries.map((c) => (
            <li
              key={c.name}
              className={`inline-flex items-center gap-2 bg-card border border-border text-foreground/80 rounded-lg ${compact ? "px-3 py-1.5 text-[11px]" : "px-3.5 py-2 text-sm"}`}
            >
              <Image src={`/flags/${c.code}.svg`} alt="" width={20} height={15} unoptimized className="h-[15px] w-5 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" />
              {c.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
