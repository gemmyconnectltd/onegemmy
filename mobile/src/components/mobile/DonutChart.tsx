"use client";

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
}

export function DonutChart({ segments, size = 96, thickness = 16 }: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let cumulative = 0;
  const stops = total > 0
    ? segments
        .filter((seg) => seg.value > 0)
        .map((seg) => {
          const start = (cumulative / total) * 360;
          cumulative += seg.value;
          const end = (cumulative / total) * 360;
          return `${seg.color} ${start}deg ${end}deg`;
        })
        .join(", ")
    : "var(--border) 0deg 360deg";

  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
      role="img"
      aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
    >
      <div
        className="rounded-full bg-card flex items-center justify-center"
        style={{ width: size - thickness * 2, height: size - thickness * 2 }}
      />
    </div>
  );
}
