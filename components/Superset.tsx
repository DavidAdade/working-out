"use client";

// Supersets on one plan day (see lib/plan/supersets.ts): the links in force, and linking or unlinking two
// exercises. Owned by the Dashboard, which feeds the links into the plan; rows reach it through useSuperset.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { linkId, type SupersetLink } from "@/lib/plan/supersets.ts";
import { useDock } from "./Dock";

export interface SupersetApi {
  /** Link the template exercise `key` on plan day `planDate` to the next line (on) or unlink it; `note` shows once saved, with Undo */
  link: (planDate: string, key: string, on: boolean, note: string) => void;
}

const Ctx = createContext<SupersetApi | null>(null);
export const SupersetProvider = Ctx.Provider;
/** Null where supersets aren't offered */
export const useSuperset = () => useContext(Ctx);

/**
 * The links: the server's, then any still waiting in the outbox, then ones made here that the server hasn't
 * shown back yet (like swaps in the Dashboard). Writes go through the outbox, so a link made without signal
 * replays in order with the sets logged after it.
 */
export function useSupersetLinks(server: SupersetLink[]): { links: SupersetLink[]; api: SupersetApi } {
  const { queue, notify, send, onRejected } = useDock();
  const [local, setLocal] = useState<Map<string, boolean>>(() => new Map());
  const links = useMemo(() => {
    const m = new Map(server.map((l) => [linkId(l.planDate, l.key), true]));
    for (const op of queue) if (op.t === "superset") m.set(linkId(op.planDate, op.key), op.on);
    for (const [k, on] of local) m.set(k, on);
    return [...m].flatMap(([k, on]) => (on ? [{ planDate: k.split("|")[0], key: k.split("|")[1] }] : []));
  }, [server, queue, local]);
  const linksRef = useRef(links);
  linksRef.current = links;
  // Once the server agrees, its row takes over
  useEffect(() => {
    setLocal((cur) => {
      if (!cur.size) return cur;
      const have = new Set(server.map((l) => linkId(l.planDate, l.key)));
      const next = new Map([...cur].filter(([k, on]) => have.has(k) !== on));
      return next.size === cur.size ? cur : next;
    });
  }, [server]);
  useEffect(
    () =>
      onRejected((op) => {
        if (op.t === "superset") setLocal((cur) => new Map([...cur].filter(([k]) => k !== linkId(op.planDate, op.key))));
      }),
    [onRejected],
  );

  const link = useCallback<SupersetApi["link"]>(
    (planDate, key, on, note) => {
      const k = linkId(planDate, key);
      const before = linksRef.current.some((l) => linkId(l.planDate, l.key) === k);
      setLocal((cur) => new Map(cur).set(k, on));
      const undo = { label: "Undo", run: () => link(planDate, key, before, "Superset undone.") };
      void send({ id: crypto.randomUUID(), t: "superset", planDate, key, on }).then((r) => {
        if (r === "sent") notify({ text: note, tone: "good", action: undo });
        else if (r === "queued") notify({ text: `${note} Saved on this phone. Syncs when you're back online.`, action: undo });
        else {
          setLocal((cur) => new Map(cur).set(k, before));
          notify({ text: r.error, tone: "error" });
        }
      });
    },
    [notify, send],
  );
  const api = useMemo<SupersetApi>(() => ({ link }), [link]);
  return { links, api };
}
