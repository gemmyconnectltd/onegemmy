import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 bg-background">
      <div className="relative flex flex-col items-center">
        <div className="absolute -top-16 w-56 h-56 rounded-full bg-primary/5 blur-3xl" aria-hidden />
        <div className="relative w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
          <Compass size={30} strokeWidth={1.8} />
        </div>
      </div>

      <div className="text-center">
        <h1 className="text-7xl font-extrabold tracking-tight text-foreground">
          4<span className="text-primary">0</span>4
        </h1>
        <p className="mt-3 text-lg font-semibold text-foreground">Page not found</p>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <Link
        href="/"
        className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5"
      >
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
        Back to home
      </Link>

      <p className="text-[11px] text-muted-foreground/70">
        OneGemmy · Gemmy Connect Ltd
      </p>
    </div>
  );
}
