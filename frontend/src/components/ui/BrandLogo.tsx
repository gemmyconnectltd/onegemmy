import Image from "next/image";

/** Official Pesaa logo files (public/branding/), from the brand pack's vector artwork. Their natural width to height
 *  ratio is kept everywhere, so the logo is never stretched. */
export const BRAND_LOGOS = {
  /** Green "pesaa" with the two-tone star — on white or light backgrounds. */
  color: { src: "/branding/pesaa-logo-horizontal.svg", ratio: 3.515 },
  /** All white — on green or dark backgrounds. */
  white: { src: "/branding/pesaa-logo-horizontal-white.svg", ratio: 3.515 },
} as const;

export const BRAND_MARKS = {
  color: "/branding/pesaa-mark.svg",
  white: "/branding/pesaa-mark-white.svg",
} as const;

/** The horizontal Pesaa logo at a given height (px). Width follows the official proportions. */
export function BrandLogo({ variant = "auto", height = 32, priority = false, className }: {
  /** "auto" (default): full colour in light mode, white in dark mode, where the navy parts would disappear. */
  variant?: keyof typeof BRAND_LOGOS | "auto"; height?: number; priority?: boolean; className?: string;
}) {
  if (variant === "auto") {
    return (
      <span className="inline-flex">
        <BrandLogo variant="color" height={height} priority={priority} className={`dark:hidden ${className ?? ""}`.trim()} />
        <BrandLogo variant="white" height={height} priority={priority} className={`hidden dark:block ${className ?? ""}`.trim()} />
      </span>
    );
  }
  const logo = BRAND_LOGOS[variant];
  return (
    <Image
      src={logo.src}
      alt="Pesaa"
      width={Math.round(height * logo.ratio)}
      height={height}
      priority={priority}
      unoptimized
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
