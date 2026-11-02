import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted at build time. A stylesheet from fonts.googleapis.com blocked the first paint, so on a weak gym
// signal a relaunched home-screen app sat on a blank (dark) screen until Google answered.
const display = Barlow_Condensed({ weight: ["600", "700"], subsets: ["latin"], display: "swap", variable: "--font-display" });
const body = Figtree({ weight: ["400", "500", "600", "700"], subsets: ["latin"], display: "swap", variable: "--font-body" });
const mono = JetBrains_Mono({ weight: "500", subsets: ["latin"], display: "swap", variable: "--font-mono" });

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
      </body>
    </html>
  );
}
