import { PageHero } from "@/components/marketing/PageHero";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Clock, ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/lib/site";
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
    <div className="pesaa-landing marketing-page min-h-screen bg-white text-slate-900">
      <Navbar />
      <main>

      <PageHero eyebrow={post.category} title={post.title} description={<span className="inline-flex items-center gap-2"><Clock size={14} />{post.readTime}</span>} />

      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-0"><Link href="/resources" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:underline"><ArrowLeft size={14} />Back to resources</Link></div>

      {/* Cover image */}
      <section className="px-5 sm:px-8 relative">
        <div className="max-w-3xl mx-auto">
          <div className="relative aspect-[16/9] rounded-2xl overflow-hidden shadow-lg border border-border">
            <Image src={post.image} alt={post.title} fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
          </div>
        </div>
      </section>

      {/* Article body */}
      <section className="pt-12 pb-16 px-5 sm:px-8">
        <article className="max-w-3xl mx-auto space-y-5">
          {post.body.map((p, i) => (
            <p key={i} className="text-muted leading-relaxed text-[15px]">{p}</p>
          ))}
        </article>
      </section>

      {/* More articles */}
      {related.length > 0 && (
        <section className="py-16 px-5 sm:px-8 bg-surface">
          <div className="max-w-3xl mx-auto">
            <p className="text-sm font-semibold text-[var(--primary)] uppercase tracking-wide mb-6">More from Resources</p>
            <div className="grid sm:grid-cols-2 gap-5">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/resources/${r.slug}`}
                  className="group landing-card p-5 hover:border-[var(--primary)]/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <r.icon size={15} className="text-[var(--primary)]" />
                    <span className="text-xs font-semibold text-[var(--primary)] uppercase tracking-wide">{r.category}</span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground leading-snug group-hover:text-[var(--primary)] transition-colors">
                    {r.title}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      </main>
      <Footer />
    </div>
  );
}
