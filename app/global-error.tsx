"use client";

// Last resort when the layout itself fails: no app styles are guaranteed here, so keep it plain.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1>Something went wrong</h1>
        <p>Usually a dropped connection. Sets you ticked are kept on this phone.</p>
        <button style={{ minHeight: 44, padding: "0 16px", fontSize: 16 }} onClick={reset}>
          Try again
        </button>
      </body>
    </html>
  );
}
