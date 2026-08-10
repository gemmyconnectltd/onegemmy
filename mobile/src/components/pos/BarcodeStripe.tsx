export function BarcodeStripe({ compact = false }: { compact?: boolean }) {
  const bars = [2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 1, 3, 2, 1, 4, 1, 2, 2, 1, 3, 1, 2, 1, 4, 1, 1, 2, 3, 1, 2];
  return (
    <div
      className={`flex items-stretch gap-[2px] overflow-hidden bg-accent/5 ${compact ? "h-2" : "h-3"}`}
      aria-hidden="true"
    >
      {bars.map((w, i) => (
        <span key={i} className="bg-accent/70" style={{ width: `${w * 2}px` }} />
      ))}
    </div>
  );
}
