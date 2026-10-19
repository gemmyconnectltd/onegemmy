import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { appUrl } from "@/lib/site";

export function CallToAction({ title = "Start with Pesaa today", description = "Bring your business together, get a clearer view of every day, and take your next step with confidence." }: { title?: ReactNode; description?: ReactNode }) {
  return (
    <section className="landing-container py-10 sm:py-12">
      <div className="relative isolate overflow-hidden rounded-2xl bg-[var(--primary-active)] px-7 py-10 sm:px-10 lg:px-12 lg:py-12">
        <Image src="/marketing/business-owner-banner.webp" alt="" aria-hidden fill sizes="(min-width: 1240px) 1176px, 100vw" className="-z-20 object-cover object-[65%_top]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--primary-active)] via-[var(--primary-active)]/95 to-[var(--primary-active)]/30" />
        <div className="max-w-[570px]">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-white/90">Ready to grow your business?</p>
          <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-extrabold leading-tight tracking-tight text-white">{title}</h2>
          <p className="mt-4 max-w-[480px] text-sm leading-relaxed text-white/80">{description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={appUrl("/register")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-bold text-[var(--primary-active)] hover:bg-surface">Get started <ArrowRight size={16} /></a>
            <Link href="/contact" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/40 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">Contact sales</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
