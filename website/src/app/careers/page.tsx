import { PageHero } from "@/components/marketing/PageHero";
import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `Careers - ${siteConfig.name}`,
};

export default function CareersPage() {
  return (
    <div className="pesaa-landing marketing-page min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>
      <PageHero eyebrow="Build with us" title={`Careers at ${siteConfig.name}`} description={<>We&apos;re a lean team building enterprise-grade business
            management software for companies across East Africa. We
            don&apos;t have open positions listed at the moment, but we
            welcome inquiries from people interested in joining us.</>} />

      <section className="landing-section px-5 sm:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <a
            href={`mailto:info@pesaa.io?subject=Interested%20in%20joining%20${siteConfig.name}`}
            className="landing-button px-6 py-3 text-sm"
          >
            <Mail size={20} />
            Introduce Yourself
          </a>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
