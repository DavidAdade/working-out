"use client";

// Supersets (see lib/plan/supersets.ts): the saved groups, changing them, and the sheet that picks which of a
// day's exercises go together. Owned by the Dashboard; rows reach it through useSuperset.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyEdit, SUPERSET_MAX, type Superset, type SupersetEdit } from "@/lib/plan/supersets.ts";
import { useDock } from "./Dock";

export interface SupersetApi {
  /** Every saved superset, changes made here included */
  list: Superset[];
  /** Save a change; `note` shows once saved, with Undo */
  edit: (e: SupersetEdit, note: string) => void;
}

const Ctx = createContext<SupersetApi | null>(null);
export const SupersetProvider = Ctx.Provider;
/** Null where supersets aren't offered */
export const useSuperset = () => useContext(Ctx);

/**
 * The supersets: the server's, then changes still waiting in the outbox, then ones made here that the server
 * hasn't shown back yet. Writes go through the outbox, so a superset made without signal replays in order
 * with the sets logged after it.
 */
export function useSupersets(server: Superset[]): SupersetApi {
  const { queue, notify, send, onRejected } = useDock();
  const [local, setLocal] = useState<{ op: string; edit: SupersetEdit }[]>([]);
  const list = useMemo(() => {
    let out: Superset[] = server;
    for (const op of queue) if (op.t === "supersets") out = applyEdit(out, op);
    for (const l of local) out = applyEdit(out, l.edit);
    return out;
  }, [server, queue, local]);
  const listRef = useRef(list);
  listRef.current = list;
  // Once the server shows a change, its rows take over
  useEffect(() => {
    setLocal((cur) => {
      const have = new Set(server.map((s) => s.id));
      const next = cur.filter((l) => l.edit.remove.some((id) => have.has(id)) || l.edit.add.some((a) => !have.has(a.id)));
      return next.length === cur.length ? cur : next;
    });
  }, [server]);
  const drop = useCallback((op: string) => setLocal((cur) => cur.filter((l) => l.op !== op)), []);
  useEffect(() => onRejected((op) => op.t === "supersets" && drop(op.id)), [onRejected, drop]);

  const edit = useCallback<SupersetApi["edit"]>(
    (e, note) => {
      const op = crypto.randomUUID();
      const removed = listRef.current.filter((s) => e.remove.includes(s.id));
      setLocal((cur) => [...cur, { op, edit: e }]);
      const undo = { label: "Undo", run: () => edit({ remove: e.add.map((a) => a.id), add: removed.map((s) => ({ id: crypto.randomUUID(), keys: s.keys })) }, "Superset change undone.") };
      void send({ id: op, t: "supersets", remove: e.remove, add: e.add }).then((r) => {
        if (r === "sent") notify({ text: note, tone: "good", action: undo });
        else if (r === "queued") notify({ text: `${note} Saved on this phone. Syncs when you're back online.`, action: undo });
        else {
          drop(op);
          notify({ text: r.error, tone: "error" });
        }
      });
    },
    [drop, notify, send],
  );
  return useMemo(() => ({ list, edit }), [list, edit]);
}

/** One colour per superset on a day, in order (the chart colours: they hold up in light and dark) */
export const GROUP_COLORS = ["rgb(var(--area1))", "rgb(var(--area2))", "rgb(var(--area3))", "rgb(var(--good))", "rgb(var(--warn))"];
export const groupColor = (letter: string) => GROUP_COLORS[(letter.charCodeAt(0) - 65) % GROUP_COLORS.length];

export interface SheetRow {
  id: string;
  name: string;
  /** "3×10" */
  target: string;
  /** The superset it's in now, if any */
  letter?: string;
}

/** Pick which of the day's exercises are done back to back with `row` */
export function SupersetSheet({
  rows,
  row,
  current,
  preset,
  onSave,
  onClose,
  onAddNew,
}: {
  rows: SheetRow[];
  row: string;
  /** The rows of the superset it's in now */
  current: string[];
  /** What to start ticked, when coming back from the library */
  preset?: string[];
  onSave: (chosen: string[]) => void;
  onClose: () => void;
  /** Opens the library to add an exercise to the day and tick it here; left out where exercises can't be added */
  onAddNew?: (chosen: string[]) => void;
}) {
  const me = rows.find((r) => r.id === row);
  const [chosen, setChosen] = useState<string[]>(() => {
    if (preset) return preset.filter((id) => rows.some((r) => r.id === id));
    if (current.length) return current;
    // Nothing yet: offer the exercise after this one
    const next = rows[rows.findIndex((r) => r.id === row) + 1];
    return next && !next.letter ? [row, next.id] : [row];
  });
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  if (!me) return null;
  const n = chosen.length;
  const full = n >= SUPERSET_MAX;
  const same = n === current.length && chosen.every((id) => current.includes(id));
  const toggle = (id: string) => setChosen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/60 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Superset with ${me.name}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-[520px] flex-col overflow-y-auto rounded-t-2xl border border-line bg-surface pb-[max(16px,env(safe-area-inset-bottom,0px))] sm:rounded-2xl"
      >
        <div className="sticky top-0 z-[1] flex flex-col gap-1 border-b border-line bg-surface px-4 pb-2 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="label">Superset</div>
              <h3 className="break-words font-display text-xl font-bold">{me.name}</h3>
            </div>
            <button ref={cancelRef} type="button" className="btn-ghost flex-none" onClick={onClose}>
              Cancel
            </button>
          </div>
          <p className="text-sm text-muted">Tick what you do back to back with it. One set of each, then rest. Saved for this workout every week.</p>
        </div>
        <ul className="flex flex-col divide-y divide-line px-4">
          {rows.map((r) => {
            const on = chosen.includes(r.id);
            const fixed = r.id === row;
            return (
              <li key={r.id}>
                <label className={`flex min-h-12 items-center gap-3 py-1 ${fixed || (!on && full) ? "opacity-60" : ""}`}>
                  <input type="checkbox" className="h-5 w-5 flex-none accent-[rgb(var(--accent))]" checked={on} disabled={fixed || (!on && full)} onChange={() => toggle(r.id)} />
                  <span className="min-w-0 flex-1 break-words">
                    <span className="font-medium">{r.name}</span> <span className="whitespace-nowrap font-mono text-[0.8rem] text-muted">{r.target}</span>
                    {r.letter && !current.includes(r.id) && <span className="block text-xs text-muted">In superset {r.letter} now: ticking moves it here</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {onAddNew && (
          <button type="button" className="btn-ghost mx-4 my-2 self-start" disabled={full} onClick={() => onAddNew(chosen)}>
            + Add from library
          </button>
        )}
        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3">
          <button type="button" className="btn w-full" disabled={same || (n < 2 && !current.length)} onClick={() => onSave(chosen)}>
            {n >= 2 ? `Save superset (${n})` : current.length ? "Remove from superset" : "Tick at least one more"}
          </button>
        </div>
      </div>
    </div>
  );
}
