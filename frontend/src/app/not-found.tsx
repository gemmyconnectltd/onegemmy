import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-sm text-muted">Page not found</p>
      <Link href="/" className="text-sm font-medium underline">Go home</Link>
    </div>
  );
}
