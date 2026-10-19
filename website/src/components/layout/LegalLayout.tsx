import { PageHero } from "@/components/marketing/PageHero";
import type { ReactNode } from "react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="pesaa-landing marketing-page min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>
      <PageHero eyebrow="Trust & transparency" title={title} description={`Last updated: ${lastUpdated}`} />
      <article className="landing-section px-5 sm:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="space-y-8 text-foreground/80 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mb-3 [&_h2]:mt-2 [&_p]:mb-4 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-[var(--primary)] [&_a]:underline [&_a]:underline-offset-2">
            {children}
          </div>
        </div>
      </article>
      </main>
      <Footer />
    </div>
  );
}
