import type { Metadata } from "next";
import { Mail, MapPin, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Contact - OneGemmy",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-32 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Get in Touch
          </h1>
          <p className="text-lg text-muted mb-12 max-w-xl mx-auto">
            Questions about OneGemmy, need help choosing a plan, or want to
            talk about your business&apos;s specific needs? We&apos;d love to
            hear from you.
          </p>

          <div className="grid sm:grid-cols-2 gap-6 max-w-xl mx-auto">
            <div className="bg-card p-6 rounded-xl border border-border text-left">
              <div className="w-10 h-10 rounded-lg bg-[#6f1a07]/10 flex items-center justify-center mb-3">
                <Mail size={20} className="text-[#6f1a07]" />
              </div>
              <h3 className="font-bold text-foreground mb-1.5">Email us</h3>
              <p className="text-sm text-muted mb-3">
                For sales, support, or anything else.
              </p>
              <a
                href="mailto:info@gemmyconnect.com"
                className="text-sm font-semibold text-[#6f1a07] hover:underline"
              >
                info@gemmyconnect.com
              </a>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border text-left">
              <div className="w-10 h-10 rounded-lg bg-[#6f1a07]/10 flex items-center justify-center mb-3">
                <MapPin size={20} className="text-[#6f1a07]" />
              </div>
              <h3 className="font-bold text-foreground mb-1.5">Based in</h3>
              <p className="text-sm text-muted">
                Rwanda, serving businesses across East Africa.
              </p>
            </div>
          </div>

          <div className="mt-12">
            <a
              href="mailto:info@gemmyconnect.com?subject=OneGemmy%20inquiry"
              className="bg-[#6f1a07] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#591506] transition-colors inline-flex items-center justify-center gap-2"
            >
              Send Us an Email
              <ArrowRight size={20} />
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
