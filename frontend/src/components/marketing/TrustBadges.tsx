import fs from "fs";
import path from "path";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

// Real, defensible certifications only — no fabricated badges. Add a new
// entry here (with its real logo dropped in public/certifications/) once we
// hold another one; don't pad this out with unverified claims.
const certifications = [
  {
    logo: "/certifications/dpo-rwanda.jpg",
    title: "Data Controller & Data Processor",
    badge: "CERTIFICATION",
    description:
      "Certified to collect, store, and process data under Rwanda's data protection law.",
  },
];

function hasLogoFile(publicPath: string) {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", publicPath));
  } catch {
    return false;
  }
}

export function TrustBadges() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-[#16a34a] uppercase tracking-wide mb-3">
            Certified &amp; Trusted
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Built with your data&apos;s security in mind
          </h2>
        </div>
        <div className="grid gap-5 max-w-3xl mx-auto">
          {certifications.map((c) => (
            <div
              key={c.title}
              className="relative overflow-hidden rounded-2xl border border-border bg-card p-8"
            >
              <div className="absolute -top-8 -right-8 w-32 h-32 bg-gradient-to-br from-border/70 to-transparent rounded-full blur-2xl" />
              <div className="relative">
                {hasLogoFile(c.logo) ? (
                  <Image
                    src={c.logo}
                    alt={c.title}
                    width={160}
                    height={56}
                    className="h-12 w-auto object-contain mb-6"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#16a34a]/10 flex items-center justify-center mb-6">
                    <ShieldCheck size={24} className="text-[#16a34a]" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h3 className="text-xl font-bold text-foreground">{c.title}</h3>
                  <span className="text-xs font-mono font-semibold tracking-wide text-indigo-600 bg-indigo-100 px-3 py-1 rounded-md">
                    {c.badge}
                  </span>
                </div>
                <p className="text-muted leading-relaxed">{c.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
