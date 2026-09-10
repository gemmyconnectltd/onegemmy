import Image from "next/image";

interface PhoneScreenshotProps {
  src: string;
  alt: string;
  width?: number;
  className?: string;
  priority?: boolean;
}

export function PhoneScreenshot({ src, alt, width = 240, className = "", priority }: PhoneScreenshotProps) {
  const notchWidth = Math.round(width * 0.33);
  const notchHeight = Math.round(width * 0.067);

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width }}>
      <div className="relative bg-[#12100d] rounded-[2.25rem] p-2 shadow-2xl">
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-[#12100d] rounded-full z-10 flex items-center justify-center"
          style={{ top: notchHeight / 2, width: notchWidth, height: notchHeight }}
        >
          <div className="w-1/3 h-1.5 rounded-full bg-white/10" />
        </div>
        <div className="rounded-[1.75rem] overflow-hidden border border-white/5">
          <Image
            src={src}
            alt={alt}
            width={780}
            height={1688}
            sizes={`${width}px`}
            className="w-full h-auto"
            priority={priority}
          />
        </div>
      </div>
    </div>
  );
}
