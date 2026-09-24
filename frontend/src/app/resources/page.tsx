import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Clock } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/config";
import { blogPosts } from "@/lib/blogPosts";

export const metadata: Metadata = {
  title: `Resources - ${siteConfig.name}`,
};

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <Image
          src="/verticals/grocery.jpg"
          alt="Inside a real small shop, shelves stocked with everyday products"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Insights on Sales, Inventory, and Financial Operations
          </h1>
          <p className="text-lg text-white/70">
            Practical guidance for business owners, drawn directly from building this platform.
          </p>
        </div>
      </section>

      {/* Article cards */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/resources/${post.slug}`}
                className="group bg-card border border-border rounded-2xl overflow-hidden flex flex-col hover:border-[#16a34a]/40 hover:shadow-md transition-all"
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
                    <span className="text-xs font-semibold text-[#16a34a] uppercase tracking-wide">{post.category}</span>
                    <span className="text-xs text-muted flex items-center gap-1 ml-auto">
                      <Clock size={12} />
                      {post.readTime}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-foreground mb-2 leading-snug group-hover:text-[#16a34a] transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-sm text-muted leading-relaxed">{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
