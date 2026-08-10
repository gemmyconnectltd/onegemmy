import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-8 py-20 text-center">
      <div className="relative flex flex-col items-center">
        <div className="absolute -top-10 w-40 h-40 rounded-full bg-primary/10 blur-2xl" aria-hidden />
        <div className="relative w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25">
          <Compass size={26} strokeWidth={1.8} />
        </div>
      </div>

      <div>
        <h1 className="text-5xl font-extrabold tracking-tight text-foreground">
          4<span className="text-primary">0</span>4
        </h1>
        <p className="mt-2.5 text-base font-semibold text-foreground">Page not found</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          This page doesn&apos;t exist or has been moved.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex items-center justify-center w-full max-w-[260px] px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/20 active:scale-95 transition-transform"
      >
        Back to home
      </Link>
    </div>
  );
}
