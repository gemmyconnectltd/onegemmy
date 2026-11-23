import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { siteConfig } from "@/lib/site";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  /** Where clicking the logo navigates. Defaults to the marketing home page. */
  href?: string;
  variant?: "color" | "white";
}

const heights = { sm: 24, md: 30, lg: 36 };

/** The official Pesaa logo as a home link. */
export function Logo({ size = "md", href = "/", variant = "color" }: LogoProps) {
  return (
    <Link href={href} aria-label={`${siteConfig.name} home`} className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <BrandLogo variant={variant} height={heights[size]} />
    </Link>
  );
}
