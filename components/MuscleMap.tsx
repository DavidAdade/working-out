"use client";

import {
  BODY_BACK,
  BODY_FRONT,
  BODY_HEAD,
  BODY_MIRROR,
  BODY_SILHOUETTE,
  BODY_VIEWBOX,
  muscleName,
  type BodyPart,
  type MuscleId,
} from "@/lib/plan/muscles.ts";

type Level = "primary" | "secondary" | undefined;

// Fills come from the theme vars, so light and dark switch automatically.
// Secondary is a touch stronger in dark mode, where 40% read as brownish.
const FILL: Record<"primary" | "secondary" | "none", string> = {
  primary: "fill-accent",
  secondary: "fill-accent/40 dark:fill-accent/50",
  none: "fill-muted/20",
};

function Body({ view, levels }: { view: "front" | "back"; levels: Map<MuscleId, Level> }) {
  const parts: readonly BodyPart[] = view === "front" ? BODY_FRONT : BODY_BACK;
  return (
    <svg viewBox={BODY_VIEWBOX} role="img" aria-label={`${view} view`} className="block h-auto w-full max-w-[150px]">
      <g className="fill-sunk">
        <ellipse cx={BODY_HEAD.cx} cy={BODY_HEAD.cy} rx={BODY_HEAD.rx} ry={BODY_HEAD.ry} />
        <path d={BODY_SILHOUETTE} />
      </g>
      {parts.map(({ id, d }, i) => {
        const cls = `${FILL[levels.get(id) ?? "none"]} stroke-surface`;
        return (
          <g key={i} data-muscle={id} className={cls} strokeWidth={0.7} strokeLinejoin="round">
            <path d={d} />
            <path d={d} transform={BODY_MIRROR} />
          </g>
        );
      })}
    </svg>
  );
}

export default function MuscleMap({
  primary,
  secondary,
  size = "md",
}: {
  primary: MuscleId[];
  secondary: MuscleId[];
  size?: "sm" | "md";
}) {
  const levels = new Map<MuscleId, Level>();
  for (const id of secondary) levels.set(id, "secondary");
  for (const id of primary) levels.set(id, "primary");

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className={`flex justify-center ${size === "sm" ? "gap-1.5" : "gap-2"}`}>
        {(["front", "back"] as const).map((view) => (
          <div key={view} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <Body view={view} levels={levels} />
            <span className="font-display text-[12px] font-semibold tracking-[.14em] text-muted">
              {view === "front" ? "FRONT" : "BACK"}
            </span>
          </div>
        ))}
      </div>
      {size === "md" && (
        <div className="mt-2 flex justify-center gap-4 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
            Primary
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-[3px] bg-accent/40 dark:bg-accent/50" />
            Secondary
          </span>
        </div>
      )}
    </div>
  );
}

function ChipRow({ label, ids, kind }: { label: string; ids: MuscleId[]; kind: "primary" | "secondary" }) {
  if (ids.length === 0) return null;
  const chip =
    kind === "primary"
      ? "border-transparent bg-accent text-on-accent"
      : "border-accent/40 bg-accent/15 text-ink";
  return (
    <div className="flex items-start gap-1.5">
      <span className="w-[74px] flex-none pt-[5px] text-[11px] font-semibold uppercase tracking-[.06em] text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <span
            key={id}
            className={`whitespace-nowrap rounded-full border px-[9px] py-[3px] text-[12.5px] font-medium ${chip}`}
          >
            {muscleName(id)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MuscleChips({ primary, secondary }: { primary: MuscleId[]; secondary: MuscleId[] }) {
  return (
    <div className="grid gap-1.5">
      <ChipRow label="Primary" ids={primary} kind="primary" />
      <ChipRow label="Secondary" ids={secondary} kind="secondary" />
    </div>
  );
}
