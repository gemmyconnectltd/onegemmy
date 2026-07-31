"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted">Something went wrong: {error.message}</p>
      <button onClick={reset} className="text-sm font-medium underline">Try again</button>
    </div>
  );
}
