import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: `Careers - ${siteConfig.name}`,
};

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-32 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Careers at {siteConfig.name}
          </h1>
          <p className="text-lg text-muted mb-8 leading-relaxed">
            We&apos;re a small team building business management software
            for companies across East Africa. We don&apos;t have open roles
            listed right now, but we&apos;re always glad to hear from people
            who want to build with us.
          </p>
          <a
            href={`mailto:info@pesaa.io?subject=Interested%20in%20joining%20${siteConfig.name}`}
            className="bg-[#6f1a07] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#591506] transition-colors inline-flex items-center justify-center gap-2"
          >
            <Mail size={20} />
            Introduce Yourself
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
