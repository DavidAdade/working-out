// Small dependency-free SVG charts that read their colors from the theme.

interface Series {
  color: string;
  values: (number | null)[];
}

export function LineChart({
  series,
  labels,
  yMin,
  yMax,
  yFmt,
  goal,
  goalLabel,
  height = 220,
}: {
  series: Series[];
  labels: string[];
  yMin: number;
  yMax: number;
  yFmt: (v: number) => string;
  goal?: number;
  goalLabel?: string;
  height?: number;
}) {
  const W = 400, H = height, L = 44, R = 10, T = 16, B = 24;
  const n = labels.length;
  if (!n) return null;
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const ticks = [0, 1, 2, 3, 4].map((k) => yMin + ((yMax - yMin) * k) / 4);
  const step = Math.ceil(n / 4);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgb(var(--line))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={13} fill="rgb(var(--muted))" fontFamily="JetBrains Mono, monospace">
              {yFmt(v)}
            </text>
          </g>
        ))}
        {goal != null && (
          <g>
            <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} stroke="rgb(var(--good))" strokeDasharray="5 4" strokeWidth={1.5} />
            <text x={W - R} y={y(goal) - 5} textAnchor="end" fontSize={13} fill="rgb(var(--good))" fontWeight={600}>
              {goalLabel}
            </text>
          </g>
        )}
        {labels.map((lb, i) =>
          (i % step === 0 && n - 1 - i >= step / 2) || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"} fontSize={13} fill="rgb(var(--muted))">
              {lb}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v == null ? null : ([x(i), y(v)] as const))).filter((p): p is readonly [number, number] => p !== null);
          if (!pts.length) return null;
          return (
            <g key={si}>
              <polyline fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" points={pts.map((p) => p.join(",")).join(" ")} />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4.5 : 3} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function BarChart({ values, labels, yFmt, height = 200 }: { values: number[]; labels: string[]; yFmt: (v: number) => string; height?: number }) {
  const W = 400, H = height, L = 36, R = 6, T = 12, B = 24;
  const n = values.length;
  if (!n) return null;
  const max = Math.max(5, Math.ceil(Math.max(...values) / 5) * 5);
  const bw = (W - L - R) / n;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const step = Math.ceil(n / 5);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full">
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (max * k) / 4;
          return (
            <g key={k}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgb(var(--line))" />
              <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={13} fill="rgb(var(--muted))" fontFamily="JetBrains Mono, monospace">
                {yFmt(v)}
              </text>
            </g>
          );
        })}
        {values.map((v, i) => (
          <g key={i}>
            <rect x={L + i * bw + bw * 0.15} y={y(v)} width={bw * 0.7} height={Math.max(0, y(0) - y(v))} rx={2} fill={i === n - 1 ? "rgb(var(--accent))" : "rgb(var(--muted))"} />
            {((i % step === 0 && n - 1 - i >= step / 2) || i === n - 1) && (
              <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={13} fill="rgb(var(--muted))">
                {labels[i]}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
