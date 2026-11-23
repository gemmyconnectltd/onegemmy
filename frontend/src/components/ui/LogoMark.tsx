import Image from "next/image";
import { BRAND_MARKS } from "./BrandLogo";

interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Accepted for existing callers; the official mark has no stroke. */
  strokeWidth?: number;
  /** "white" (default) sits on the brand-coloured tile, which follows the business's own theme colour; "color" is the
   *  two-tone mark for white backgrounds. */
  variant?: keyof typeof BRAND_MARKS;
}

/** The official Pesaa star mark (brand pack artwork), square and never stretched. Decorative: the brand name is always
 *  given next to it or by the surrounding link. */
export function LogoMark({ size = 16, className, variant = "white" }: LogoMarkProps) {
  return <Image src={BRAND_MARKS[variant]} alt="" aria-hidden="true" width={size} height={size} unoptimized className={className} />;
}
