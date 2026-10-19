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

export function GlobalReach({ compact = false }: { compact?: boolean }) {
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
              className={`inline-flex items-center gap-2 bg-card border border-border text-foreground/80 rounded-full ${compact ? "px-3 py-1.5 text-[11px]" : "px-3.5 py-2 text-sm"}`}
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
