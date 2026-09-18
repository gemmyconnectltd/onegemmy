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
    <div className="min-h-screen bg-background">
      <Navbar />
      <article className="pt-32 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">{title}</h1>
          <p className="text-sm text-muted mb-12">Last updated: {lastUpdated}</p>
          <div className="space-y-8 text-foreground/80 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mb-3 [&_h2]:mt-2 [&_p]:mb-4 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-[#16a34a] [&_a]:underline [&_a]:underline-offset-2">
            {children}
          </div>
        </div>
      </article>
      <Footer />
    </div>
  );
}
