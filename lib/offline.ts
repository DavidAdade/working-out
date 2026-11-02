// The Dashboard's data, saved on this phone after every load, so the app still opens with no signal or
// when the server is down. IndexedDB, not localStorage: years of sets don't fit in localStorage's ~5 MB.
// Only one person's data is kept: whoever loaded the app last. Signing out (or landing on /login) clears it.
// Browser only. Every call fails softly: no storage just means no offline copy.

/** Bump when the Dashboard's props change shape, so an old copy is never fed to new code */
export const CACHE_VERSION = 3;

const DB = "workoutflex";
const STORE = "kv";
const KEY = "dashboard";

export interface Snapshot<T> {
  v: number;
  userId: string;
  savedAt: number;
  data: T;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

let persistAsked = false;

/** Save the latest data for this person (replacing anyone else's) */
export async function saveSnapshot<T>(userId: string, data: T): Promise<void> {
  try {
    const snap: Snapshot<T> = { v: CACHE_VERSION, userId, savedAt: Date.now(), data };
    await tx("readwrite", (s) => s.put(snap, KEY));
    // Ask iOS/Chrome not to evict it under storage pressure (home-screen apps usually get this)
    if (!persistAsked) {
      persistAsked = true;
      void navigator.storage?.persist?.().catch(() => {});
    }
  } catch {
    // Private mode, quota, or no IndexedDB: the app works, just not offline
  }
}

/** The saved data, if it's from this version of the app (and, if given, this person) */
export async function loadSnapshot<T>(userId?: string): Promise<Snapshot<T> | null> {
  try {
    const snap = await tx<Snapshot<T>>("readonly", (s) => s.get(KEY));
    if (!snap || snap.v !== CACHE_VERSION || !snap.userId || !snap.data) return null;
    if (userId && snap.userId !== userId) return null;
    return snap;
  } catch {
    return null;
  }
}

/** Forget the saved data (sign-out, or someone else signing in on this phone) */
export async function clearSnapshot(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(KEY));
  } catch {}
}
