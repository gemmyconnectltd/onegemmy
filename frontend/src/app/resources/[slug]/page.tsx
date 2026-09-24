import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Clock, ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/config";
import { blogPosts, getBlogPost } from "@/lib/blogPosts";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  return { title: post ? `${post.title} - ${siteConfig.name}` : `Resources - ${siteConfig.name}` };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const related = blogPosts.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#052e16] via-[#14532d] to-[#166534]">
        <div className="max-w-3xl mx-auto">
          <Link href="/resources" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white transition-colors mb-8">
            <ArrowLeft size={14} />
            Back to Resources
          </Link>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <post.icon size={17} className="text-[#4ade80]" />
            </div>
            <span className="text-xs font-semibold text-[#4ade80] uppercase tracking-wide">{post.category}</span>
            <span className="text-xs text-white/50 flex items-center gap-1">
              <Clock size={12} />
              {post.readTime}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">{post.title}</h1>
        </div>
      </section>

      {/* Cover image */}
      <section className="px-4 sm:px-6 lg:px-8 -mt-10 relative">
        <div className="max-w-3xl mx-auto">
          <div className="relative aspect-[16/9] rounded-2xl overflow-hidden shadow-lg border border-border">
            <Image src={post.image} alt={post.title} fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
          </div>
        </div>
      </section>

      {/* Article body */}
      <section className="pt-12 pb-16 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto space-y-5">
          {post.body.map((p, i) => (
            <p key={i} className="text-muted leading-relaxed text-[15px]">{p}</p>
          ))}
        </article>
      </section>

      {/* More articles */}
      {related.length > 0 && (
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-surface">
          <div className="max-w-3xl mx-auto">
            <p className="text-sm font-semibold text-[#16a34a] uppercase tracking-wide mb-6">More from Resources</p>
            <div className="grid sm:grid-cols-2 gap-5">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/resources/${r.slug}`}
                  className="group bg-card border border-border rounded-xl p-5 hover:border-[#16a34a]/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <r.icon size={15} className="text-[#16a34a]" />
                    <span className="text-xs font-semibold text-[#16a34a] uppercase tracking-wide">{r.category}</span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground leading-snug group-hover:text-[#16a34a] transition-colors">
                    {r.title}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
