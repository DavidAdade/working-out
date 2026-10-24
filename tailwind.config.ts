import type { Config } from "tailwindcss";

// Colors come from CSS variables in app/globals.css, so light and dark themes switch automatically.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        sunk: v("sunk"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        accent: v("accent"),
        "accent-ink": v("accent-ink"),
        "on-accent": v("on-accent"),
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
        area1: v("area1"),
        area2: v("area2"),
        area3: v("area3"),
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', "Arial", "sans-serif"],
        body: ["Figtree", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
