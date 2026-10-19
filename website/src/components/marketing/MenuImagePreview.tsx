"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/ui/LogoMark";
import { navigationMedia } from "@/lib/navigation-media.generated";
import type { MarketingNavItem } from "@/lib/navigation";

interface Frame { src: string; alt: string; kind: "screenshot" | "photo"; position: string; }
export function MenuImagePreview({ item, onNavigate }: { item: MarketingNavItem; onNavigate: () => void }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Frame | null>(null);
  const media = item.image;
  if (!media) return null;
  const primary = navigationMedia[media.src];
  const fallback = navigationMedia[media.fallback];
  const isPrimary = primary && !failed.includes(primary);
  const source = isPrimary ? primary : fallback && !failed.includes(fallback) ? fallback : null;
  const frame: Frame | null = source ? {
    src: source, alt: isPrimary ? media.alt : media.fallbackAlt,
    kind: isPrimary ? media.kind : "screenshot", position: isPrimary ? media.position ?? "50% 50%" : "50% 50%",
  } : null;
  const pending = !!frame && loaded?.src !== frame.src;
  const imageClass = (kind: Frame["kind"]) => `transition-opacity duration-150 motion-reduce:transition-none ${kind === "photo" ? "object-cover" : "object-contain p-2"}`;
  return <aside data-menu-preview data-preview-id={item.id} data-preview-source={source ?? "unavailable"} data-preview-fallback={!isPrimary} className="sticky top-0 self-start overflow-hidden rounded-xl border border-border bg-surface">
    <div className="relative aspect-[8/5] overflow-hidden bg-white" aria-busy={pending}>
      {!loaded && <div className="absolute inset-0 flex items-center justify-center bg-primary/5 text-accent" aria-hidden="true"><LogoMark size={36} /></div>}
      {frame && loaded && pending && <Image src={loaded.src} alt="" aria-hidden="true" fill sizes="320px" className={imageClass(loaded.kind)} style={{ objectPosition: loaded.position }} />}
      {frame ? <Image key={frame.src} src={frame.src} alt={frame.alt} fill sizes="(min-width: 1280px) 320px, 260px" loading="eager" className={`${imageClass(frame.kind)} ${pending ? "opacity-0" : "opacity-100"}`} style={{ objectPosition: frame.position }} onLoad={() => setLoaded(frame)} onError={() => setFailed(current => current.includes(frame.src) ? current : [...current, frame.src])} /> : <div role="img" aria-label="Image preview unavailable" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary/5 text-accent"><LogoMark size={36} /><span className="text-xs text-muted">Preview unavailable</span></div>}
      {pending && <span role="status" className="absolute bottom-2 left-2 rounded-lg border border-border bg-white px-2 py-1 text-xs text-muted">Loading preview…</span>}
    </div>
    <div className="space-y-2 border-t border-border bg-white p-4"><h3 className="text-sm font-semibold text-foreground">{item.title}</h3><p className="text-xs leading-5 text-muted">{item.description}</p>
      {!isPrimary && source && <p className="text-xs text-muted">Related view: {media.fallbackLabel}</p>}
      {isPrimary && media.kind === "screenshot" && media.src.includes("-menu-current") && <p className="text-xs text-muted">Cropped interface preview · data redacted</p>}
      <Link href={item.href} onClick={onNavigate} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-accent hover:underline">Explore {item.title}<ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  </aside>;
}
