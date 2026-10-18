
export { EmptyState, ErrorState } from "@/components/ui/EmptyState";

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-lg p-2">
          <div className="h-9 w-9 animate-pulse rounded-full bg-border/70" />
          <div className="flex-1 space-y-2"><div className="h-3 w-2/3 animate-pulse rounded bg-border/70" /><div className="h-3 w-full animate-pulse rounded bg-border/50" /></div>
        </div>
      ))}
    </div>
  );
}
