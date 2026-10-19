"use client";
import Image from "next/image";
import { useState } from "react";
import type { NavigationImage } from "@/lib/navigation";
import { navigationMedia } from "@/lib/navigation-media.generated";

/** Full-resolution source images, never enlarged crops from a reference screenshot. */
export function IndustryScenePhoto({ scene }: { scene: NavigationImage }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div role="img" aria-label={scene.alt} className="absolute inset-0 flex items-center justify-center bg-primary/5 text-xs text-muted">Industry image unavailable</div>;
  return <Image src={navigationMedia[scene.src] ?? scene.src} alt={scene.alt} fill quality={85} sizes="(min-width: 1280px) 300px, (min-width: 640px) 50vw, 100vw" className="object-cover" style={{ objectPosition: scene.position ?? "50% 35%" }} onError={() => setFailed(true)} />;
}
