import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 sm:gap-8 px-6 bg-background">
      <div className="relative flex flex-col items-center">
        <div
          className="absolute -top-14 sm:-top-20 w-48 sm:w-72 h-48 sm:h-72 rounded-full bg-primary/5 blur-3xl"
          aria-hidden
        />
        <div className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
          <Compass size={26} strokeWidth={1.8} className="sm:hidden" />
          <Compass size={36} strokeWidth={1.8} className="hidden sm:block" />
        </div>
      </div>

      <div className="text-center">
        <h1 className="text-6xl sm:text-8xl font-extrabold tracking-tight text-foreground leading-none">
          4<span className="text-primary">0</span>4
        </h1>
        <p className="mt-3 sm:mt-4 text-base sm:text-xl font-semibold text-foreground">
          Page not found
        </p>
        <p className="mt-1.5 sm:mt-2 text-[13px] sm:text-sm text-muted-foreground max-w-[280px] sm:max-w-xs mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <Link
        href="/"
        className="group inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors"
      >
        <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
        Back to home
      </Link>

      <p className="text-[11px] text-muted-foreground/70 hidden sm:block">
        OneGemmy · Gemmy Connect Ltd
      </p>
    </div>
  );
}
