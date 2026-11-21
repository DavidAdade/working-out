// The API returns at most 1,000 rows a request (max_rows in supabase/config.toml, the same on the hosted
// project), whatever .limit() asks for, and drops the rest without saying so. Anything that can grow past that
// is read a page at a time. The query must have a fixed order (end it on a unique column) or pages overlap.

export const PAGE_ROWS = 1000;

export async function paged<T, E>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>, max = 5000): Promise<{ data: T[]; error: null } | { data: null; error: E }> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE_ROWS) {
    const r = await page(from, Math.min(from + PAGE_ROWS, max) - 1);
    if (r.error) return { data: null, error: r.error };
    rows.push(...(r.data ?? []));
    if ((r.data ?? []).length < PAGE_ROWS) break;
  }
  return { data: rows, error: null };
}
