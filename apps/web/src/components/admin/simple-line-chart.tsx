"use client";

export interface LineChartPoint {
  label: string;
  value: number;
}

const WIDTH = 600;
const HEIGHT = 160;
const PADDING = 24;

/** Hand-rolled SVG, no charting library — mirrors the storage-usage donut's approach (M11) of a
 * single small chart not justifying a new dependency. */
export function SimpleLineChart({
  data,
  color = "var(--chart-1)",
  ariaLabel,
}: {
  data: LineChartPoint[];
  color?: string;
  ariaLabel: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data in this window yet.</p>;
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? (WIDTH - PADDING * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: PADDING + i * stepX,
    y: HEIGHT - PADDING - (d.value / maxValue) * (HEIGHT - PADDING * 2),
    ...d,
  }));
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={ariaLabel}>
        <line
          x1={PADDING}
          y1={HEIGHT - PADDING}
          x2={WIDTH - PADDING}
          y2={HEIGHT - PADDING}
          stroke="var(--border)"
          strokeWidth={1}
        />
        <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth={2} />
        {points.map((p) => (
          <circle key={p.label} cx={p.x} cy={p.y} r={2.5} fill={color} />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
