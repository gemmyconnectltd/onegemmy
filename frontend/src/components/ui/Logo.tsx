import { Layers } from "lucide-react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
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

export function Logo({ size = "md" }: LogoProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${containerSizes[size]} bg-foreground flex items-center justify-center`}
      >
        <Layers className="text-white" size={size === "sm" ? 14 : size === "md" ? 18 : 22} />
      </div>
      <div>
        <span className={`${textSizes[size]} font-bold block leading-none text-foreground`}>
          OneGemmy
        </span>

      </div>
    </div>
  );
}
