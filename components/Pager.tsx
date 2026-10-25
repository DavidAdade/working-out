"use client";

/** Paging for long lists: page sizes stay small so a phone never scrolls through everything at once. */
export function usePage<T>(items: T[], size: number, page: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { pages, current, shown: items.slice(current * size, current * size + size), from: current * size + 1, to: Math.min(items.length, current * size + size) };
}

/** `listId`: the list to bring back into view when paging from below it */
export default function Pager({ current, pages, label, onPage, listId }: { current: number; pages: number; label: string; onPage: (p: number) => void; listId?: string }) {
  if (pages <= 1) return null;
  const go = (p: number) => {
    onPage(p);
    if (listId) requestAnimationFrame(() => document.getElementById(listId)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Pages">
      <button type="button" className="btn-ghost" disabled={current === 0} onClick={() => go(current - 1)}>
        ‹ Prev
      </button>
      <span className="text-sm text-muted">{label}</span>
      <button type="button" className="btn-ghost" disabled={current >= pages - 1} onClick={() => go(current + 1)}>
        Next ›
      </button>
    </nav>
  );
}
