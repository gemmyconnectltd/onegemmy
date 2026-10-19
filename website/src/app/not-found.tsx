import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/marketing/PageHero";

export default function NotFound() {
  return (
    <div className="pesaa-landing min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>
        <PageHero eyebrow="Page not found" title="Let’s get you back on track" description="We couldn’t find the page you’re looking for." />
        <div className="landing-container landing-section text-center"><Link href="/" className="landing-button px-6 py-3 text-sm">Back to home</Link></div>
      </main>
      <Footer />
    </div>
  );
}
