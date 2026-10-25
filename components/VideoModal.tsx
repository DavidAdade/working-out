"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { youtubeSearchUrl, youtubeWatchUrl, type ExerciseVideo } from "@/lib/plan/videos.ts";

/* ---------- minimal types for the YouTube IFrame Player API ---------- */
interface YTPlayer {
  destroy(): void;
  loadVideoById(id: string): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: { videoId: string; playerVars?: Record<string, number | string>; events?: { onError?: (e: { data: number }) => void } }) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube player failed to load"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/* ---------- context so any exercise line can open the popup ---------- */
const VideoContext = createContext<(v: ExerciseVideo) => void>(() => {});
export const useOpenVideo = () => useContext(VideoContext);

export function VideoProvider({ children }: { children: React.ReactNode }) {
  const [video, setVideo] = useState<ExerciseVideo | null>(null);
  return (
    <VideoContext.Provider value={setVideo}>
      {children}
      {video && <VideoModal video={video} onClose={() => setVideo(null)} />}
    </VideoContext.Provider>
  );
}

/* ---------- the popup ---------- */
function VideoModal({ video, onClose }: { video: ExerciseVideo; onClose: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [usingFallbackFrame, setUsingFallbackFrame] = useState(false);
  const currentId = video.ids[Math.min(index, video.ids.length - 1)];

  // Close on Escape, lock page scroll while open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Play through the ids in order; YouTube error codes 100/101/150 mean removed or not embeddable
  useEffect(() => {
    let player: YTPlayer | null = null;
    let cancelled = false;
    let i = 0;
    setIndex(0);
    setFailed(false);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mount.current) return;
        const target = document.createElement("div");
        mount.current.replaceChildren(target);
        player = new YT.Player(target, {
          videoId: video.ids[0],
          playerVars: { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1 },
          events: {
            onError: () => {
              i += 1;
              if (i < video.ids.length) {
                setIndex(i);
                player?.loadVideoById(video.ids[i]);
              } else setFailed(true);
            },
          },
        });
      })
      .catch(() => !cancelled && setUsingFallbackFrame(true));
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [video]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/70 p-2 sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${video.name} video`}
        className="flex w-full max-w-[720px] flex-col gap-3 rounded-xl border border-line bg-surface p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-xl font-bold">{video.name}</h3>
          <button ref={closeBtn} className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="relative aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full">
          {failed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
              <p>This video isn&apos;t available any more.</p>
              <a className="btn" href={youtubeSearchUrl(video.query)} target="_blank" rel="noreferrer">
                Search YouTube for {video.name.toLowerCase()}
              </a>
            </div>
          ) : usingFallbackFrame ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${currentId}?autoplay=1&rel=0&playsinline=1`}
              title={video.name}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div ref={mount} className="absolute inset-0" />
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {index > 0 && !failed && <span>Main video unavailable, showing the backup.</span>}
          <a className="inline-flex min-h-11 items-center underline underline-offset-2" href={youtubeWatchUrl(currentId)} target="_blank" rel="noreferrer">
            Open in YouTube
          </a>
          <a className="inline-flex min-h-11 items-center underline underline-offset-2" href={youtubeSearchUrl(video.query)} target="_blank" rel="noreferrer">
            Find a different video
          </a>
        </div>
      </div>
    </div>
  );
}

/** One exercise line: the name opens the video, the sets and reps stay as text. */
export function ExerciseLine({ text, video }: { text: string; video: ExerciseVideo | null }) {
  const open = useOpenVideo();
  const play = useCallback(() => video && open(video), [open, video]);
  if (!video) return <>{text}</>;
  const comma = text.indexOf(", ");
  const name = comma > 0 ? text.slice(0, comma) : text;
  const rest = comma > 0 ? text.slice(comma) : "";
  return (
    <>
      <button type="button" onClick={play} className="inline text-left font-medium text-accent-ink underline decoration-dotted underline-offset-[3px] hover:decoration-solid" aria-label={`Watch ${video.name} video`}>
        <span aria-hidden className="mr-1 inline-block text-[0.7em] no-underline">▶</span>
        {name}
      </button>
      {rest}
    </>
  );
}
