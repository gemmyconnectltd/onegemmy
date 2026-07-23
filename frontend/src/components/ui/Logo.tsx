import { siteConfig } from "@/lib/config";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export function Logo({
  size = "md",
  showText = true,
  className = "",
}: LogoProps) {
  const sizes = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  const textSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`${sizes[size]} bg-[${siteConfig.brand.primary}] rounded-lg flex items-center justify-center`}
        style={{ backgroundColor: siteConfig.brand.primary }}
      >
        <span className="text-white font-bold text-lg">O</span>
      </div>
      {showText && (
        <span
          className={`${textSizes[size]} font-bold text-[${siteConfig.brand.primaryDark}]`}
          style={{ color: siteConfig.brand.primaryDark }}
        >
          {siteConfig.name}
        </span>
      )}
    </div>
  );
}
