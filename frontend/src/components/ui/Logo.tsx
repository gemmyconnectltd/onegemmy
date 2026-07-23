import { Layers } from "lucide-react";

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
  const iconSizes = {
    sm: 18,
    md: 24,
    lg: 32,
  };

  const textSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
  };

  const containerSizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-14 h-14",
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`${containerSizes[size]} bg-[#1E3A5F] rounded-xl flex items-center justify-center shadow-lg shadow-[#1E3A5F]/20`}
      >
        <Layers className="text-white" size={iconSizes[size]} />
      </div>
      {showText && (
        <div className="flex flex-col">
          <span
            className={`${textSizes[size]} font-bold text-[#1E3A5F] leading-none`}
          >
            OneGemmy
          </span>
          <span className="text-[10px] text-[#64748B] font-medium tracking-wider uppercase">
            by Gemmy Connect
          </span>
        </div>
      )}
    </div>
  );
}
