"use client";

// Anything that slips past the app's own error handling lands here instead of a blank "Application error".
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="card mt-8 items-start">
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted">Usually a dropped connection. Sets you ticked are kept on this phone and sync once you&apos;re back online.</p>
      <div className="flex gap-2">
        <button className="btn" onClick={reset}>
          Try again
        </button>
        <button className="btn-ghost" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </main>
  );
}
