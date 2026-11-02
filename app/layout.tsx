import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

// Font files live in app/fonts (latin subsets from Fontsource), so neither the page nor the build waits on Google.
// A stylesheet from fonts.googleapis.com blocked the first paint, so on a weak gym signal a relaunched home-screen
// app sat on a blank (dark) screen until Google answered; next/font/google then failed a Vercel build when Google did.
const display = localFont({
  src: [
    { path: "./fonts/barlow-condensed-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/barlow-condensed-latin-700-normal.woff2", weight: "700" },
  ],
  display: "swap",
  variable: "--font-display",
});
const body = localFont({
  src: [
    { path: "./fonts/figtree-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/figtree-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/figtree-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/figtree-latin-700-normal.woff2", weight: "700" },
  ],
  display: "swap",
  variable: "--font-body",
});
const mono = localFont({ src: "./fonts/jetbrains-mono-latin-500-normal.woff2", weight: "500", display: "swap", variable: "--font-mono" });

export const metadata: Metadata = {
  title: "WorkoutFlex",
  description: "Flexible running and strength training plan and log.",
  appleWebApp: { capable: true, title: "WorkoutFlex", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1319" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        {/* The page colour from the very first frame, before any stylesheet, so a relaunch never flashes another colour */}
        <style>{`html,body{background:#eef1f4}@media (prefers-color-scheme:dark){html,body{background:#0d1319}}`}</style>
      </head>
      <body>
        <div className="mx-auto flex max-w-[720px] flex-col gap-4">{children}</div>
        <ServiceWorker />
      </body>
    </html>
  );
}
