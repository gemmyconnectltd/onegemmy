import { PageHero } from "@/components/marketing/PageHero";
import type { Metadata } from "next";
import { Mail, MapPin } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ContactForm } from "@/components/marketing/ContactForm";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `Contact - ${siteConfig.name}`,
};

export default function ContactPage() {
  return (
    <div className="pesaa-landing marketing-page min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>
      <PageHero eyebrow="Let’s talk" title="Contact our team" description={`Have questions about ${siteConfig.name}, need help selecting a plan, or want to discuss your business’s requirements? We’re here to help.`} />

      <section className="landing-section px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-5 gap-8 max-w-5xl mx-auto">
            <div className="lg:col-span-2 space-y-6">
              <div className="landing-card p-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center mb-3">
                  <Mail size={20} className="text-[var(--primary)]" />
                </div>
                <h3 className="font-bold text-foreground mb-1.5">Email Us</h3>
                <p className="text-sm text-muted mb-3">
                  For sales inquiries, support, or general questions.
                </p>
                <a
                  href="mailto:info@pesaa.io"
                  className="text-sm font-semibold text-[var(--primary)] hover:underline"
                >
                  info@pesaa.io
                </a>
              </div>

              <div className="landing-card p-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center mb-3">
                  <MapPin size={20} className="text-[var(--primary)]" />
                </div>
                <h3 className="font-bold text-foreground mb-1.5">Headquarters</h3>
                <p className="text-sm text-muted">
                  Rwanda, serving businesses across East Africa.
                </p>
              </div>
            </div>

            <div className="lg:col-span-3">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
