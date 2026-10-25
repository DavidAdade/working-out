"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { addExercise, type ActionResult } from "@/app/actions";
import { MUSCLES, MUSCLE_GROUPS, type MuscleId } from "@/lib/plan/muscles.ts";
import type { ExerciseInfo } from "@/lib/plan/catalog.ts";
import { sessions } from "@/lib/plan/progress.ts";
import { fmtSet, useSets, videoFromInfo } from "./Sets";
import { useOpenVideo } from "./VideoModal";
import Pager, { usePage } from "./Pager";

const MUSCLE = new Map(MUSCLES.map((m) => [m.id as string, m]));
const muscleNames = (ids: string[]) => ids.map((id) => MUSCLE.get(id)?.name ?? id).join(", ");

/** Every exercise in the database: search, filter by muscle group, open one for its muscles, video and history. */
export default function LibraryPanel() {
  const { exercises, sets, unit, openHistory } = useSets();
  const openVideo = useOpenVideo();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(0);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return exercises.filter((e) => {
      const muscles = [...e.primary_muscles, ...e.secondary_muscles].map((m) => MUSCLE.get(m)?.name ?? m).join(" ");
      const hay = `${e.name} ${muscles} ${e.lines.join(" ")}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
      return !group || e.primary_muscles.some((m) => MUSCLE.get(m)?.group === group);
    });
  }, [exercises, q, group]);
  const list = usePage(shown, 15, page);

  return (
    <section className="flex flex-col gap-3">
      <div className="sticky top-[calc(env(safe-area-inset-top,0px)+3.6rem)] z-[5] -mx-1 flex flex-col gap-2 bg-bg px-1 pb-2">
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder={`Search ${exercises.length} exercises or muscles`}
          aria-label="Search exercises"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          className="input"
        />
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Muscle group">
          {[null, ...MUSCLE_GROUPS].map((g) => (
            <button
              key={g ?? "all"}
              type="button"
              aria-pressed={group === g}
              onClick={() => {
                setGroup(g);
                setPage(0);
              }}
              className={`min-h-11 flex-none rounded-full border px-3 text-sm font-semibold ${group === g ? "border-ink bg-ink text-bg" : "border-line bg-surface"}`}
            >
              {g ?? "All"}
            </button>
          ))}
        </div>
      </div>

      {adding ? <AddExercise onDone={() => setAdding(false)} /> : (
        <button type="button" className="btn-ghost self-start" onClick={() => setAdding(true)}>
          + Add your own exercise
        </button>
      )}

      <article id="library-list" className="card scroll-mt-40 gap-0 p-0">
        {shown.length === 0 ? (
          <p className="p-4 text-center text-muted">No exercises match. Try another word, or add it.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {list.shown.map((e) => (
              <Row key={e.key} e={e} last={sessions(sets, e.key)[0]?.sets} unit={unit} onOpen={() => openHistory(e.key)} onVideo={() => videoFromInfo(e) && openVideo(videoFromInfo(e)!)} />
            ))}
          </ul>
        )}
      </article>
      <Pager current={list.current} pages={list.pages} label={`${list.from}–${list.to} of ${shown.length}`} onPage={setPage} listId="library-list" />
    </section>
  );
}

function Row({ e, last, unit, onOpen, onVideo }: { e: ExerciseInfo; last?: { weight_kg: number | null; reps: number | null; duration_sec: number | null }[]; unit: "kg" | "lb"; onOpen: () => void; onVideo: () => void }) {
  const hasVideo = e.video_ids.length > 0;
  return (
    <li className="flex items-center gap-1 pr-2">
      {hasVideo ? (
        <button type="button" onClick={onVideo} aria-label={`Watch ${e.name} video`} className="flex h-12 w-11 flex-none items-center justify-center text-accent-ink active:bg-sunk">
          <span aria-hidden className="text-[0.8rem]">▶</span>
        </button>
      ) : (
        <span className="w-11 flex-none" />
      )}
      <button type="button" onClick={onOpen} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            {e.name}
            {e.owner && <span className="ml-1.5 rounded bg-sunk px-1.5 py-px text-[0.68rem] font-semibold uppercase tracking-wide text-muted">Yours</span>}
          </span>
          <span className="block truncate text-xs text-muted">{muscleNames(e.primary_muscles) || "No muscles tagged"}</span>
        </span>
        {last?.length ? <span className="whitespace-nowrap font-mono text-xs text-muted">{fmtSet(last[0], unit)}</span> : null}
        <span aria-hidden className="text-muted">›</span>
      </button>
    </li>
  );
}

function AddExercise({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  // Submitting by hand keeps what was typed when the server says no (a form action would reset it)
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        setState(await addExercise(null, form));
      } catch {
        setState({ ok: false, error: "No connection. Try again when you have signal." });
      }
    });
  };
  const [primary, setPrimary] = useState<MuscleId[]>([]);
  const [secondary, setSecondary] = useState<MuscleId[]>([]);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  // Tap once for a main muscle, again for a helper muscle, a third time to clear
  const cycle = (id: MuscleId) => {
    if (primary.includes(id)) {
      setPrimary((p) => p.filter((x) => x !== id));
      setSecondary((s) => [...s, id]);
    } else if (secondary.includes(id)) setSecondary((s) => s.filter((x) => x !== id));
    else setPrimary((p) => [...p, id]);
  };

  return (
    <form onSubmit={submit} className="card">
      <h3 className="font-display text-xl font-bold">Add an exercise</h3>
      <label className="label" htmlFor="ex-name">
        Name
      </label>
      <input id="ex-name" name="name" required maxLength={80} placeholder="Goblet squat" className="input" />
      <label className="label" htmlFor="ex-load">
        Measured by
      </label>
      <select id="ex-load" name="load" defaultValue="weight" className="input">
        <option value="weight">Weight × reps</option>
        <option value="bodyweight">Reps only</option>
        <option value="time">Seconds</option>
      </select>
      <span className="label">Muscles: tap once for main, twice for helper</span>
      <div className="flex flex-wrap gap-1.5">
        {MUSCLES.map((m) => {
          const p = primary.includes(m.id);
          const s = secondary.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => cycle(m.id)}
              aria-pressed={p || s}
              className={`min-h-11 rounded-full border px-3 text-sm ${p ? "border-accent bg-accent font-semibold text-on-accent" : s ? "border-accent/40 bg-accent/15" : "border-line bg-surface"}`}
            >
              {m.name}
            </button>
          );
        })}
      </div>
      {primary.map((m) => (
        <input key={m} type="hidden" name="primary" value={m} />
      ))}
      {secondary.map((m) => (
        <input key={m} type="hidden" name="secondary" value={m} />
      ))}
      <label className="label" htmlFor="ex-video">
        YouTube link (optional)
      </label>
      <input id="ex-video" name="video" inputMode="url" autoCapitalize="none" placeholder="https://youtu.be/…" className="input" />
      {state && !state.ok && <p className="text-sm text-bad">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={pending}>
          {pending ? "Saving…" : "Save exercise"}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
