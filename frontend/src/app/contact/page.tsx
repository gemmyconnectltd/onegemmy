import type { Metadata } from "next";
import { Mail, MapPin } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ContactForm } from "@/components/marketing/ContactForm";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: `Contact - ${siteConfig.name}`,
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-32 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Contact Our Team
            </h1>
            <p className="text-lg text-muted max-w-xl mx-auto">
              Have questions about {siteConfig.name}, need help selecting a plan,
              or want to discuss your business&apos;s specific requirements?
              We&apos;re here to help.
            </p>
          </div>

          <div className="grid lg:grid-cols-5 gap-8 max-w-5xl mx-auto">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card p-6 rounded-xl border border-border">
                <div className="w-10 h-10 rounded-lg bg-[#16a34a]/10 flex items-center justify-center mb-3">
                  <Mail size={20} className="text-[#16a34a]" />
                </div>
                <h3 className="font-bold text-foreground mb-1.5">Email Us</h3>
                <p className="text-sm text-muted mb-3">
                  For sales inquiries, support, or general questions.
                </p>
                <a
                  href="mailto:info@pesaa.io"
                  className="text-sm font-semibold text-[#16a34a] hover:underline"
                >
                  info@pesaa.io
                </a>
              </div>

              <div className="bg-card p-6 rounded-xl border border-border">
                <div className="w-10 h-10 rounded-lg bg-[#16a34a]/10 flex items-center justify-center mb-3">
                  <MapPin size={20} className="text-[#16a34a]" />
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

      <Footer />
    </div>
  );
}
