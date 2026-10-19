import { PageHero } from "@/components/marketing/PageHero";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Clock } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/site";
import { blogPosts } from "@/lib/blogPosts";

export const metadata: Metadata = {
  title: `Resources - ${siteConfig.name}`,
};

export default function ResourcesPage() {
  return (
    <div className="pesaa-landing marketing-page min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>

      <PageHero eyebrow="Resources for your business" title={<>Insights on Sales, Inventory, and Financial Operations</>} description={<>Practical guidance for business owners, drawn directly from building this platform.</>} image="/marketing/cafe-owner.webp" imageAlt="Illustrative café owner at work" />

      {/* Article cards */}
      <section className="landing-section px-5 sm:px-8">
        <div className="max-w-[1176px] mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/resources/${post.slug}`}
                className="group bg-card border border-border rounded-2xl overflow-hidden flex flex-col hover:border-[var(--primary)]/40 hover:shadow-md transition-all"
              >
                <div className="relative aspect-[16/10] bg-surface">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    sizes="(min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-[var(--primary)] uppercase tracking-wide">{post.category}</span>
                    <span className="text-xs text-muted flex items-center gap-1 ml-auto">
                      <Clock size={12} />
                      {post.readTime}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-foreground mb-2 leading-snug group-hover:text-[var(--primary)] transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-sm text-muted leading-relaxed">{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
