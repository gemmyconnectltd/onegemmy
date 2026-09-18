import Image from "next/image";

interface AppScreenshotProps {
  src: string;
  alt: string;
  path: string;
  priority?: boolean;
}

export function AppScreenshot({ src, alt, path, priority }: AppScreenshotProps) {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-[#6f1a07]/10 blur-3xl" />

      <div className="relative bg-[#12100d] rounded-2xl p-1.5 shadow-2xl">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <div className="w-2 h-2 rounded-full bg-white/20" />
          <div className="w-2 h-2 rounded-full bg-white/20" />
          <div className="w-2 h-2 rounded-full bg-white/20" />
          <div className="flex-1 mx-3">
            <div className="bg-white/5 border border-white/10 rounded-md px-3 py-1 text-[11px] text-white/40 text-center">
              pesaa.io/{path}
            </div>
          </div>
        </div>

        <div className="rounded-b-xl overflow-hidden">
          <Image
            src={src}
            alt={alt}
            width={1440}
            height={900}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="w-full h-auto"
            priority={priority}
          />
        </div>
      </div>
    </div>
  );
}
