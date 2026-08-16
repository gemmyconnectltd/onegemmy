import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <Loader2 size={32} className="animate-spin text-accent" />
    </div>
  );
}
