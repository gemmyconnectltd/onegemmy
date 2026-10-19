import type { ReactNode } from "react";
import Image from "next/image";

interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  image?: string;
  imageAlt?: string;
}

export function PageHero({ eyebrow, title, description, image, imageAlt = "" }: PageHeroProps) {
  return (
    <section className="border-b border-border bg-gradient-to-b from-white to-[var(--primary-light)]">
      <div className={`landing-container landing-section ${image ? "grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]" : "text-center"}`}>
        <div className={image ? "" : "mx-auto max-w-3xl text-center"}>
          <p className={`landing-eyebrow ${image ? "" : "justify-center"}`}><span aria-hidden className="h-1.5 w-1.5 rounded-sm bg-current" />{eyebrow}</p>
          <h1 className="text-[clamp(2rem,3.8vw,3.25rem)] font-extrabold leading-[1.12] tracking-[-0.045em] text-[var(--foreground)] text-balance">{title}</h1>
          <p className={`mt-5 max-w-2xl text-[16px] leading-[1.75] text-slate-500 ${image ? "" : "mx-auto"}`}>{description}</p>
        </div>
        {image && <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface"><Image src={image} alt={imageAlt} fill priority sizes="(min-width: 1240px) 525px, (min-width: 1024px) 45vw, 100vw" className="object-cover" /></div>}
      </div>
    </section>
  );
}
