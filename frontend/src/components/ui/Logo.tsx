import Link from "next/link";
import { Layers } from "lucide-react";
import { siteConfig } from "@/lib/config";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  /** Where clicking the logo navigates. Defaults to the marketing home page. */
  href?: string;
}

const containerSizes = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-12 h-12",
};

const textSizes = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
};

export function Logo({ size = "md", href = "/" }: LogoProps) {
  return (
    <Link href={href} className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg">
      <div
        className={`${containerSizes[size]} bg-foreground rounded-xl flex items-center justify-center`}
      >
        <Layers className="text-white" size={size === "sm" ? 14 : size === "md" ? 18 : 22} />
      </div>
      <div>
        <span className={`${textSizes[size]} font-bold block leading-none text-foreground`}>
          {siteConfig.name}
        </span>

      </div>
    </Link>
  );
}
