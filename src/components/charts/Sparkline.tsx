// Inline sparkline for small time-series, with no chart library. Values outside
// [lowBand, highBand] get a red dot; leave the bands out to apply no judgement.
export function Sparkline({
  values,
  width = 140,
  height = 34,
  lowBand,
  highBand,
  color = 'var(--accent-navy)',
  ariaLabel = 'trend',
}: {
  values: Array<number | null>;
  width?: number;
  height?: number;
  lowBand?: number;
  highBand?: number;
  color?: string;
  ariaLabel?: string;
}) {
  const pts = values.filter((v): v is number => v != null);
  if (pts.length < 1) {
    return <span className="font-mono text-caption text-[var(--ink-navy-muted)]">—</span>;
  }
  const min = Math.min(...pts, lowBand ?? Infinity);
  const max = Math.max(...pts, highBand ?? -Infinity);
  const span = max - min || 1;
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = (i: number) => pad + (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v: number) => pad + h - ((v - min) / span) * h;
  const polyPts = values
    .map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
    .filter(Boolean)
    .join(' ');
  // Normal band shading when both lowBand and highBand are provided.
  const bandY0 = highBand != null ? y(highBand) : null;
  const bandY1 = lowBand != null ? y(lowBand) : null;
  return (
    <svg width={width} height={height} className="block" role="img" aria-label={ariaLabel}>
      {bandY0 != null && bandY1 != null && (
        <rect
          x={0}
          y={Math.min(bandY0, bandY1)}
          width={width}
          height={Math.abs(bandY1 - bandY0)}
          fill="var(--risk-low)"
          opacity={0.08}
        />
      )}
      <polyline
        points={polyPts}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {values.map((v, i) => {
        if (v == null) return null;
        const abnormal = (lowBand != null && v < lowBand) || (highBand != null && v > highBand);
        return (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={abnormal ? 2.4 : 1.8}
            fill={abnormal ? 'var(--risk-high)' : color}
          />
        );
      })}
    </svg>
  );
}
