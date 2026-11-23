import Image from "next/image";
import { BRAND_MARKS } from "./BrandLogo";

interface LogoMarkProps {
  size?: number;
  className?: string;
  /** "white" on the green or navy brand backgrounds; the two-tone mark everywhere else. */
  variant?: keyof typeof BRAND_MARKS;
}

/** The official Pesaa star mark on its own (brand pack artwork), square and never stretched. Decorative: the brand
 *  name is always given next to it or by the surrounding link. */
export function LogoMark({ size = 16, className, variant = "color" }: LogoMarkProps) {
  return <Image src={BRAND_MARKS[variant]} alt="" aria-hidden="true" width={size} height={size} unoptimized className={className} />;
}
