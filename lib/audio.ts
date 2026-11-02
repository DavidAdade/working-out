// Short beeps that play on top of Apple Music or Spotify, the way running apps do, or not at all.
// iOS gives a web page the "playback" audio session by default, and starting an AudioContext with it
// pauses whatever else is playing. The Audio Session API (Safari 16.4+) lets the page ask for "ambient"
// instead, which mixes with other apps (and stays quiet with the silent switch on). Without that API
// there is no way to promise we won't stop the music, so we play nothing.
//
// Rules: nothing here runs on page load or when the app comes back to the screen. A context is only made
// inside a tap (`prime()`, or a sound played from a tap); a sound played later, e.g. from a timer, reuses that
// context or stays silent. It is closed again once idle, so iOS has nothing to resume when the app returns.
// Sounds only play while the page is on screen.

type SessionNavigator = Navigator & { audioSession?: { type: string } };

let ctx: AudioContext | null = null;
/** Kept open between sounds (a rest timer is counting down) instead of closing when idle */
let held = false;
let idle: ReturnType<typeof setTimeout> | null = null;

/** Whether this browser can mix sounds with other apps' audio. False means every call here is silent. */
export function canPlay(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as SessionNavigator).audioSession && typeof AudioContext !== "undefined";
}

/** Ask for the ambient session. Must happen before any context is created or resumed. */
function ambient(): boolean {
  if (!canPlay()) return false;
  const s = (navigator as SessionNavigator).audioSession!;
  try {
    if (s.type !== "ambient") s.type = "ambient";
    return s.type === "ambient";
  } catch {
    return false;
  }
}

/**
 * Get audio ready during a tap, so a later sound (the end of a rest) is allowed to play.
 * `hold` keeps the context open until `release()`. Returns false when sound is off for this browser.
 */
export function prime(hold = false): boolean {
  if (!ambient()) return false;
  if (hold) held = true;
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

/** Done with audio for now: close the context (after any sound still playing), so iOS has nothing to bring back */
export function release() {
  held = false;
  if (!idle) close();
}

function close() {
  if (idle) clearTimeout(idle);
  idle = null;
  const c = ctx;
  ctx = null;
  void c?.close().catch(() => {});
}

/** Whether we're inside a tap. Safari 16.4+ has the User Activation API; without it, assume not. */
const tapping = () => !!(navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive;

function play(notes: [at: number, freq: number, len: number, vol: number][]) {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  // Outside a tap, only an already-open context is used: a sound never creates one on load or on return
  if (ctx ? !ambient() : !tapping() || !prime()) return;
  const c = ctx!;
  const go = () => {
    if (c.state !== "running" || c !== ctx) return;
    try {
      const t0 = c.currentTime + 0.02;
      for (const [at, f, len, vol] of notes) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(vol, t0 + at);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + at + len);
        o.connect(g).connect(c.destination);
        o.start(t0 + at);
        o.stop(t0 + at + len);
      }
    } catch {}
    if (idle) clearTimeout(idle);
    const end = Math.max(...notes.map(([at, , len]) => at + len));
    idle = setTimeout(() => {
      idle = null;
      if (!held) close();
    }, end * 1000 + 3000);
  };
  // Only play right away: a suspended context would otherwise play stale beeps whenever it resumes
  if (c.state === "running") go();
  else {
    const asked = Date.now();
    void c.resume().then(() => Date.now() - asked < 400 && go(), () => {});
  }
}

/** A short tick: the last seconds of a countdown */
export const tick = () => play([[0, 1000, 0.06, 0.12]]);

/** Time's up: two beeps and a higher one */
export const chime = () =>
  play([
    [0, 880, 0.2, 0.2],
    [0.25, 880, 0.2, 0.2],
    [0.5, 1320, 0.35, 0.2],
  ]);

/** A rising arpeggio for a win, such as a new best */
export const celebrate = () =>
  play([
    [0, 660, 0.12, 0.15],
    [0.1, 880, 0.12, 0.15],
    [0.2, 1100, 0.12, 0.15],
    [0.3, 1320, 0.3, 0.18],
  ]);
