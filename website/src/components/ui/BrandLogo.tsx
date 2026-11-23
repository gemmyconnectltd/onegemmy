import Image from "next/image";

/** Official Pesaa logo files (public/branding/), cropped from the brand pack's vector artwork. Their natural width to
 *  height ratio is kept everywhere, so the logo is never stretched. */
export const BRAND_LOGOS = {
  /** Green "pesaa" with the two-tone star — on white or light backgrounds. */
  color: { src: "/branding/pesaa-logo-horizontal.svg", ratio: 3.515 },
  /** All white — on the green or navy brand backgrounds. */
  white: { src: "/branding/pesaa-logo-horizontal-white.svg", ratio: 3.515 },
} as const;

export const BRAND_MARKS = {
  color: "/branding/pesaa-mark.svg",
  white: "/branding/pesaa-mark-white.svg",
} as const;

/** The horizontal Pesaa logo at a given height (px). Width follows the official proportions. */
export function BrandLogo({ variant = "color", height = 32, priority = false, className }: {
  variant?: keyof typeof BRAND_LOGOS; height?: number; priority?: boolean; className?: string;
}) {
  const logo = BRAND_LOGOS[variant];
  // A className (e.g. responsive heights such as "h-7 sm:h-8 w-auto") takes over sizing from the height prop.
  return (
    <Image
      src={logo.src}
      alt="Pesaa"
      width={Math.round(height * logo.ratio)}
      height={height}
      priority={priority}
      unoptimized
      className={className}
      style={className ? undefined : { height, width: "auto" }}
    />
  );
}
