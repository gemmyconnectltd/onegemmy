"use client";
import Image, { type ImageProps } from "next/image";
import { useId } from "react";
import { DesignedProductScreen } from "./DesignedProductScreen";

/** Feature-specific, deliberately illustrated UI is fitted to the device screen. */
export function BusinessProductImage({ screen, ...props }: ImageProps & { screen?: string }) {
  const clipId = useId();
  return <div className={`absolute inset-0 ${screen ? "origin-[50%_0%] scale-[1.15]" : ""}`}><Image {...props} quality={props.quality ?? 85} alt={props.alt} />{screen && <svg data-device-screen aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${props.className?.includes("opacity-0") ? "opacity-0" : "opacity-100"}`} viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid slice"><defs><clipPath id={clipId}><polygon points="567,608 969,608 976,831 567,834" /></clipPath></defs><g clipPath={`url(#${clipId})`}><DesignedProductScreen feature={screen.match(/\/([^/]+?)-(?:menu-)?current\.webp/)?.[1] ?? "pos"} /></g></svg>}</div>;
}
