// Small dependency-free SVG charts that read their colors from the theme.

interface Series {
  color: string;
  values: (number | null)[];
  /** A thin dashed guide line with no dots, e.g. the pace needed to reach a goal */
  guide?: boolean;
}

export function LineChart({
  series,
  labels,
  yMin,
  yMax,
  yFmt,
  goal,
  goalLabel,
  mark,
  height = 220,
}: {
  series: Series[];
  labels: string[];
  yMin: number;
  yMax: number;
  yFmt: (v: number) => string;
  goal?: number;
  goalLabel?: string;
  /** A vertical "now" line at this label index */
  mark?: { index: number; label: string };
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
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={13} fill="rgb(var(--muted))" className="font-mono">
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
        {mark && mark.index >= 0 && mark.index < n && (
          <g>
            <line x1={x(mark.index)} x2={x(mark.index)} y1={T} y2={H - B} stroke="rgb(var(--muted))" strokeDasharray="2 4" />
            <text x={x(mark.index)} y={T - 4} textAnchor={mark.index > n * 0.85 ? "end" : mark.index < n * 0.15 ? "start" : "middle"} fontSize={12} fill="rgb(var(--muted))">
              {mark.label}
            </text>
          </g>
        )}
        {labels.map((lb, i) =>
          (i % step === 0 && n - 1 - i >= step * 0.75) || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"} fontSize={13} fill="rgb(var(--muted))">
              {lb}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v == null ? null : ([x(i), y(v)] as const))).filter((p): p is readonly [number, number] => p !== null);
          if (!pts.length) return null;
          if (s.guide) return <polyline key={si} fill="none" stroke={s.color} strokeWidth={1.5} strokeDasharray="5 4" points={pts.map((p) => p.join(",")).join(" ")} />;
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

/** An axis top that divides into four even steps */
function niceMax(top: number): number {
  return [4, 8, 12, 20, 40, 60, 80, 100, 120, 160, 200, 400].find((m) => m >= top) ?? Math.ceil(top / 100) * 100;
}

export function BarChart({ values, labels, yFmt, height = 200 }: { values: number[]; labels: string[]; yFmt: (v: number) => string; height?: number }) {
  const W = 400, H = height, L = 36, R = 6, T = 12, B = 24;
  const n = values.length;
  if (!n) return null;
  const max = niceMax(Math.max(...values));
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
              <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={13} fill="rgb(var(--muted))" className="font-mono">
                {yFmt(v)}
              </text>
            </g>
          );
        })}
        {values.map((v, i) => (
          <g key={i}>
            <rect x={L + i * bw + bw * 0.15} y={y(v)} width={bw * 0.7} height={Math.max(0, y(0) - y(v))} rx={2} fill={i === n - 1 ? "rgb(var(--accent))" : "rgb(var(--muted))"} />
            {((i % step === 0 && n - 1 - i >= step * 0.75) || i === n - 1) && (
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

/** A tiny trend line for a list row: no axes, scaled to its own range, so read the direction and not the size. */
export function Spark({ values, color }: { values: number[]; color: string }) {
  const W = 72, H = 24, P = 3;
  if (!values.length) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const x = (i: number) => (values.length === 1 ? W - P : P + (i * (W - 2 * P)) / (values.length - 1));
  const y = (v: number) => (hi === lo ? H / 2 : P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className="shrink-0">
      {values.length > 1 && <polyline fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />}
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r={3} fill={color} />
    </svg>
  );
}

interface Band {
  label: string;
  color: string;
  values: number[];
}

/**
 * Two bar bands on one week axis (each with its own scale, never summed) and a row of dots under them.
 * The last week is still in progress, so its bars are drawn faint.
 */
export function LoadChart({ bands, labels, dots }: { bands: [Band, Band]; labels: string[]; dots?: (string | null)[] }) {
  const W = 400, L = 36, R = 6, BH = 84, GAP = 22, T = 16;
  const n = labels.length;
  if (!n) return null;
  const bw = (W - L - R) / n;
  const dotsY = T + 2 * BH + GAP + 14;
  const H = dotsY + (dots ? 14 : 0) + 20;
  const step = Math.ceil(n / 5);
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full">
        {bands.map((b, bi) => {
          const top = T + bi * (BH + GAP);
          const max = niceMax(Math.max(...b.values));
          const y = (v: number) => top + (1 - v / max) * BH;
          return (
            <g key={b.label}>
              <text x={L} y={top - 5} fontSize={12} fontWeight={600} fill={b.color}>
                {b.label}
              </text>
              {[0, max / 2, max].map((v) => (
                <g key={v}>
                  <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgb(var(--line))" />
                  <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={13} fill="rgb(var(--muted))" className="font-mono">
                    {v}
                  </text>
                </g>
              ))}
              {b.values.map((v, i) => (
                <rect key={i} x={L + i * bw + bw * 0.15} y={y(v)} width={bw * 0.7} height={Math.max(0, y(0) - y(v))} rx={2} fill={b.color} opacity={i === n - 1 ? 0.45 : 1} />
              ))}
            </g>
          );
        })}
        {dots?.map((c, i) => (c ? <circle key={i} cx={L + i * bw + bw / 2} cy={dotsY} r={4} fill={c} /> : null))}
        {labels.map((lb, i) =>
          (i % step === 0 && n - 1 - i >= step * 0.75) || i === n - 1 ? (
            <text key={i} x={L + i * bw + bw / 2} y={H - 5} textAnchor="middle" fontSize={13} fill="rgb(var(--muted))">
              {lb}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
