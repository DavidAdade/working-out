import type { Metadata } from "next";
import OfflineApp from "@/components/OfflineApp";
import RetryButton from "./RetryButton";

// The page the service worker opens when the server can't be reached. Static and the same for everyone:
// the data comes from this phone (lib/offline.ts), never from the server.
export const dynamic = "force-static";
export const metadata: Metadata = { robots: { index: false } };

export default function OfflinePage() {
  return (
    <OfflineApp
      fallback={
        <main className="card mt-8 items-start">
          <h1 className="font-display text-2xl font-bold">No connection</h1>
          <p className="text-muted">Open WorkoutFlex once with a connection and it works offline after that. Sets you ticked are kept on this phone.</p>
          <RetryButton />
        </main>
      }
    />
  );
}
