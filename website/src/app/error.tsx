"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-muted">Something went wrong loading this page.</p>
      <button onClick={reset} className="text-sm font-medium underline">Try again</button>
    </div>
  );
}
